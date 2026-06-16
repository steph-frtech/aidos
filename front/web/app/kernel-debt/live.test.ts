import { describe, expect, it } from "vitest";
import { DEMO_MUTATION, mutationDecoder } from "./live";

/**
 * /kernel-debt live MUTATION read — the PARITY MIRROR (Vitest, the frozen front N1 slot;
 * ADR 0092 kill-twins batch).
 *
 * It proves the TS decoder decodes a SAMPLE of the Go mutation-runner `run_mutation` output
 * (mutationrunnersrv.runOutput: `{ verdict, score, threshold, block_code?, surviving_mutants?
 * }`) — the tool's CONTRACT, NOT a second mutation runner. The verdict is computed by the Go
 * densimètre (gremlins/Stryker, authoritative); this test pins only that the wire shape decodes
 * faithfully (incl. the omitempty block_code / surviving_mutants / gap) and that a malformed
 * payload deterministically falls back to the demo verdict.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("kernel-debt live — run_mutation decoder parity", () => {
	it("decodes a byte-faithful Go-sample runOutput (passed, with a survivor)", () => {
		const goSample = {
			verdict: "passed",
			score: 0.86,
			threshold: 0.8,
			surviving_mutants: [
				{
					file: "back/kernel/expr/eval.go",
					line: 142,
					operator: "CONDITIONALS_BOUNDARY",
					gap: "no mirror covers >= vs >",
				},
			],
		};
		expect(mutationDecoder(goSample)).toEqual({
			verdict: "passed",
			score: 0.86,
			threshold: 0.8,
			blockCode: null,
			survivingMutants: [
				{
					file: "back/kernel/expr/eval.go",
					line: 142,
					operator: "CONDITIONALS_BOUNDARY",
					gap: "no mirror covers >= vs >",
				},
			],
		});
	});

	it("decodes a blocked run (block_code present, no survivors)", () => {
		const decoded = mutationDecoder({
			verdict: "blocked",
			score: 0.62,
			threshold: 0.8,
			block_code: "MUTATION_SCORE_BELOW_THRESHOLD",
		});
		expect(decoded).toEqual({
			verdict: "blocked",
			score: 0.62,
			threshold: 0.8,
			blockCode: "MUTATION_SCORE_BELOW_THRESHOLD",
			survivingMutants: [],
		});
	});

	it("decodes a survivor with no diagnosed gap (absent gap → null)", () => {
		const decoded = mutationDecoder({
			verdict: "passed",
			score: 0.9,
			threshold: 0.8,
			surviving_mutants: [
				{ file: "x.go", line: 1, operator: "ARITHMETIC_BASE" },
			],
		});
		expect(decoded?.survivingMutants[0]?.gap).toBeNull();
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(mutationDecoder(null)).toBeNull();
		expect(mutationDecoder({})).toBeNull(); // missing verdict/score/threshold
		// a non-number score → null.
		expect(
			mutationDecoder({ verdict: "passed", score: "high", threshold: 0.8 }),
		).toBeNull();
		// a survivor missing operator → null.
		expect(
			mutationDecoder({
				verdict: "passed",
				score: 0.9,
				threshold: 0.8,
				surviving_mutants: [{ file: "x.go", line: 1 }],
			}),
		).toBeNull();
	});

	it("the demo verdict is the deterministic passing 0.80-bar run with one survivor", () => {
		expect(DEMO_MUTATION.verdict).toBe("passed");
		expect(DEMO_MUTATION.threshold).toBe(0.8);
		expect(DEMO_MUTATION.survivingMutants).toHaveLength(1);
	});
});
