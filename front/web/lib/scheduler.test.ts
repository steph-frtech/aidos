import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	AGENT_LEASE_FENCED,
	agentCanTransition,
	type Candidate,
	type ClaimContender,
	claim,
	detectStarvation,
	fence,
	headOf,
	type Layer,
	layerRank,
	matchRole,
	mirrorRank,
	mutationIsForbidden,
	type OrchestrationPolicy,
	pinForRun,
	type QueueEntry,
	resolveConflict,
	roleFor,
	SIGNAL_STILL_RED,
	schedule,
	scheduleTeam,
	UPDATE_COLUMNS,
	validatePolicy,
	type WorkItem,
} from "./scheduler";

// Reproducibility mirror (fast-check) for the BA20 scheduler CLAIM transition + fencing.
// Determinism-first: same (item, owner, leaseUntil) ⇒ same claimed item + assignment;
// the lease_epoch bump is monotone; open→claimed only; agent never transitions.

const openItem = (leaseEpoch: number): WorkItem => ({
	itemId: "i-1",
	status: "open",
	ownerAgent: "",
	leaseUntil: "",
	leaseEpoch,
});

describe("scheduler.claim — determinism + fencing (BA20)", () => {
	it("is deterministic: same input ⇒ same outputs", () => {
		fc.assert(
			fc.property(
				fc.nat({ max: 1_000_000 }),
				fc.string({ minLength: 1 }),
				(epoch, owner) => {
					const lease = "2026-06-03T12:00:00Z";
					const a = claim(openItem(epoch), owner, lease);
					const b = claim(openItem(epoch), owner, lease);
					expect(a).toEqual(b);
				},
			),
		);
	});

	it("bumps the lease_epoch monotonically by exactly 1 and pins it on the assignment", () => {
		fc.assert(
			fc.property(fc.nat({ max: 1_000_000 }), (epoch) => {
				const r = claim(
					openItem(epoch),
					"bdd-writer@v1",
					"2026-06-03T12:00:00Z",
				);
				expect(r.ok).toBe(true);
				expect(r.item?.status).toBe("claimed");
				expect(r.item?.leaseEpoch).toBe(epoch + 1);
				expect(r.assignment?.leaseEpoch).toBe(epoch + 1);
				expect(r.assignment?.statut).toBe("leased");
			}),
		);
	});

	it("only transitions an OPEN item; refuses claimed/blocked/resolved", () => {
		for (const status of ["claimed", "blocked", "resolved"] as const) {
			const r = claim(
				{ itemId: "x", status, ownerAgent: "", leaseUntil: "", leaseEpoch: 0 },
				"a@v1",
				"2026-06-03T12:00:00Z",
			);
			expect(r.ok).toBe(false);
			expect(r.error).toBe("not_open");
		}
	});

	it("refuses an empty owner or an empty lease (no arg-less clock)", () => {
		expect(claim(openItem(0), "", "2026-06-03T12:00:00Z").error).toBe(
			"empty_owner",
		);
		expect(claim(openItem(0), "a@v1", "").error).toBe("empty_lease");
	});

	it("writes exactly the four scheduler-writable transition columns", () => {
		expect([...UPDATE_COLUMNS]).toEqual([
			"status",
			"owner_agent",
			"lease_until",
			"lease_epoch",
		]);
	});

	it("the agent role NEVER transitions a work item (the wall)", () => {
		expect(agentCanTransition()).toBe(false);
	});
});

// Reproducibility mirror (fast-check) for BA21 — role-matching + starvation detector.
// Determinism-first: matching is an ALGORITHM over declared roles, never an LLM.

const LAYER_ARB = fc.constantFrom<string>(
	"mirror",
	"projection",
	"operation_action",
	"button",
	"garbage", // an unknown layer must be handled, never throw
);

const candidateArb: fc.Arbitrary<Candidate> = fc.record({
	ref: fc.string({ minLength: 1, maxLength: 8 }),
	role: fc.constantFrom("bdd-writer", "executor", "reviewer", ""),
	free: fc.boolean(),
});

