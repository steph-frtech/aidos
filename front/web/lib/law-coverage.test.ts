import { describe, expect, it } from "vitest";
import {
	checkDemo,
	checkRed,
	type LawId,
	registry,
	verbs,
} from "./law-coverage";

// law-coverage.test.ts — the S45 front mirror (Vitest, fast-check style invariants).
// It proves the TS law-coverage registry is the SAME CONTRACT as the Go harness:
// the closed §82.1 + §29 law set, the 1-law-1-red-1-green totality, and the
// determinism the /check panel relies on.

// The expected closed law set (exactly the ten §82.1 laws + the §29 completeness law).
const expectedLaws: LawId[] = [
	"truth_without_kind",
	"mirror_incompatible",
	"scope_absent",
	"authority_absent",
	"memory_without_goal",
	"phase_not_stable",
	"composes_weight",
	"mutation_score",
	"invariant_too_global",
	"context_decision_untest",
	"completeness",
];

// The breach code each law's red fixture must emit (mirrors the Go codes verbatim).
const expectedCode: Record<LawId, string> = {
	truth_without_kind: "TRUTH_WITHOUT_KIND",
	mirror_incompatible: "MIRROR_INCOMPATIBLE",
	scope_absent: "OUT_OF_SCOPE",
	authority_absent: "MISSING_AUTHORITY",
	memory_without_goal: "MEMORY_CANNOT_DECLARE_TRUTH",
	phase_not_stable: "PHASE_NOT_STABLE",
	composes_weight: "COMPOSES_WEIGHT_UNJUSTIFIED",
	mutation_score: "MUTATION_SCORE_INSUFFICIENT",
	invariant_too_global: "INVARIANT_TOO_GLOBAL",
	context_decision_untest: "CONTEXT_DECISION_UNTESTED",
	completeness: "MONSTER",
};

describe("law-coverage registry (S45)", () => {
	it("is exactly the §82.1 + §29 law set — no law invented, none missing", () => {
		expect(registry.map((l) => l.id).sort()).toEqual([...expectedLaws].sort());
	});

	it("every law has an owning verb among the five and a reused detector", () => {
		for (const l of registry) {
			expect(verbs).toContain(l.owningVerb);
			expect(l.detectorRef.length).toBeGreaterThan(0);
			expect(l.krdRef.length).toBeGreaterThan(0);
		}
	});

	it("1 law = 1 red + 1 green: red breaches with the expected code, green is clean", () => {
		for (const l of registry) {
			const red = l.detect("red");
			expect(red, `law ${l.id} red must breach`).not.toBeNull();
			expect(red?.code).toBe(expectedCode[l.id]);
			expect(red?.law).toBe(l.id);
			expect(red?.severity).toBe("blocking");
			expect(
				(red?.howToFix.length ?? 0) > 0,
				`law ${l.id} breach must name a door`,
			).toBe(true);
			expect(l.detect("green"), `law ${l.id} green must be clean`).toBeNull();
		}
	});

	it("detect is deterministic — same fixture ⇒ identical verdict", () => {
		for (const l of registry) {
			expect(l.detect("red")).toEqual(l.detect("red"));
			expect(l.detect("green")).toEqual(l.detect("green"));
		}
	});
});

describe("aidos check (S45) — demo project + red runs", () => {
	it("checkDemo is GREEN — the demo project violates no check-owned law", () => {
		expect(checkDemo()).toEqual([]);
	});

	it("checkRed surfaces exactly one breach with the expected code", () => {
		for (const l of registry.filter((x) => x.owningVerb === "check")) {
			const breaches = checkRed(l.id);
			expect(breaches).toHaveLength(1);
			expect(breaches[0]?.code).toBe(expectedCode[l.id]);
		}
	});
});
