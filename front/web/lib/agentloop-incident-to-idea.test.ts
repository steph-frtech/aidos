import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	applyGate,
	type Proposal,
	runsToLearnings,
	runToDraft,
} from "./agentloop-incident-to-idea";
import { DEFAULT_THRESHOLDS } from "./agentloop-runtosignal";
import type { AgentAction, AgentRun, Result } from "./agentrun";
import type { AuthorityGraph, Role } from "./authority";

// BA31 — the reproducibility + invariant + HONESTY mirror (fast-check) for the RunToDraft on-ramp
// and the provenance-verified ApplyGate (gap J1), front twin of back/runtime/agentloop. The Go
// package is the authority; this twin pins the SAME deterministic behaviour + the wall.
// Determinism-first: pure, total, no I/O, no Date.now(), no Math.random().

const WALL = "AGENT_WRITE_ABOVE_WATERLINE";

function refused(code: string, target: string): AgentAction {
	return {
		type: "write",
		cible: target,
		autorisee: false,
		raisonBlocage: {
			code: code as never,
			severity: "blocking",
			explanation: "x",
			howToFix: ["idea → mirror → /goal"],
		},
	};
}

function mkRun(over: Partial<AgentRun>, actions: AgentAction[] = []): AgentRun {
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

const failingResult = fc.constantFrom<Result>(
	"still_red",
	"abandoned",
	"blocked",
);

const graph = (over: Partial<AuthorityGraph> = {}): AuthorityGraph => ({
	domain: over.domain ?? "billing",
	truthKind: over.truthKind ?? "regulatory",
	approvers: over.approvers ?? ["legal"],
	veto: over.veto ?? [],
	escalation: over.escalation ?? [],
});

describe("BA31 — runToDraft on-ramp", () => {
	it("1. is reproducible: same run + thresholds ⇒ same draft", () => {
		fc.assert(
			fc.property(
				fc.constantFrom<Result>("green", "still_red", "abandoned", "blocked"),
				fc.integer({ min: 0, max: 5 }),
				(result, n) => {
					const actions = Array.from({ length: n }, () => refused(WALL, "k"));
					const run = mkRun({ result }, actions);
					const a = runToDraft(run, DEFAULT_THRESHOLDS);
					const b = runToDraft(run, DEFAULT_THRESHOLDS);
					expect(a).toEqual(b);
				},
			),
		);
	});

	it("2. a failed/abandoned/blocked run ⇒ a DRAFT idea, no kernel write", () => {
		fc.assert(
			fc.property(failingResult, (result) => {
				const d = runToDraft(mkRun({ result }), DEFAULT_THRESHOLDS);
				expect(d.signalled).toBe(true);
				expect(d.ideaStatus).toBe("draft");
				expect(d.provenanceSource).toBe("incident");
				expect(d.wroteKernel).toBe(false);
			}),
		);
	});

	it("3. a signalled run ALWAYS carries the REALITY_CANNOT_DECLARE_TRUTH refusal (the wall)", () => {
		fc.assert(
			fc.property(failingResult, (result) => {
				const d = runToDraft(mkRun({ result }), DEFAULT_THRESHOLDS);
				expect(d.toKernelRefusal?.code).toBe("REALITY_CANNOT_DECLARE_TRUTH");
			}),
		);
	});

	it("4. an ordinary green run ⇒ no signal, no idea invented", () => {
		const d = runToDraft(mkRun({ result: "green" }), DEFAULT_THRESHOLDS);
		expect(d.signalled).toBe(false);
		expect(d.ideaStatus).toBe("");
		expect(d.wroteKernel).toBe(false);
		expect(d.toKernelRefusal).toBeNull();
	});

	it("5. a green-hollow run (thrashing) ⇒ a LOW-severity DRAFT (gap I1)", () => {
		const actions = [
			refused(WALL, "k/a"),
			refused(WALL, "k/b"),
			refused(WALL, "k/c"),
		];
		const d = runToDraft(
			mkRun({ result: "green" }, actions),
			DEFAULT_THRESHOLDS,
		);
		expect(d.signalled).toBe(true);
		expect(d.pattern?.severity).toBe("low");
		expect(d.ideaStatus).toBe("draft");
	});

	it("6. the cause sketch is an explicit HYPOTHESIS (never a truth)", () => {
		const d = runToDraft(mkRun({ result: "still_red" }), DEFAULT_THRESHOLDS);
		expect(d.causeSketch).toContain("HYPOTHÈSE");
	});

	it("7. identity-by-pattern: two DISTINCT runs of the same mode collapse to one recurring incident (gap I2)", () => {
		const r1 = mkRun({ id: "run-1", goal: "S101", result: "still_red" }, [
			refused(WALL, "k/a"),
		]);
		const r2 = mkRun({ id: "run-2", goal: "S202", result: "still_red" }, [
			refused(WALL, "k/b"),
		]);
		const view = runsToLearnings([r1, r2], DEFAULT_THRESHOLDS);
		expect(view.entries[0].draft.incidentRef).toBe(
			view.entries[1].draft.incidentRef,
		);
		expect(view.patternRecurrence[view.entries[0].draft.incidentRef]).toBe(2);
	});
});

describe("BA31 — applyGate (gap J1)", () => {
	it("8. a FORGED Status:'admitted' with no admitting record is refused PROPOSAL_NOT_ADMITTED", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("admitted", "proposed", "anything"),
				(status) => {
					const prop: Proposal = {
						domain: "billing",
						truthKind: "regulatory",
						status,
					};
					const dec = applyGate(graph(), prop, []); // no approver granted
					expect(dec.admitted).toBe(false);
					expect(dec.refusal?.code).toBe("PROPOSAL_NOT_ADMITTED");
				},
			),
		);
	});

	it("9. a genuine admission (required approver granted, no veto) applies — verdict re-derived", () => {
		fc.assert(
			fc.property(fc.constantFrom("proposed", "admitted"), (status) => {
				const prop: Proposal = {
					domain: "billing",
					truthKind: "regulatory",
					status,
				};
				const dec = applyGate(graph(), prop, ["legal"] as Role[]);
				expect(dec.admitted).toBe(true);
				expect(dec.refusal).toBeNull();
			}),
		);
	});

	it("10. a veto blocks admission regardless of the forged status", () => {
		const prop: Proposal = {
			domain: "billing",
			truthKind: "regulatory",
			status: "admitted",
		};
		const g = graph({ approvers: ["legal"], veto: ["dpo"] as Role[] });
		const dec = applyGate(g, prop, ["legal", "dpo"] as Role[]);
		expect(dec.admitted).toBe(false);
		expect(dec.refusal?.code).toBe("PROPOSAL_NOT_ADMITTED");
	});

	it("11. the refusal names the door (how_to_fix non-empty)", () => {
		const dec = applyGate(
			graph(),
			{ domain: "billing", truthKind: "regulatory", status: "admitted" },
			[],
		);
		expect(dec.refusal?.howToFix.length ?? 0).toBeGreaterThan(0);
	});
});