describe("scheduler.matchRole — deterministic role-matching (BA21)", () => {
	it("is deterministic, total, and only ever matches the layer's declared role (the wall)", () => {
		fc.assert(
			fc.property(
				LAYER_ARB,
				fc.array(candidateArb, { maxLength: 6 }),
				(layer, agents) => {
					const a = matchRole(layer, agents);
					const b = matchRole(layer, agents);
					expect(a).toEqual(b);

					const [role, known] = roleFor(layer);
					if (!known) {
						expect(a.ok).toBe(false);
						return;
					}
					// Expected: lex-smallest free agent of the matching role.
					let want = "";
					let wantOk = false;
					for (const ag of agents) {
						if (ag.free && ag.role === role && (!wantOk || ag.ref < want)) {
							want = ag.ref;
							wantOk = true;
						}
					}
					expect(a.ok).toBe(wantOk);
					if (a.ok) {
						expect(a.ref).toBe(want);
						const chosen = agents.find((ag) => ag.ref === a.ref);
						expect(chosen?.free).toBe(true);
						expect(chosen?.role).toBe(role);
					}
				},
			),
		);
	});

	it("never matches a busy agent and never a wrong role", () => {
		const agents: Candidate[] = [
			{ ref: "a", role: "bdd-writer", free: false },
			{ ref: "b", role: "executor", free: true },
		];
		// mirror demands bdd-writer; the only bdd-writer is busy → no match.
		expect(matchRole("mirror", agents).ok).toBe(false);
		// projection demands executor; b is free → match b.
		expect(matchRole("projection", agents)).toEqual({ ok: true, ref: "b" });
	});
});

describe("scheduler.headOf — mirror-first head (BA21)", () => {
	it("is deterministic and returns the minimal-layerRank item", () => {
		const entryArb: fc.Arbitrary<QueueEntry> = fc.record({
			item: fc.record({
				itemId: fc.string({ minLength: 1, maxLength: 6 }),
				status: fc.constant<"open">("open"),
				ownerAgent: fc.constant(""),
				leaseUntil: fc.constant(""),
				leaseEpoch: fc.constant(0),
			}),
			layer: LAYER_ARB.filter(
				(l): l is Layer => l !== "garbage",
			) as fc.Arbitrary<Layer>,
		});
		fc.assert(
			fc.property(fc.array(entryArb, { maxLength: 8 }), (queue) => {
				const h1 = headOf(queue);
				const h2 = headOf(queue);
				expect(h1).toEqual(h2);
				if (queue.length === 0) {
					expect(h1).toBeUndefined();
					return;
				}
				if (h1 === undefined) {
					throw new Error("non-empty queue must have a head");
				}
				const headRankVal = layerRank(h1.layer);
				for (const e of queue) {
					expect(layerRank(e.layer)).toBeGreaterThanOrEqual(headRankVal);
				}
			}),
		);
	});
});

describe("scheduler.detectStarvation — anti-famine (BA21, gap E3)", () => {
	it("surfaces still_red iff the head is unmatched AND waited >= threshold", () => {
		fc.assert(
			fc.property(
				LAYER_ARB.filter(
					(l): l is Layer => l !== "garbage",
				) as fc.Arbitrary<Layer>,
				fc.array(candidateArb, { maxLength: 6 }),
				fc.integer({ min: 0, max: 50 }),
				fc.integer({ min: -3, max: 20 }),
				(layer, agents, ticks, threshold) => {
					const head: QueueEntry = {
						item: {
							itemId: "h",
							status: "open",
							ownerAgent: "",
							leaseUntil: "",
							leaseEpoch: 0,
						},
						layer,
					};
					const res = detectStarvation(head, agents, ticks, threshold);
					const matchable = matchRole(layer, agents).ok;
					const expected = threshold > 0 && !matchable && ticks >= threshold;
					expect(res.starving).toBe(expected);
					if (res.starving) {
						expect(res.signal?.class).toBe(SIGNAL_STILL_RED);
						expect(res.signal?.item).toBe("h");
						expect(res.signal?.ticksWaited).toBe(ticks);
						const [role] = roleFor(layer);
						expect(res.signal?.requiredRole).toBe(role);
					}
				},
			),
		);
	});

	it("is silent when threshold<=0 ('never starve')", () => {
		const head: QueueEntry = {
			item: {
				itemId: "h",
				status: "open",
				ownerAgent: "",
				leaseUntil: "",
				leaseEpoch: 0,
			},
			layer: "mirror",
		};
		expect(detectStarvation(head, [], 100, 0).starving).toBe(false);
		expect(detectStarvation(head, [], 100, -5).starving).toBe(false);
	});
});

