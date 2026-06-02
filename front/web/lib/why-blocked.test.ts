import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	AGENT_WRITE_ABOVE_WATERLINE,
	BLOCK_REASONS,
	type BlockReason,
	lookupBlockReason,
	MISSING_AUTHORITY,
	MISSING_MIRROR,
	OUT_OF_SCOPE,
} from "./why-blocked";

/**
 * Reproducibility / invariant mirror (fast-check, N1) for the /why-blocked
 * projection. It mirrors the Go property mirror (blockreason_property_test.go): the
 * prison-forbidding law (every code has a non-empty resolution path), the canonical
 * fix tokens per code, and that lookup invents nothing.
 *
 * Determinism-first: BLOCK_REASONS is a static declared registry — the same code
 * always yields the same BlockReason.
 */

const arbBlockReason = (): fc.Arbitrary<BlockReason> =>
	fc.constantFrom(...BLOCK_REASONS);

describe("why-blocked projection — the BlockReason registry", () => {
	it("every code has a non-empty severity, explanation, and >=1 fix step (no prison)", () => {
		fc.assert(
			fc.property(arbBlockReason(), (br) => {
				expect(br.severity.trim().length).toBeGreaterThan(0);
				expect(br.explanation.trim().length).toBeGreaterThan(0);
				expect(br.howToFix.length).toBeGreaterThanOrEqual(1);
				for (const step of br.howToFix) {
					expect(step.trim().length).toBeGreaterThan(0);
				}
			}),
		);
	});

	it("the severity is always the canonical `blocking` (KRD §44.5)", () => {
		for (const br of BLOCK_REASONS) {
			expect(br.severity).toBe("blocking");
		}
	});

	it("MISSING_MIRROR names the idea -> mirror -> /goal door", () => {
		const br = lookupBlockReason(MISSING_MIRROR);
		expect(br).toBeDefined();
		expect(br?.howToFix.some((s) => s.includes("write_mirror"))).toBe(true);
		expect(br?.howToFix.some((s) => s.includes("rerun aidos check"))).toBe(
			true,
		);
	});

	it("MISSING_AUTHORITY names assign_authority", () => {
		const br = lookupBlockReason(MISSING_AUTHORITY);
		expect(br?.howToFix.some((s) => s.includes("assign_authority"))).toBe(true);
	});

	it("OUT_OF_SCOPE names the in-scope target or its owner (no fabricated name)", () => {
		const br = lookupBlockReason(OUT_OF_SCOPE);
		const named = br?.howToFix.some((s) => {
			const l = s.toLowerCase();
			return (
				l.includes("scope") ||
				l.includes("périmètre") ||
				l.includes("owner") ||
				l.includes("propriétaire")
			);
		});
		expect(named).toBe(true);
	});

	it("includes the inherited AGENT_WRITE_ABOVE_WATERLINE code (S04 fold-in)", () => {
		expect(lookupBlockReason(AGENT_WRITE_ABOVE_WATERLINE)).toBeDefined();
	});

	it("lookup invents nothing for an unknown code", () => {
		expect(lookupBlockReason("NOPE_NOT_A_CODE")).toBeUndefined();
	});

	it("the registry is deterministic — same code, same BlockReason", () => {
		fc.assert(
			fc.property(arbBlockReason(), (br) => {
				expect(lookupBlockReason(br.code)).toEqual(br);
			}),
		);
	});
});
