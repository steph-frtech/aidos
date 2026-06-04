/**
 * Scheduler — the PURE projection of back/runtime/scheduler (AIDOS step BA20). The
 * scheduler is the distinct role that alone TRANSITIONS a RedWorkItem (open→claimed),
 * stamping owner_agent, lease_until and a monotone lease_epoch (the fencing token, gap
 * E2). The agent role CANNOT transition (the wall — INSERT+SELECT only). This twin
 * mirrors the Go `Claim` core verbatim.
 *
 * Determinism-first (CLAUDE.md §6/§8): `claim` is a pure, total function — no clock
 * (leaseUntil is SUPPLIED), no rng, no I/O. Same (item, owner, leaseUntil) ⇒ same
 * claimed item + same assignment. The epoch bump is a DECLARED rule (prev+1), never
 * learned. The fast-check reproducibility mirror (scheduler.test.ts) pins it.
 */

/** The closed RedWorkItem lifecycle (S22 §49.4). */
export const ITEM_STATUSES = [
	"open",
	"claimed",
	"blocked",
	"resolved",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** The closed AgentAssignment status (mirrors the S52 enum). */
export const ASSIGNMENT_STATUSES = [
	"leased",
	"running",
	"released",
	"expired",
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

/**
 * The exact, ordered set of runtime.red_work_queue columns the scheduler role (and
 * ONLY it) may write — the TS mirror of the column-scoped GRANT in
 * scheduler_role_baseline.sql and of the Go `UpdateColumns`.
 */
export const UPDATE_COLUMNS = [
	"status",
	"owner_agent",
	"lease_until",
	"lease_epoch",
] as const;

/** The scheduler's view of one runtime.red_work_queue row (transition fields only). */
export interface WorkItem {
	itemId: string;
	status: ItemStatus;
	ownerAgent: string;
	leaseUntil: string;
	leaseEpoch: number;
}

/**
 * AgentAssignment — a lease of a RedWorkItem to an agent, carrying the LeaseEpoch
 * fencing token. NO `version`, NO `mirror` field: a lease is a runtime event, not a
 * layer (the type makes that unrepresentable, like the Go struct).
 */
export interface AgentAssignment {
	agent: string;
	redWorkItem: string;
	leaseJusqua: string;
	leaseEpoch: number;
	statut: AssignmentStatus;
}

/** The closed result of a claim attempt. */
export interface ClaimResult {
	ok: boolean;
	item?: WorkItem;
	assignment?: AgentAssignment;
	error?: "not_open" | "empty_owner" | "empty_lease";
}

/**
 * claim — the PURE, TOTAL open→claimed transition the scheduler applies. It stamps a
 * BUMPED, monotone lease_epoch (prev+1, the fencing token) and returns the claimed
 * item AND the AgentAssignment pinned at that epoch. It refuses (ok=false, never
 * throws) a non-open item, an empty owner, or an empty lease (no arg-less clock).
 */
export function claim(
	item: WorkItem,
	owner: string,
	leaseUntil: string,
): ClaimResult {
	if (item.status !== "open") {
		return { ok: false, error: "not_open" };
	}
	if (owner === "") {
		return { ok: false, error: "empty_owner" };
	}
	if (leaseUntil === "") {
		return { ok: false, error: "empty_lease" };
	}
	const epoch = item.leaseEpoch + 1; // monotone bump — the fencing token (declared rule)
	const claimed: WorkItem = {
		itemId: item.itemId,
		status: "claimed",
		ownerAgent: owner,
		leaseUntil,
		leaseEpoch: epoch,
	};
	const assignment: AgentAssignment = {
		agent: owner,
		redWorkItem: item.itemId,
		leaseJusqua: leaseUntil,
		leaseEpoch: epoch,
		statut: "leased",
	};
	return { ok: true, item: claimed, assignment };
}

/**
 * agentCanTransition — the wall, projected: the agent role NEVER transitions a work
 * item (INSERT+SELECT only; the scheduler alone UPDATEs). Always false — a structural
 * fact, not a toggle. The GRANT in the migration enforces it in Postgres; this is the
 * UI-readable assertion.
 */
export function agentCanTransition(): boolean {
	return false;
}

/* ──────────────────────────────────────────────────────────────────────────
 * BA21 — deterministic ROLE-MATCHING (matchRole) + the STARVATION detector.
 * The TS twin of back/runtime/scheduler/matchrole.go, verbatim. Determinism-first
 * (§6/§8): matching is an ALGORITHM over DECLARED roles, never an LLM. The Layer→role
 * map and the LayerRank are declared constants (above the line); the tie-break is a total
 * order (lex-smallest free matching ref). The fast-check mirror pins reproducibility.
 * ────────────────────────────────────────────────────────────────────────── */

/** The closed render-layer set (mirror-first order, §42/§98). */
export const LAYERS = [
	"mirror",
	"projection",
	"operation_action",
	"button",
] as const;
export type Layer = (typeof LAYERS)[number];

/**
 * layerRank — the canonical mirror-first rank: mirror(0) < projection(1) <
 * operation_action(2) < button(3). Any unknown layer ranks LAST (4) so a malformed layer
 * never jumps ahead of the mirror. Declared, never learned.
 */
export function layerRank(l: string): number {
	switch (l) {
		case "mirror":
			return 0;
		case "projection":
			return 1;
		case "operation_action":
			return 2;
		case "button":
			return 3;
		default:
			return 4;
	}
}

/** The DECLARED Layer→required-role map (never learned). */
const LAYER_ROLE: Record<string, string> = {
	mirror: "bdd-writer",
	projection: "executor",
	operation_action: "executor",
	button: "executor",
};

/**
 * roleFor — the role a layer requires, and whether the layer is known. An unknown layer
 * ⇒ ["", false]: no agent matches it (fail-closed; the scheduler never invents a role).
 */
export function roleFor(l: string): [string, boolean] {
	const r = LAYER_ROLE[l];
	return r === undefined ? ["", false] : [r, true];
}

/** A CoucheAgent candidate the matcher may pick (gap E4 projection of kernel.agent_layer). */
export interface Candidate {
	ref: string; // the CoucheAgent @version (the chosen owner)
	role: string; // the DECLARED Spec.Role
	free: boolean; // true ⇒ no live lease; only a free agent may be matched
}

/** The closed result of a role-match. */
export interface MatchResult {
	ok: boolean;
	ref: string; // the chosen agent @version when ok; "" otherwise
}

/**
 * matchRole — maps a work item (by its layer) to the agent the scheduler should lease it
 * to, BY DECLARED ROLE. Pure + total: returns the lex-smallest FREE agent whose Role
 * equals the layer's required role, else { ok:false }. Never a wrong-role fallback (the
 * wall), never a busy agent, never a throw. Same input ⇒ same result.
 */
export function matchRole(layer: string, agents: Candidate[]): MatchResult {
	const [role, known] = roleFor(layer);
	if (!known) {
		return { ok: false, ref: "" };
	}
	let best = "";
	let found = false;
	for (const a of agents) {
		if (!a.free || a.role !== role) {
			continue;
		}
		if (!found || a.ref < best) {
			best = a.ref;
			found = true;
		}
	}
	return found ? { ok: true, ref: best } : { ok: false, ref: "" };
}

/** One open queue row + its layer (the WorkItem view omits the layer). */
export interface QueueEntry {
	item: WorkItem;
	layer: Layer;
	/**
	 * The item ids this item depends on (the JSONB `dependencies` column, S22). The
	 * BA22 engine leases an item ONLY when every dependency is `resolved`; otherwise it
	 * surfaces the item `blocked`. Absent/empty ⇒ no dependency gate.
	 */
	dependencies?: string[];
	/**
	 * The render target (e.g. the file path) this item produces. Two items naming the SAME
	 * target conflict: BA25's scheduleTeam serialises them (resolveConflict picks who passes
	 * first, the other WAITS — zero lost-update). Absent/empty ⇒ no target contention.
	 */
	target?: string;
}

/**
 * headOf — the mirror-first HEAD of a queue: the lowest-layerRank item, ties broken by
 * item id (a total order). Empty queue ⇒ undefined. Pure + total; does not mutate.
 */
export function headOf(queue: QueueEntry[]): QueueEntry | undefined {
	if (queue.length === 0) {
		return undefined;
	}
	const sorted = [...queue].sort((a, b) => {
		const ra = layerRank(a.layer);
		const rb = layerRank(b.layer);
		if (ra !== rb) {
			return ra - rb;
		}
		return a.item.itemId < b.item.itemId
			? -1
			: a.item.itemId > b.item.itemId
				? 1
				: 0;
	});
	return sorted[0];
}

/** The still_red-class anti-famine signal (gap E3). */
export const SIGNAL_STILL_RED = "still_red" as const;

/** The StarvationSignal — a runtime SIGNAL (not truth), feeding the BA28 on-ramp. */
export interface StarvationSignal {
	class: typeof SIGNAL_STILL_RED;
	item: string;
	layer: Layer;
	requiredRole: string;
	ticksWaited: number;
}

/** The closed result of the starvation detector. */
export interface StarvationResult {
	starving: boolean;
	signal?: StarvationSignal;
}

/**
 * detectStarvation — the PURE anti-famine detector (gap E3). Surfaces a still_red signal
 * iff the mirror-first head CANNOT be matched right now AND it has waited >= threshold
 * ticks. Silent when the head is matchable (staffing resolves it, any wait) or when
 * threshold<=0 ("never starve"). ticksWaited is SUPPLIED (the impure tick driver counts);
 * the threshold is DECLARED, never learned. No clock, no throw.
 */
export function detectStarvation(
	head: QueueEntry,
	agents: Candidate[],
	ticksWaited: number,
	threshold: number,
): StarvationResult {
	if (threshold <= 0) {
		return { starving: false };
	}
	if (matchRole(head.layer, agents).ok) {
		return { starving: false };
	}
	if (ticksWaited < threshold) {
		return { starving: false };
	}
	const [role] = roleFor(head.layer);
	return {
		starving: true,
		signal: {
			class: SIGNAL_STILL_RED,
			item: head.item.itemId,
			layer: head.layer,
			requiredRole: role,
			ticksWaited,
		},
	};
}

/* ──────────────────────────────────────────────────────────────────────────
 * BA22 — the lease/expire ENGINE (schedule) + write-path FENCING (fence).
 * The TS twin of back/runtime/scheduler/lease.go, verbatim. Determinism-first
 * (§6/§8): `schedule` is a PURE, total function of (queue, agents, now, leaseUntil) — no
 * clock (now is SUPPLIED by the tick driver, the only impure shell), no rng, no I/O. Same
 * input ⇒ same (queue, assignments). The expire rule (lease_until < now), the dependency
 * gate (all deps resolved), and the staffing choice (mirror-first head, role-matched,
 * lex-smallest free agent) are DECLARED rules — never an LLM judgment. The fast-check
 * reproducibility mirror pins it. `fence` is the deterministic epoch comparator.
 * ────────────────────────────────────────────────────────────────────────── */

/** The hand-off `schedule` returns: the queue after this tick + the assignments it made. */
export interface ScheduleResult {
	queue: QueueEntry[];
	assignments: AgentAssignment[];
}

/** True iff every dependency id is in the resolved set. No deps ⇒ true. */
function depsResolved(
	deps: string[] | undefined,
	resolved: Set<string>,
): boolean {
	if (!deps) {
		return true;
	}
	for (const d of deps) {
		if (!resolved.has(d)) {
			return false;
		}
	}
	return true;
}

/**
 * schedule — the PURE lease/expire planner for ONE tick. Rules, in order:
 *   1. EXPIRE — every claimed item whose lease_until is non-empty and < now is reclaimed
 *      (claimed→open, owner+lease dropped); its dead lease surfaces an `expired`
 *      assignment. This is the anti-dead-agent reclaim (gap E1): at the tick, no human.
 *   2. BLOCK/UNBLOCK — an open/blocked item whose dependencies are not ALL resolved is
 *      surfaced `blocked`; one whose deps are all resolved becomes leasable.
 *   3. LEASE — the mirror-first head of the leasable open items is staffed to its
 *      role-matched agent (lex-smallest free agent of the role); that agent is then busy
 *      for the rest of the tick. Repeats until no leasable head can be staffed.
 *
 * It never leases a blocked item, never claims for the agent role, never throws. The
 * epoch is MONOTONE across reclaim (not reset). Assignments come back in a stable
 * (itemId, statut) order. `now` is SUPPLIED — no arg-less clock.
 */
export function schedule(
	queue: QueueEntry[],
	agents: Candidate[],
	now: string,
	leaseUntil: string,
): ScheduleResult {
	const out: QueueEntry[] = queue.map((e) => ({
		item: { ...e.item },
		layer: e.layer,
		dependencies: e.dependencies,
	}));
	const assignments: AgentAssignment[] = [];

	// (1) EXPIRE stale leases — reclaim dead-agent items without human action.
	for (const e of out) {
		const it = e.item;
		if (
			it.status === "claimed" &&
			it.leaseUntil !== "" &&
			it.leaseUntil < now
		) {
			assignments.push({
				agent: it.ownerAgent,
				redWorkItem: it.itemId,
				leaseJusqua: it.leaseUntil,
				leaseEpoch: it.leaseEpoch,
				statut: "expired",
			});
			e.item = {
				itemId: it.itemId,
				status: "open",
				ownerAgent: "",
				leaseUntil: "",
				leaseEpoch: it.leaseEpoch, // monotone — NOT reset on reclaim (fencing)
			};
		}
	}

	// resolved set (after expiry — expiry never produces a resolved).
	const resolved = new Set<string>();
	for (const e of out) {
		if (e.item.status === "resolved") {
			resolved.add(e.item.itemId);
		}
	}

	// (2) BLOCK/UNBLOCK — recompute the dependency gate for open/blocked items.
	for (const e of out) {
		const st = e.item.status;
		if (st !== "open" && st !== "blocked") {
			continue;
		}
		if (depsResolved(e.dependencies, resolved)) {
			if (st === "blocked") {
				e.item.status = "open"; // unblocked: deps are now all resolved
			}
		} else {
			e.item.status = "blocked";
		}
	}

	// (3) LEASE — staff leasable open items mirror-first, role-matched, greedily.
	const roster: Candidate[] = agents.map((a) => ({ ...a }));
	for (;;) {
		const leasable = out.filter((e) => e.item.status === "open");
		const head = headOf(leasable);
		if (head === undefined) {
			break;
		}
		const m = matchRole(head.layer, roster);
		if (!m.ok) {
			break; // the mirror-first head cannot be staffed → stop (anti-famine surfaces it)
		}
		const c = claim(head.item, m.ref, leaseUntil);
		if (!c.ok || !c.item || !c.assignment) {
			break; // defensive: headOf only yields open items, unreachable
		}
		const target = out.find((e) => e.item.itemId === head.item.itemId);
		if (target) {
			target.item = c.item;
		}
		assignments.push(c.assignment);
		const chosen = roster.find((a) => a.ref === m.ref);
		if (chosen) {
			chosen.free = false; // busy for the rest of this tick
		}
	}

	assignments.sort((a, b) => {
		if (a.redWorkItem !== b.redWorkItem) {
			return a.redWorkItem < b.redWorkItem ? -1 : 1;
		}
		return a.statut < b.statut ? -1 : a.statut > b.statut ? 1 : 0;
	});
	return { queue: out, assignments };
}

/** The AGENT_LEASE_FENCED code (S13), refused at the write-path on a stale epoch. */
export const AGENT_LEASE_FENCED = "AGENT_LEASE_FENCED" as const;

/** The verdict of the write-path epoch fence: ok, or a refusal naming the door out. */
export interface FenceVerdict {
	ok: boolean;
	code?: typeof AGENT_LEASE_FENCED;
	howToFix?: string[];
}

/**
 * fence — the deterministic write-path FENCING comparator (gap E2). An agent write carries
 * the lease_epoch it was granted; the item's CURRENT lease_epoch is the truth.
 *   - writeEpoch === currentEpoch ⇒ LIVE: the write may land (ok).
 *   - writeEpoch <   currentEpoch ⇒ STALE: re-leased since (woken-late agent) — refused
 *     with AGENT_LEASE_FENCED to prevent a lost update.
 *   - writeEpoch >   currentEpoch ⇒ IMPOSSIBLE: no write bears a future epoch — refused.
 * It is the TS mirror of the scheduler-role UPDATE's `WHERE lease_epoch = $writeEpoch`
 * guard and of the Go `Fence`: the same deterministic compare, never an LLM judgment.
 */
export function fence(writeEpoch: number, currentEpoch: number): FenceVerdict {
	if (writeEpoch === currentEpoch) {
		return { ok: true };
	}
	return {
		ok: false,
		code: AGENT_LEASE_FENCED,
		howToFix: [
			"Re-fetch the item: its lease was reclaimed and re-leased — your epoch is stale.",
			"Stop writing under the old lease; re-acquire it via the scheduler before retrying.",
		],
	};
}

/* ===========================================================================
 * BA24 — OrchestrationPolicy + kind-aware Validate + per-run immutability +
 * ResolveConflict (zero-lost-update). The PURE TS twin of
 * back/kernel/agentlayer/orchestration.go — same total order, same enums, same
 * verdicts. Determinism-first (CLAUDE.md §6/§8): no clock, no rng, no I/O; same
 * input ⇒ same output (the fast-check reproducibility mirror pins it).
 * =========================================================================== */

/** The closed fan-out/fan-in coordination shapes (mirrors the Go FanMode set). */
export const FAN_MODES = ["sequential", "parallel", "pipeline"] as const;
export type FanMode = (typeof FAN_MODES)[number];

/**
 * The closed same-file conflict policy set. The ONLY zero-lost-update policy is
 * serialise_then_merge (one lease at a time, then merge-semantic). A coin-flip /
 * discard-the-loser policy is NOT in the set — it would lose an update.
 */
export const CONFLICT_POLICIES = ["serialise_then_merge"] as const;
export type SameFileConflictPolicy = (typeof CONFLICT_POLICIES)[number];

/** A per-role concurrency cap inside an orchestration (≥ 0; 0 = no lease for that role). */
export interface RoleCap {
	role: string;
	cap: number;
}

/** The coordination rules of a LayerKindOrchestration (mirrors the Go OrchestrationPolicy). */
export interface OrchestrationPolicy {
	claimArbitrage: SameFileConflictPolicy;
	fanOut: FanMode;
	fanIn: FanMode;
	conflitMemeFichier: SameFileConflictPolicy;
	maxConcurrency: number;
	capsParRole: RoleCap[];
}

/** The verdict of validating an OrchestrationPolicy (fail-closed). */
export interface PolicyVerdict {
	ok: boolean;
	reason?: string;
}

/**
 * validatePolicy — the PURE, TOTAL, fail-closed guard of an OrchestrationPolicy. It is
 * kind-aware via its caller. specMaxConcurrency is the BA01 spec knob: the policy cap may
 * NOT exceed it (gap F1 — never a phantom). A spec knob of 0 = "unbounded by the spec".
 */
export function validatePolicy(
	p: OrchestrationPolicy,
	specMaxConcurrency: number,
): PolicyVerdict {
	if (!CONFLICT_POLICIES.includes(p.claimArbitrage)) {
		return {
			ok: false,
			reason: `unknown claim_arbitrage: ${p.claimArbitrage}`,
		};
	}
	if (!CONFLICT_POLICIES.includes(p.conflitMemeFichier)) {
		return {
			ok: false,
			reason: `unknown conflit_meme_fichier: ${p.conflitMemeFichier}`,
		};
	}
	if (!FAN_MODES.includes(p.fanOut)) {
		return { ok: false, reason: `unknown fan_out: ${p.fanOut}` };
	}
	if (!FAN_MODES.includes(p.fanIn)) {
		return { ok: false, reason: `unknown fan_in: ${p.fanIn}` };
	}
	if (p.maxConcurrency < 0) {
		return { ok: false, reason: "max_concurrency must be >= 0" };
	}
	for (const rc of p.capsParRole) {
		if (rc.cap < 0) {
			return { ok: false, reason: `role cap for ${rc.role} must be >= 0` };
		}
	}
	if (specMaxConcurrency > 0 && p.maxConcurrency > specMaxConcurrency) {
		return {
			ok: false,
			reason: `max_concurrency ${p.maxConcurrency} exceeds spec ${specMaxConcurrency} (phantom cap, gap F1)`,
		};
	}
	return { ok: true };
}

/** A run pinned to a policy @version — gap F3 (immutability per-run). */
export interface RunPin {
	runId: string;
	policyVersion: string;
}

/**
 * pinForRun — captures the orchestration's policy @version for a run (gap F3). Once
 * captured it is FROZEN; there is no setter that mutates it. Refuses an empty version.
 */
export function pinForRun(runId: string, policyVersion: string): RunPin | null {
	if (policyVersion.trim() === "") return null;
	return { runId, policyVersion };
}

/**
 * mutationIsForbidden — re-asserts gap F3: a mid-run live-edit is detected when the live
 * policy version diverges from the pinned one. true ⇒ the orchestrator must REJECT the
 * edit and require a NEW proposal (idea→mirror→/goal), never a live-edit.
 */
export function mutationIsForbidden(
	pin: RunPin,
	livePolicyVersion: string,
): boolean {
	return pin.policyVersion !== livePolicyVersion;
}

/**
 * mirrorRank — the canonical mirror-first rank of a render layer (mirror(0) < projection(1)
 * < operation_action(2) < button(3); unknown ranks LAST). The TS twin of the Go MirrorRank.
 * DECLARED, never learned.
 */
export function mirrorRank(layer: string): number {
	switch (layer) {
		case "mirror":
			return 0;
		case "projection":
			return 1;
		case "operation_action":
			return 2;
		case "button":
			return 3;
		default:
			return 4;
	}
}

/** One agent's bid to claim a target (mirrors the Go ClaimContender; below the line). */
export interface ClaimContender {
	agent: string;
	target: string;
	layer: string;
	contentHash: string;
}

/** The verdict of ResolveConflict — winner, loser (WAITS), declared next action. */
export interface ConflictResolution {
	winner: ClaimContender;
	loser: ClaimContender;
	nextAction: SameFileConflictPolicy;
	sameTarget: boolean;
}

/**
 * aBeforeB — the total order on contenders: mirror-rank, then content-hash, then agent
 * ref, then target. Total & antisymmetric ⇒ ResolveConflict is symmetric. Deterministic.
 */
function aBeforeB(a: ClaimContender, b: ClaimContender): boolean {
	const ra = mirrorRank(a.layer);
	const rb = mirrorRank(b.layer);
	if (ra !== rb) return ra < rb;
	if (a.contentHash !== b.contentHash) return a.contentHash < b.contentHash;
	if (a.agent !== b.agent) return a.agent < b.agent;
	return a.target < b.target;
}

/**
 * resolveConflict — the PURE, TOTAL, DETERMINISTIC, SYMMETRIC tie-break of WHO PASSES
 * FIRST between two claim contenders for the SAME target (gap F2). It NEVER discards the
 * loser's work: the loser WAITS, and the declared nextAction is ALWAYS
 * serialise_then_merge (one lease at a time, then merge-semantic re-runs every mirror —
 * a red mirror blocks). Order: lower mirror-rank wins; ties by content-hash; final ties
 * by agent ref then target. NEVER an LLM, NEVER a coin-flip. If the targets differ it is
 * NOT a real conflict (sameTarget=false) and the two may proceed in parallel. The TS twin
 * of the Go ResolveConflict.
 */
export function resolveConflict(
	a: ClaimContender,
	b: ClaimContender,
): ConflictResolution {
	const sameTarget = a.target === b.target;
	const [winner, loser] = aBeforeB(a, b) ? [a, b] : [b, a];
	return {
		winner,
		loser,
		nextAction: "serialise_then_merge",
		sameTarget,
	};
}

// ─── BA25 — MULTI-AGENT coordination (scheduleTeam) ──────────────────────────────────

/** The result of scheduleTeam — queue after the tick, assignments, conflicts resolved. */
export interface TeamScheduleResult {
	queue: QueueEntry[];
	assignments: AgentAssignment[];
	conflicts: ConflictResolution[];
}

/** A QueueEntry projected into the kernel ClaimContender (item id stands in for agent + hash). */
function contenderOf(e: QueueEntry): ClaimContender {
	return {
		agent: e.item.itemId,
		target: e.target ?? "",
		layer: e.layer,
		contentHash: e.item.itemId,
	};
}

/**
 * scheduleTeam — the PURE MULTI-AGENT lease planner for ONE tick under an
 * OrchestrationPolicy (the TS twin of the Go ScheduleTeam). Rules, in order:
 *   1. EXPIRE + BLOCK/UNBLOCK — identical to schedule (reclaim dead leases, dependency gate).
 *   2. CONFLICT SERIALISATION (gap F2) — two leasable items on the SAME target are a
 *      conflict: resolveConflict picks who passes first; the loser WAITS (stays open), its
 *      work is never discarded; nextAction is serialise_then_merge.
 *   3. LEASE under the cap (gap F1) — staff surviving leasable items mirror-first,
 *      role-matched, STOPPING once MaxConcurrency live leases is reached (0 ⇒ unbounded).
 *
 * It never leases a blocked item, never re-leases a live item, never throws. Same inputs ⇒
 * same result. `now` is SUPPLIED — no arg-less clock.
 */
export function scheduleTeam(
	queue: QueueEntry[],
	agents: Candidate[],
	policy: OrchestrationPolicy,
	now: string,
	leaseUntil: string,
): TeamScheduleResult {
	const out: QueueEntry[] = queue.map((e) => ({
		item: { ...e.item },
		layer: e.layer,
		dependencies: e.dependencies,
		target: e.target,
	}));
	const assignments: AgentAssignment[] = [];

	// (1) EXPIRE stale leases.
	for (const e of out) {
		const it = e.item;
		if (
			it.status === "claimed" &&
			it.leaseUntil !== "" &&
			it.leaseUntil < now
		) {
			assignments.push({
				agent: it.ownerAgent,
				redWorkItem: it.itemId,
				leaseJusqua: it.leaseUntil,
				leaseEpoch: it.leaseEpoch,
				statut: "expired",
			});
			e.item = {
				itemId: it.itemId,
				status: "open",
				ownerAgent: "",
				leaseUntil: "",
				leaseEpoch: it.leaseEpoch, // monotone — NOT reset on reclaim (fencing)
			};
		}
	}

	// resolved set (after expiry).
	const resolved = new Set<string>();
	for (const e of out) {
		if (e.item.status === "resolved") {
			resolved.add(e.item.itemId);
		}
	}

	// (2) BLOCK/UNBLOCK — the dependency gate (drives the hand-off across roles).
	for (const e of out) {
		const st = e.item.status;
		if (st !== "open" && st !== "blocked") {
			continue;
		}
		if (depsResolved(e.dependencies, resolved)) {
			if (st === "blocked") {
				e.item.status = "open";
			}
		} else {
			e.item.status = "blocked";
		}
	}

	// live leases already on the queue count against MaxConcurrency; their targets are
	// already held — an open item rendering such a target must NOT lease (one per target).
	let liveLeases = 0;
	const liveTargets = new Set<string>();
	for (const e of out) {
		if (e.item.status === "claimed") {
			liveLeases++;
			if (e.target) {
				liveTargets.add(e.target);
			}
		}
	}

	// (3) LEASE under conflict-serialisation + the concurrency cap.
	const roster: Candidate[] = agents.map((a) => ({ ...a }));
	const conflicts: ConflictResolution[] = [];
	const conflictLosers = new Set<string>();

	for (;;) {
		if (policy.maxConcurrency > 0 && liveLeases >= policy.maxConcurrency) {
			break;
		}
		const leasable = out.filter(
			(e) =>
				e.item.status === "open" &&
				!conflictLosers.has(e.item.itemId) &&
				!(
					e.target !== undefined &&
					e.target !== "" &&
					liveTargets.has(e.target)
				),
		);
		const head = headOf(leasable);
		if (head === undefined) {
			break;
		}

		// CONFLICT SERIALISATION (gap F2).
		if (head.target !== undefined && head.target !== "") {
			const rival = leasable.find(
				(e) =>
					e.item.itemId !== head.item.itemId &&
					e.target !== undefined &&
					e.target !== "" &&
					e.target === head.target,
			);
			if (rival !== undefined) {
				const res = resolveConflict(contenderOf(head), contenderOf(rival));
				conflicts.push(res);
				conflictLosers.add(res.loser.agent); // the loser item id waits this tick
				continue;
			}
		}

		const m = matchRole(head.layer, roster);
		if (!m.ok) {
			break;
		}
		const c = claim(head.item, m.ref, leaseUntil);
		if (!c.ok || !c.item || !c.assignment) {
			break;
		}
		const target = out.find((e) => e.item.itemId === head.item.itemId);
		if (target) {
			target.item = c.item;
		}
		assignments.push(c.assignment);
		liveLeases++;
		if (head.target !== undefined && head.target !== "") {
			liveTargets.add(head.target); // the fresh lease now holds this target too
		}
		const chosen = roster.find((a) => a.ref === m.ref);
		if (chosen) {
			chosen.free = false;
		}
	}

	assignments.sort((a, b) => {
		if (a.redWorkItem !== b.redWorkItem) {
			return a.redWorkItem < b.redWorkItem ? -1 : 1;
		}
		return a.statut < b.statut ? -1 : a.statut > b.statut ? 1 : 0;
	});
	conflicts.sort((a, b) => {
		if (a.winner.target !== b.winner.target) {
			return a.winner.target < b.winner.target ? -1 : 1;
		}
		return a.loser.agent < b.loser.agent
			? -1
			: a.loser.agent > b.loser.agent
				? 1
				: 0;
	});
	return { queue: out, assignments, conflicts };
}