// ── BA22 — the lease/expire ENGINE (schedule) + write-path FENCING (fence) ──────────────
// Reproducibility mirror (fast-check): same (queue, agents, now, leaseUntil) ⇒ same
// (queue, assignments); never leases a blocked item; expires stale leases; fence compares.

const NOW = "2026-06-03T12:00:00Z";
const PAST = "2026-06-03T11:00:00Z";
const FUTURE = "2026-06-03T13:00:00Z";
const LEASE = "2026-06-03T14:00:00Z";

describe("schedule — BA22 lease/expire engine", () => {
	it("is deterministic: same input ⇒ same output", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						itemId: fc.string({ minLength: 1, maxLength: 4 }),
						st: fc.constantFrom("open", "claimed", "blocked", "resolved"),
						layer: fc.constantFrom(
							"mirror",
							"projection",
							"operation_action",
							"button",
						),
						epoch: fc.integer({ min: 0, max: 9 }),
						live: fc.boolean(),
					}),
					{ maxLength: 5 },
				),
				(rows) => {
					// distinct ids — itemId is the PK of runtime.red_work_queue.
					const seen = new Set<string>();
					const queue: QueueEntry[] = rows.map((r, i) => {
						let id = `i${r.itemId}`;
						while (seen.has(id)) id += String(i);
						seen.add(id);
						return {
							item: {
								itemId: id,
								status: r.st as WorkItem["status"],
								ownerAgent: r.st === "claimed" ? "executor@v1" : "",
								leaseUntil: r.st === "claimed" ? (r.live ? FUTURE : PAST) : "",
								leaseEpoch: r.epoch,
							},
							layer: r.layer as Layer,
						};
					});
					const a = schedule(queue, [], NOW, LEASE);
					const b = schedule(queue, [], NOW, LEASE);
					expect(a).toEqual(b);
				},
			),
		);
	});

	it("never leases a blocked item (unresolved dependency)", () => {
		const queue: QueueEntry[] = [
			{
				item: {
					itemId: "m1",
					status: "open",
					ownerAgent: "",
					leaseUntil: "",
					leaseEpoch: 0,
				},
				layer: "mirror",
			},
			{
				item: {
					itemId: "p1",
					status: "open",
					ownerAgent: "",
					leaseUntil: "",
					leaseEpoch: 0,
				},
				layer: "projection",
				dependencies: ["m1"], // m1 is not resolved → p1 blocks
			},
		];
		const agents: Candidate[] = [
			{ ref: "bdd-writer@v1", role: "bdd-writer", free: true },
			{ ref: "executor@v1", role: "executor", free: true },
		];
		const out = schedule(queue, agents, NOW, LEASE);
		const p1 = out.queue.find((e) => e.item.itemId === "p1");
		expect(p1?.item.status).toBe("blocked");
		expect(p1?.item.ownerAgent).toBe("");
		const m1 = out.queue.find((e) => e.item.itemId === "m1");
		expect(m1?.item.status).toBe("claimed");
		expect(m1?.item.ownerAgent).toBe("bdd-writer@v1");
		expect(m1?.item.leaseEpoch).toBe(1);
	});

	it("expires a stale lease (claimed→open) and surfaces an expired assignment", () => {
		const queue: QueueEntry[] = [
			{
				item: {
					itemId: "x1",
					status: "claimed",
					ownerAgent: "executor@v1",
					leaseUntil: PAST,
					leaseEpoch: 3,
				},
				layer: "projection",
			},
		];
		const out = schedule(queue, [], NOW, LEASE);
		const x1 = out.queue.find((e) => e.item.itemId === "x1");
		expect(x1?.item.status).toBe("open");
		expect(x1?.item.ownerAgent).toBe("");
		expect(x1?.item.leaseUntil).toBe("");
		expect(x1?.item.leaseEpoch).toBe(3); // monotone — not reset
		expect(
			out.assignments.some(
				(a) => a.redWorkItem === "x1" && a.statut === "expired",
			),
		).toBe(true);
	});

	it("keeps a still-live lease untouched", () => {
		const queue: QueueEntry[] = [
			{
				item: {
					itemId: "x1",
					status: "claimed",
					ownerAgent: "executor@v1",
					leaseUntil: FUTURE,
					leaseEpoch: 5,
				},
				layer: "projection",
			},
		];
		const out = schedule(queue, [], NOW, LEASE);
		const x1 = out.queue.find((e) => e.item.itemId === "x1");
		expect(x1?.item.status).toBe("claimed");
		expect(x1?.item.leaseEpoch).toBe(5);
		expect(out.assignments.length).toBe(0);
	});

	it("is idempotent on a settled queue", () => {
		const queue: QueueEntry[] = [
			{
				item: {
					itemId: "m1",
					status: "open",
					ownerAgent: "",
					leaseUntil: "",
					leaseEpoch: 0,
				},
				layer: "mirror",
			},
		];
		const agents: Candidate[] = [
			{ ref: "bdd-writer@v1", role: "bdd-writer", free: true },
		];
		const out1 = schedule(queue, agents, NOW, LEASE);
		const out2 = schedule(out1.queue, agents, NOW, LEASE);
		expect(out2.queue).toEqual(out1.queue);
		expect(out2.assignments.length).toBe(0);
	});
});

