import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	classify,
	DEFAULT_THRESHOLDS,
	runsToSignals,
	runToSignal,
	type SignalThresholds,
} from "./agentloop-runtosignal";
import type { AgentAction, AgentRun, Result } from "./agentrun";
import { AGENT_WRITE_ABOVE_WATERLINE } from "./why-blocked";

// BA30 — the reproducibility + invariant + HONESTY mirror (fast-check) for the RunToSignal
// GATEWAY (front twin of back/runtime/agentloop's Classify / RunToSignal). The Go package is the
// authority; this twin pins the SAME deterministic classification + identity-by-pattern.
// Determinism-first: pure, total, no I/O, no Date.now(), no Math.random().

const DETERMINISM_GAP = "AGENT_DETERMINISM_GAP";

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

describe("BA30 — runToSignal gateway", () => {
	it("1. is reproducible: same run + thresholds ⇒ same result", () => {
		fc.assert(
			fc.property(
				fc.constantFrom<Result>("green", "still_red", "abandoned", "blocked"),
				fc.integer({ min: 0, max: 5 }),
				(result, th) => {
					const run = mkRun({ result }, [
						refused(AGENT_WRITE_ABOVE_WATERLINE, "kernel.operation"),
					]);
					const a = runToSignal(run, { thrashRefusals: th });
					const b = runToSignal(run, { thrashRefusals: th });
					expect(a).toEqual(b);
				},
			),
		);
	});

	it("2. any failed/abandoned/blocked run always signals", () => {
		fc.assert(
			fc.property(failingResult, (result) => {
				const [, ok] = runToSignal(mkRun({ result }), DEFAULT_THRESHOLDS);
				expect(ok).toBe(true);
			}),
		);
	});

	it("3. an ordinary green run produces no signal", () => {
		const [signal, ok] = runToSignal(mkRun({ result: "green" }), {
			thrashRefusals: 0,
		});
		expect(ok).toBe(false);
		expect(signal).toBeNull();
	});

	it("4. a green run thrashing the wall ⇒ low-severity hollow signal", () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 4 }), (th) => {
				const actions = Array.from({ length: th }, (_, i) =>
					refused(AGENT_WRITE_ABOVE_WATERLINE, `kernel.op${i}`),
				);
				const [signal, ok] = runToSignal(mkRun({ result: "green" }, actions), {
					thrashRefusals: th,
				});
				expect(ok).toBe(true);
				expect(signal?.class).toBe("green_hollow");
				expect(signal?.severity).toBe("low");
			}),
		);
	});

	it("5. a green run surfacing a determinism gap ⇒ low signal even below the count", () => {
		const [signal, ok] = runToSignal(
			mkRun({ result: "green" }, [refused(DETERMINISM_GAP, "back/gen/x.go")]),
			{ thrashRefusals: 99 },
		);
		expect(ok).toBe(true);
		expect(signal?.severity).toBe("low");
	});

	it("6. every signal carries a HYPOTHESIS cause sketch (honesty: never a truth)", () => {
		fc.assert(
			fc.property(failingResult, (result) => {
				const [signal] = runToSignal(mkRun({ result }), DEFAULT_THRESHOLDS);
				expect(signal?.causeSketch).toContain("HYPOTHÈSE");
			}),
		);
	});

	it("7. identity-by-pattern: two distinct runs of the same mode share a pattern", () => {
		const a = mkRun({ id: "ra", goal: "goalA", result: "still_red" }, [
			refused(AGENT_WRITE_ABOVE_WATERLINE, "kernel.operation"),
		]);
		const b = mkRun({ id: "rb", goal: "goalB", result: "still_red" }, [
			refused(AGENT_WRITE_ABOVE_WATERLINE, "kernel.entity"),
		]);
		const [sa] = runToSignal(a, DEFAULT_THRESHOLDS);
		const [sb] = runToSignal(b, DEFAULT_THRESHOLDS);
		expect(sa?.pattern).toBe(sb?.pattern);
	});

	it("8. different failure classes ⇒ different patterns", () => {
		const [sa] = runToSignal(
			mkRun({ result: "still_red" }),
			DEFAULT_THRESHOLDS,
		);
		const [sb] = runToSignal(
			mkRun({ result: "abandoned" }),
			DEFAULT_THRESHOLDS,
		);
		expect(sa?.pattern).not.toBe(sb?.pattern);
	});

	it("9. recurrence climbs: two same-pattern runs collapse to one pattern with count 2", () => {
		const a = mkRun({ id: "ra", goal: "goalA", result: "still_red" }, [
			refused(AGENT_WRITE_ABOVE_WATERLINE, "kernel.operation"),
		]);
		const b = mkRun({ id: "rb", goal: "goalB", result: "still_red" }, [
			refused(AGENT_WRITE_ABOVE_WATERLINE, "kernel.entity"),
		]);
		const view = runsToSignals([a, b], DEFAULT_THRESHOLDS);
		const counts = Object.values(view.patternRecurrence);
		expect(counts).toContain(2);
	});

	it("10. provenance names the run+goal but the pattern omits them (identity ≠ run id)", () => {
		const a = mkRun({ id: "rXYZ", goal: "goalA", result: "still_red" });
		const [signal] = runToSignal(a, DEFAULT_THRESHOLDS);
		expect(signal?.provenance).toContain("goalA");
		// the pattern must NOT carry the run id or the goal id (identity-by-pattern).
		expect(signal?.pattern).not.toContain("rXYZ");
		expect(signal?.pattern).not.toContain("goalA");
	});

	it("classify maps each result to its class", () => {
		const th: SignalThresholds = { thrashRefusals: 0 };
		expect(classify(mkRun({ result: "still_red" }), th)).toBe("still_red");
		expect(classify(mkRun({ result: "abandoned" }), th)).toBe("abandoned");
		expect(classify(mkRun({ result: "blocked" }), th)).toBe("blocked");
		expect(classify(mkRun({ result: "green" }), th)).toBe("none");
	});
});
