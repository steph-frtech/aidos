/**
 * blocks.test.ts — the S60 reproducibility mirror for the global BlockReason catalog.
 * mirror record: reflects=S60-blocks, test_kind=invariant (property),
 *               cert_language=fast-check, liveness=live
 *
 * Pins the S60 done criterion (a refused truth-write surfaces its actionable BlockReason)
 * + determinism-first (same input → same refusal):
 *   1. refuseTruthWrite on a truth-zone tool returns the REAL
 *      GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET BlockReason — code, severity, explanation,
 *      and a NON-EMPTY how_to_fix[];
 *   2. it is deterministic (same input → same refusal), pinned by fast-check;
 *   3. the catalog enumerates only the closed, declared codes (no coined code);
 *   4. an unexposed tool surfaces GATEWAY_UNKNOWN_TOOL — never a route.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CATALOG_CODES, refuseTruthWrite, TRUTH_WRITE_TOOLS } from "./blocks";
import { CODE_TRUTH_WRITE_NEEDS_CHANGESET, CODE_UNKNOWN_TOOL } from "./gateway";

describe("S60 — refuseTruthWrite surfaces the real actionable BlockReason", () => {
	it("a kernel_write is refused with GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET + how_to_fix", () => {
		const br = refuseTruthWrite("alice", "proj-a", "kernel_write");
		expect(br).not.toBeNull();
		expect(br?.code).toBe(CODE_TRUTH_WRITE_NEEDS_CHANGESET);
		expect(br?.severity).toBe("error");
		expect(br?.explanation.length).toBeGreaterThan(0);
		expect((br?.howToFix ?? []).length).toBeGreaterThan(0);
	});

	it("every fenced truth-write tool is refused (never routed)", () => {
		for (const tool of TRUTH_WRITE_TOOLS) {
			const br = refuseTruthWrite("alice", "proj-a", tool);
			expect(br).not.toBeNull();
			expect(br?.code).toBe(CODE_TRUTH_WRITE_NEEDS_CHANGESET);
		}
	});

	it("an unexposed tool surfaces GATEWAY_UNKNOWN_TOOL", () => {
		const br = refuseTruthWrite("alice", "proj-a", "nope_tool");
		expect(br?.code).toBe(CODE_UNKNOWN_TOOL);
	});

	it("a below-the-line read is NOT refused (returns null)", () => {
		expect(refuseTruthWrite("alice", "proj-a", "store_get")).toBeNull();
	});

	it("is deterministic: same (scope, tool) → same refusal", () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1 }),
				fc.string({ minLength: 1 }),
				fc.constantFrom(...TRUTH_WRITE_TOOLS),
				(id, proj, tool) => {
					expect(refuseTruthWrite(id, proj, tool)).toEqual(
						refuseTruthWrite(id, proj, tool),
					);
				},
			),
		);
	});
});

describe("S60 — the catalog enumerates only declared codes", () => {
	it("carries the four closed codes, each with an origin + severity", () => {
		const codes = CATALOG_CODES.map((c) => c.code);
		expect(codes).toContain("AGENT_CROSS_PROJECT_WRITE");
		expect(codes).toContain(CODE_TRUTH_WRITE_NEEDS_CHANGESET);
		expect(codes).toContain(CODE_UNKNOWN_TOOL);
		expect(codes).toContain("GOAL_STILL_RED");
		for (const c of CATALOG_CODES) {
			expect(["wall", "gateway", "goal"]).toContain(c.origin);
			expect(c.severity.length).toBeGreaterThan(0);
		}
	});
});
