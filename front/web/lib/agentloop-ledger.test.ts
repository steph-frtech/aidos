import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Effect,
	queryLedger,
	reconcile,
	refusalsOf,
} from "./agentloop-ledger";
import type { AgentAction, AgentRun } from "./agentrun";
import { AGENT_WRITE_ABOVE_WATERLINE } from "./why-blocked";

// BA29 — the reproducibility + invariant mirror (fast-check) for the EFFECT-LOG + LEDGER (front
// twin of back/runtime/agentloop's Reconcile / QueryLedger). The Go package is the authority;
// this twin pins the SAME deterministic reconciliation and ledger query. Determinism-first: pure,
// total, no I/O, no Date.now(), no Math.random().

function allowedWrite(target: string): AgentAction {
	return { type: "write", cible: target, autorisee: true };
}

function refusedWrite(target: string): AgentAction {
	return {
		type: "write",
		cible: target,
		autorisee: false,
		raisonBlocage: {
			code: AGENT_WRITE_ABOVE_WATERLINE,
			severity: "blocking",
			explanation: "above the waterline",
			howToFix: ["open an idea → mirror → /goal"],
		},
	};
}

function mkRun(over: Partial<AgentRun>, actions: AgentAction[]): AgentRun {
	return {
		id: over.id ?? "run-x",
		agent: over.agent ?? "a@v1",
		goal: over.goal ?? "g",
		redWorkItem: over.redWorkItem ?? "r",
		contextPack: over.contextPack ?? "p",
		actions,
		result: over.result ?? "green",
		startedAt: over.startedAt ?? "2026-06-04T18:00:00Z",
		endedAt: over.endedAt ?? "2026-06-04T18:05:00Z",
	};
}

const targetArb = fc
	.stringMatching(/^[a-z]{3,8}$/)
	.map((s) => `back/gen/${s}.go`);

describe("BA29 — reconcile (fidelity-to-reality)", () => {
	it("a faithful run reconciles cleanly", () => {
		fc.assert(
			fc.property(fc.uniqueArray(targetArb, { maxLength: 4 }), (targets) => {
				const run = mkRun({ id: "rf" }, targets.map(allowedWrite));
				const effects: Effect[] = targets.map((t) => ({
					run: "rf",
					kind: "fs_write",
					target: t,
				}));
				expect(reconcile(run, effects).reconciled).toBe(true);
			}),
		);
	});

	it("an extra unrecorded boundary effect always breaks reconciliation", () => {
		fc.assert(
			fc.property(fc.uniqueArray(targetArb, { maxLength: 4 }), (targets) => {
				const run = mkRun({ id: "rb" }, targets.map(allowedWrite));
				const effects: Effect[] = [
					...targets.map((t) => ({
						run: "rb",
						kind: "fs_write" as const,
						target: t,
					})),
					{ run: "rb", kind: "fs_write", target: "/tmp/unrecorded-x" },
				];
				const rec = reconcile(run, effects);
				expect(rec.reconciled).toBe(false);
				expect(
					rec.drifts.some(
						(d) =>
							d.kind === "unrecorded_effect" &&
							d.target === "/tmp/unrecorded-x",
					),
				).toBe(true);
			}),
		);
	});

	it("a recorded write with no boundary effect is an unrealised_action", () => {
		const run = mkRun({ id: "ru" }, [allowedWrite("back/gen/missing.go")]);
		const rec = reconcile(run, []);
		expect(rec.reconciled).toBe(false);
		expect(rec.drifts[0].kind).toBe("unrealised_action");
	});

	it("a refused write expects no boundary effect (reconciles clean)", () => {
		const run = mkRun({ id: "rr" }, [refusedWrite("kernel.operation")]);
		expect(reconcile(run, []).reconciled).toBe(true);
	});

	it("reconcile is reproducible (same input ⇒ same output)", () => {
		fc.assert(
			fc.property(fc.uniqueArray(targetArb, { maxLength: 4 }), (targets) => {
				const run = mkRun({ id: "rp" }, targets.map(allowedWrite));
				const effects: Effect[] = targets.map((t) => ({
					run: "rp",
					kind: "fs_write",
					target: t,
				}));
				expect(reconcile(run, effects)).toEqual(reconcile(run, effects));
			}),
		);
	});
});

describe("BA29 — queryLedger", () => {
	it("tallies refusals by S13 code", () => {
		const run = mkRun({ id: "rk", result: "blocked" }, [
			refusedWrite("kernel.operation"),
		]);
		const led = queryLedger([run], []);
		expect(led.totalRefusals[AGENT_WRITE_ABOVE_WATERLINE]).toBe(1);
		expect(refusalsOf(run)[AGENT_WRITE_ABOVE_WATERLINE]).toBe(1);
	});

	it("auditable implies reconciled", () => {
		const run = mkRun({ id: "ra" }, [allowedWrite("back/gen/x.go")]);
		// no effect ⇒ unrealised ⇒ not reconciled ⇒ not auditable.
		const led = queryLedger([run], []);
		for (const e of led.entries) {
			if (e.auditable) expect(e.reconciliation.reconciled).toBe(true);
		}
	});

	it("a faithful run is auditable (replay ∧ reconciled)", () => {
		const run = mkRun({ id: "rg" }, [allowedWrite("back/gen/x.go")]);
		const led = queryLedger(
			[run],
			[{ run: "rg", kind: "fs_write", target: "back/gen/x.go" }],
		);
		expect(led.entries[0].auditable).toBe(true);
	});

	it("filters by goal and orders by startedAt", () => {
		const a = mkRun(
			{ id: "a", goal: "g-1", startedAt: "2026-06-04T20:00:00Z" },
			[],
		);
		const b = mkRun(
			{ id: "b", goal: "g-2", startedAt: "2026-06-04T19:00:00Z" },
			[],
		);
		const c = mkRun(
			{ id: "c", goal: "g-1", startedAt: "2026-06-04T18:00:00Z" },
			[],
		);
		const led = queryLedger([a, b, c], [], { goal: "g-1" });
		expect(led.entries.map((e) => e.run.id)).toEqual(["c", "a"]);
	});

	it("queryLedger is reproducible", () => {
		const run = mkRun({ id: "rq" }, [allowedWrite("back/gen/x.go")]);
		const effects: Effect[] = [
			{ run: "rq", kind: "fs_write", target: "back/gen/x.go" },
		];
		expect(queryLedger([run], effects)).toEqual(queryLedger([run], effects));
	});
});