describe("fence — BA22 write-path fencing", () => {
	it("equal epoch is LIVE; non-equal is fenced (AGENT_LEASE_FENCED)", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 1000 }),
				fc.integer({ min: 0, max: 1000 }),
				(write, current) => {
					const v = fence(write, current);
					if (write === current) {
						expect(v.ok).toBe(true);
						expect(v.code).toBeUndefined();
					} else {
						expect(v.ok).toBe(false);
						expect(v.code).toBe(AGENT_LEASE_FENCED);
						expect((v.howToFix ?? []).length).toBeGreaterThan(0);
					}
				},
			),
		);
	});
});

// BA24 — reproducibility mirror for the OrchestrationPolicy / per-run immutability /
// ResolveConflict twins. Determinism-first: same input ⇒ same output; the conflict is
// resolved BY RULE (total order), never by a race or a coin-flip; zero lost update.

const goodPolicy = (maxConcurrency: number): OrchestrationPolicy => ({
	claimArbitrage: "serialise_then_merge",
	fanOut: "parallel",
	fanIn: "pipeline",
	conflitMemeFichier: "serialise_then_merge",
	maxConcurrency,
	capsParRole: [{ role: "executor", cap: 1 }],
});

const arbContender: fc.Arbitrary<ClaimContender> = fc.record({
	agent: fc.constantFrom("a@v1", "b@v1", "c@v1"),
	target: fc.constantFrom("file-x", "file-y"),
	layer: fc.constantFrom(
		"mirror",
		"projection",
		"operation_action",
		"button",
		"??",
	),
	contentHash: fc.constantFrom("00", "ab", "ff"),
});

