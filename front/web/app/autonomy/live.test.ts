import { describe, expect, it } from "vitest";
import {
	ACTION_SCENARIOS,
	demoEnforce,
	demoPromote,
	findActionScenario,
	findHistoryScenario,
	gatewayEnforceArgs,
	gatewayPromoteArgs,
	HISTORY_SCENARIOS,
} from "../../lib/autonomy-data";
import { enforceDecoder, promoteDecoder } from "./live";

/**
 * /autonomy live read — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092 kill-twins
 * batch-2).
 *
 * It proves the TS `enforceDecoder` / `promoteDecoder` decode a SAMPLE of the Go autonomy
 * `enforce` / `promote` tool outputs (autonomysrv.enforceOut: `{ ok, allowed, declared, required,
 * critical, code?, severity?, explanation?, how_to_fix?[] }` ; autonomysrv.promoteOut: `{ ok,
 * current, promoted, earned, window_n, min_evidence, history_len }`) — the tools' CONTRACT, NOT a
 * second implementation of the enforcement / promotion logic (the Go autonomy.Enforce /
 * autonomy.PromotionFromHistory are authoritative). This test pins only that the wire shape decodes
 * faithfully (the snake_case how_to_fix / window_n / min_evidence / history_len, the omitempty
 * BlockReason witnesses) and that a malformed payload deterministically falls back to the demo
 * snapshot — AND that the demo twin produces the SAME shape the decoder yields (twin ≡ the live
 * contract shape).
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("autonomy live — enforce decoder parity", () => {
	it("decodes a Go-sample enforceOut for an ADMITTED action (no BlockReason)", () => {
		const goSample = {
			ok: true,
			allowed: true,
			declared: "A6",
			required: "A6",
			critical: true,
		};
		expect(enforceDecoder(goSample)).toEqual({
			allowed: true,
			declared: "A6",
			required: "A6",
			critical: true,
		});
	});

	it("decodes a Go-sample enforceOut for a REFUSED action (carries the BlockReason)", () => {
		const decoded = enforceDecoder({
			ok: true,
			allowed: false,
			declared: "A1",
			required: "A6",
			critical: true,
			code: "AGENT_AUTONOMY_EXCEEDED",
			severity: "blocking",
			explanation: "l'action exige un niveau supérieur",
			how_to_fix: ["stay_within_declared_level", "earn_promotion_from_history"],
		});
		expect(decoded?.allowed).toBe(false);
		expect(decoded?.code).toBe("AGENT_AUTONOMY_EXCEEDED");
		expect(decoded?.howToFix).toEqual([
			"stay_within_declared_level",
			"earn_promotion_from_history",
		]);
	});

	it("rejects a malformed enforce payload (→ demo fallback)", () => {
		expect(enforceDecoder(null)).toBeNull();
		expect(enforceDecoder({})).toBeNull();
		// a non-boolean allowed → null.
		expect(
			enforceDecoder({
				allowed: "yes",
				declared: "A1",
				required: "A6",
				critical: true,
			}),
		).toBeNull();
		// a missing required label → null.
		expect(
			enforceDecoder({ allowed: true, declared: "A6", critical: false }),
		).toBeNull();
	});

	it("the demo enforce snapshot matches the decoded live shape (twin ≡ the contract)", () => {
		// A1 → merge(A6, critical) is the FK10 fixture done-criterion: refused, carries the BlockReason.
		const s = findActionScenario("a1-merge");
		expect(s).toBeDefined();
		if (!s) return;
		const demo = demoEnforce(s);
		expect(demo.allowed).toBe(false);
		expect(demo.declared).toBe("A1");
		expect(demo.required).toBe("A6");
		expect(demo.code).toBe("AGENT_AUTONOMY_EXCEEDED");
		// the gateway-arg projection carries the scalar inputs the Go enforce tool consumes.
		expect(gatewayEnforceArgs(s)).toEqual({
			declared: 1,
			action: "merge",
			required: 6,
			critical: true,
		});
		// an ADMITTED scenario yields no BlockReason (twin parity with the live admitted shape).
		const ok = findActionScenario("a6-merge");
		expect(ok).toBeDefined();
		if (ok) expect(demoEnforce(ok).code).toBeUndefined();
		// every scenario id resolves (no orphan select option).
		for (const sc of ACTION_SCENARIOS) {
			expect(findActionScenario(sc.id)).toBe(sc);
		}
	});
});

describe("autonomy live — promote decoder parity", () => {
	it("decodes a Go-sample promoteOut that EARNED a level", () => {
		expect(
			promoteDecoder({
				ok: true,
				current: "A1",
				promoted: "A2",
				earned: true,
				window_n: 3,
				min_evidence: "E4",
				history_len: 3,
			}),
		).toEqual({
			current: "A1",
			promoted: "A2",
			earned: true,
			windowN: 3,
			minEvidence: "E4",
			historyLen: 3,
		});
	});

	it("decodes a Go-sample promoteOut that WITHHELD the level", () => {
		const decoded = promoteDecoder({
			ok: true,
			current: "A1",
			promoted: "A1",
			earned: false,
			window_n: 3,
			min_evidence: "E4",
			history_len: 3,
		});
		expect(decoded?.earned).toBe(false);
		expect(decoded?.promoted).toBe("A1");
	});

	it("rejects a malformed promote payload (→ demo fallback)", () => {
		expect(promoteDecoder(null)).toBeNull();
		expect(promoteDecoder({})).toBeNull();
		// a non-number window_n → null.
		expect(
			promoteDecoder({
				current: "A1",
				promoted: "A2",
				earned: true,
				window_n: "x",
				min_evidence: "E4",
				history_len: 3,
			}),
		).toBeNull();
		// a missing earned → null.
		expect(
			promoteDecoder({
				current: "A1",
				promoted: "A2",
				window_n: 3,
				min_evidence: "E4",
				history_len: 3,
			}),
		).toBeNull();
	});

	it("the demo promote snapshot matches the decoded live shape (twin ≡ the contract)", () => {
		// the clean window (3 green E4+ no-incident runs) EARNS A1→A2 (computed, never declared).
		const clean = findHistoryScenario("clean");
		expect(clean).toBeDefined();
		if (!clean) return;
		const demo = demoPromote(clean);
		expect(demo.current).toBe("A1");
		expect(demo.promoted).toBe("A2");
		expect(demo.earned).toBe(true);
		expect(demo.windowN).toBe(3);
		expect(demo.minEvidence).toBe("E4");
		expect(gatewayPromoteArgs(clean)).toEqual({
			current: 1,
			history: [
				{ green: true, evidence: 4, incident: false },
				{ green: true, evidence: 5, incident: false },
				{ green: true, evidence: 4, incident: false },
			],
		});
		// an incident / sub-E4 run WITHHOLDS the level (earned false).
		const incident = findHistoryScenario("incident");
		expect(incident).toBeDefined();
		if (incident) expect(demoPromote(incident).earned).toBe(false);
		for (const sc of HISTORY_SCENARIOS) {
			expect(findHistoryScenario(sc.id)).toBe(sc);
		}
	});
});