describe("BA24 — validatePolicy (kind-aware shape, gap F1)", () => {
	it("accepts a well-formed policy bounded by the spec knob", () => {
		expect(validatePolicy(goodPolicy(2), 4).ok).toBe(true);
		expect(validatePolicy(goodPolicy(0), 0).ok).toBe(true); // 0 spec = unbounded by spec
	});

	it("rejects a phantom cap (policy > spec)", () => {
		expect(validatePolicy(goodPolicy(5), 1).ok).toBe(false);
	});

	it("rejects an unknown enum (closed taxonomy)", () => {
		const bad = { ...goodPolicy(1), fanOut: "wild" as never };
		expect(validatePolicy(bad, 4).ok).toBe(false);
	});

	it("rejects a negative cap (fail-closed)", () => {
		const bad = { ...goodPolicy(1), maxConcurrency: -1 };
		expect(validatePolicy(bad, 4).ok).toBe(false);
	});
});

describe("BA24 — per-run immutability (gap F3)", () => {
	it("pins a non-empty version and refuses an empty one", () => {
		expect(pinForRun("run-1", "ver-abc")).not.toBeNull();
		expect(pinForRun("run-1", "   ")).toBeNull();
	});

	it("flags a diverging live version as a forbidden mid-run edit", () => {
		const pin = pinForRun("run-1", "ver-abc");
		expect(pin).not.toBeNull();
		if (pin) {
			expect(mutationIsForbidden(pin, "ver-abc")).toBe(false);
			expect(mutationIsForbidden(pin, "ver-XYZ")).toBe(true);
		}
	});
});

describe("BA24 — resolveConflict (zero-lost-update, total, symmetric)", () => {
	it("is deterministic, symmetric and never discards the loser", () => {
		fc.assert(
			fc.property(arbContender, arbContender, (a, b) => {
				const r1 = resolveConflict(a, b);
				const r2 = resolveConflict(a, b);
				expect(r2).toEqual(r1); // deterministic
				// symmetric — same winner regardless of argument order
				const swap = resolveConflict(b, a);
				expect(swap.winner).toEqual(r1.winner);
				// zero-lost-update — loser surfaced, next action always serialise+merge
				expect(r1.nextAction).toBe("serialise_then_merge");
				// winner & loser are exactly the two inputs (no invented third value)
				const pool = [r1.winner, r1.loser];
				expect(pool).toContainEqual(a);
				expect(pool).toContainEqual(b);
				// mirror-first: the winner never ranks worse than the loser
				expect(mirrorRank(r1.winner.layer)).toBeLessThanOrEqual(
					mirrorRank(r1.loser.layer),
				);
				// sameTarget is exactly target equality
				expect(r1.sameTarget).toBe(a.target === b.target);
			}),
		);
	});

	it("mirror-first beats a button layer; then content-hash decides", () => {
		const mirror: ClaimContender = {
			agent: "z@v1",
			target: "f",
			layer: "mirror",
			contentHash: "ff",
		};
		const button: ClaimContender = {
			agent: "a@v1",
			target: "f",
			layer: "button",
			contentHash: "00",
		};
		expect(resolveConflict(button, mirror).winner).toEqual(mirror);

		const lo: ClaimContender = {
			agent: "z@v1",
			target: "f",
			layer: "projection",
			contentHash: "00",
		};
		const hi: ClaimContender = {
			agent: "a@v1",
			target: "f",
			layer: "projection",
			contentHash: "ff",
		};
		expect(resolveConflict(hi, lo).winner).toEqual(lo);
	});
});

// ─── BA25 — scheduleTeam (multi-agent coordination) reproducibility mirror ───────────

const teamPol = (maxConcurrency: number): OrchestrationPolicy => ({
	claimArbitrage: "serialise_then_merge",
	fanOut: "parallel",
	fanIn: "sequential",
	conflitMemeFichier: "serialise_then_merge",
	maxConcurrency,
	capsParRole: [],
});

const TEAM_NOW = "2026-06-04T12:00:00Z";
const TEAM_LEASE = "2026-06-04T13:00:00Z";

const twoRoleRoster = (): Candidate[] => [
	{ ref: "bdd-writer@v1", role: "bdd-writer", free: true },
	{ ref: "executor@v1", role: "executor", free: true },
];

describe("scheduleTeam — multi-agent coordination (BA25)", () => {
	it("hand-off across distinct roles: A leases, B blocked, then B leases after A resolves", () => {
		const q: QueueEntry[] = [
			{
				item: {
					itemId: "A",
					status: "open",
					ownerAgent: "",
					leaseUntil: "",
					leaseEpoch: 0,
				},
				layer: "mirror",
			},
			{
				item: {
					itemId: "B",
					status: "open",
					ownerAgent: "",
					leaseUntil: "",
					leaseEpoch: 0,
				},
				layer: "projection",
				dependencies: ["A"],
			},
		];
		const out = scheduleTeam(
			q,
			twoRoleRoster(),
			teamPol(2),
			TEAM_NOW,
			TEAM_LEASE,
		);
		const a = out.queue.find((e) => e.item.itemId === "A");
		const b = out.queue.find((e) => e.item.itemId === "B");
		expect(a?.item.status).toBe("claimed");
		expect(a?.item.ownerAgent).toBe("bdd-writer@v1");
		expect(b?.item.status).toBe("blocked");

		// A resolves → next tick B leases to the executor.
		const q2: QueueEntry[] = [
			{
				item: {
					itemId: "A",
					status: "resolved",
					ownerAgent: "",
					leaseUntil: "",
					leaseEpoch: 1,
				},
				layer: "mirror",
			},
			{
				item: {
					itemId: "B",
					status: "blocked",
					ownerAgent: "",
					leaseUntil: "",
					leaseEpoch: 0,
				},
				layer: "projection",
				dependencies: ["A"],
			},
		];
		const out2 = scheduleTeam(
			q2,
			twoRoleRoster(),
			teamPol(2),
			TEAM_NOW,
			TEAM_LEASE,
		);
		const b2 = out2.queue.find((e) => e.item.itemId === "B");
		expect(b2?.item.status).toBe("claimed");
		expect(b2?.item.ownerAgent).toBe("executor@v1");
	});

	it("never exceeds MaxConcurrency", () => {
		const q: QueueEntry[] = [
			{
				item: {
					itemId: "p1",
					status: "open",
					ownerAgent: "",
					leaseUntil: "",
					leaseEpoch: 0,
				},
				layer: "projection",
			},
			{
				item: {
					itemId: "p2",
					status: "open",
					ownerAgent: "",
					leaseUntil: "",
					leaseEpoch: 0,
				},
				layer: "projection",
			},
			{
				item: {
					itemId: "p3",
					status: "open",
					ownerAgent: "",
					leaseUntil: "",
					leaseEpoch: 0,
				},
				layer: "projection",
			},
		];
		const roster: Candidate[] = [
			{ ref: "executor@a", role: "executor", free: true },
			{ ref: "executor@b", role: "executor", free: true },
			{ ref: "executor@c", role: "executor", free: true },
		];
		const out = scheduleTeam(q, roster, teamPol(1), TEAM_NOW, TEAM_LEASE);
		const live = out.queue.filter((e) => e.item.status === "claimed").length;
		expect(live).toBe(1);
		expect(out.queue.find((e) => e.item.itemId === "p1")?.item.status).toBe(
			"claimed",
		);
	});

	it("serialises a same-target conflict: winner leases, loser waits (zero lost-update)", () => {
		const q: QueueEntry[] = [
			{
				item: {
					itemId: "x1",
					status: "open",
					ownerAgent: "",
					leaseUntil: "",
					leaseEpoch: 0,
				},
				layer: "projection",
				target: "src/foo.go",
			},
			{
				item: {
					itemId: "x2",
					status: "open",
					ownerAgent: "",
					leaseUntil: "",
					leaseEpoch: 0,
				},
				layer: "operation_action",
				target: "src/foo.go",
			},
		];
		const roster: Candidate[] = [
			{ ref: "executor@a", role: "executor", free: true },
			{ ref: "executor@b", role: "executor", free: true },
		];
		const out = scheduleTeam(q, roster, teamPol(2), TEAM_NOW, TEAM_LEASE);
		const live = out.queue.filter((e) => e.item.status === "claimed").length;
		expect(live).toBe(1);
		expect(out.queue.find((e) => e.item.itemId === "x1")?.item.status).toBe(
			"claimed",
		);
		expect(out.queue.find((e) => e.item.itemId === "x2")?.item.status).toBe(
			"open",
		);
		expect(out.conflicts).toHaveLength(1);
		expect(out.conflicts[0].sameTarget).toBe(true);
		expect(out.conflicts[0].nextAction).toBe("serialise_then_merge");
	});

	it("is deterministic (property): same inputs ⇒ identical result", () => {
		const layerArb = fc.constantFrom<Layer>(
			"mirror",
			"projection",
			"operation_action",
			"button",
		);
		// A claimed item carries a lease_until (live or expired) — same shape as the Go
		// drawQueue generator; an open/blocked/resolved item carries none. (A claimed item
		// with no lease is malformed input the scheduler never produces, so it is excluded.)
		const entryArb = fc
			.record({
				itemId: fc.string({ minLength: 1, maxLength: 4 }),
				status: fc.constantFrom(
					"open",
					"claimed",
					"blocked",
					"resolved",
				) as fc.Arbitrary<WorkItem["status"]>,
				leaseEpoch: fc.nat(9),
				// half live (> now), half expired (< now) for claimed items.
				live: fc.boolean(),
				target: fc.constantFrom("", "", "src/a.go", "src/b.go"),
				layer: layerArb,
			})
			.map((r): QueueEntry => {
				const claimed = r.status === "claimed";
				return {
					item: {
						itemId: r.itemId,
						status: r.status,
						ownerAgent: claimed ? "executor@v1" : "",
						leaseUntil: claimed
							? r.live
								? "2026-06-04T15:00:00Z"
								: "2026-06-04T09:00:00Z"
							: "",
						leaseEpoch: r.leaseEpoch,
					},
					layer: r.layer,
					// a pre-claimed item gets a UNIQUE live target (two pre-claimed items on
					// one target is malformed input the scheduler never produces); open items
					// share a target to exercise the conflict path.
					target: claimed ? `claimed-${r.itemId}` : r.target,
				};
			});
		fc.assert(
			fc.property(
				fc.array(entryArb, { maxLength: 5 }),
				fc.nat(4),
				(entries, cap) => {
					// ensure distinct item ids (the queue PK).
					const seen = new Set<string>();
					const q = entries.filter((e) => {
						if (seen.has(e.item.itemId)) return false;
						seen.add(e.item.itemId);
						return true;
					});
					const roster: Candidate[] = [
						{ ref: "bdd-writer@v1", role: "bdd-writer", free: true },
						{ ref: "executor@v1", role: "executor", free: true },
					];
					const a = scheduleTeam(q, roster, teamPol(cap), TEAM_NOW, TEAM_LEASE);
					const b = scheduleTeam(q, roster, teamPol(cap), TEAM_NOW, TEAM_LEASE);
					expect(a).toEqual(b);
					// gap F1: the scheduler never CREATES a lease past the cap. The ceiling is
					// max(cap, preLive) — a sub-cap queue stays ≤ cap, an already-over-cap input
					// (malformed) is never made worse.
					const preLive = q.filter(
						(e) => e.item.status === "claimed" && e.item.leaseUntil >= TEAM_NOW,
					).length;
					const live = a.queue.filter(
						(e) => e.item.status === "claimed",
					).length;
					if (cap > 0) expect(live).toBeLessThanOrEqual(Math.max(cap, preLive));
					// at most one live lease per non-empty target.
					const perTarget = new Map<string, number>();
					for (const e of a.queue) {
						if (e.item.status === "claimed" && e.target) {
							perTarget.set(e.target, (perTarget.get(e.target) ?? 0) + 1);
							expect(perTarget.get(e.target)).toBeLessThanOrEqual(1);
						}
					}
				},
			),
		);
	});
});
