/**
 * Reproducibility mirror for the MemoryFirewall twin (lib/firewall.ts), AIDOS step S30.
 * fast-check (∀) — the SAME invariant the Go rapid property pins: ToKernel ALWAYS blocks with
 * MEMORY_CANNOT_DECLARE_TRUTH regardless of confidence/taint; propose carries taint forward;
 * viaIdea yields a draft idea with no mirror, no kernel write. Determinism-first: the screen
 * computes the verdict from these pure twins, never re-implements the firewall.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type MemoryItem,
	propose,
	TAINTS,
	type Taint,
	toKernel,
	viaIdea,
} from "./firewall";

const arbTaint = fc.constantFrom<Taint>(...TAINTS);

const arbMemory: fc.Arbitrary<MemoryItem> = fc.record({
	id: fc.string(),
	content: fc.string(),
	provenance: fc.string(),
	validityScope: fc.string(),
	expiresAt: fc.string(),
	confidence: fc.double({ min: 0, max: 1, noNaN: true }),
	taint: fc.uniqueArray(arbTaint),
	branch: fc.string(),
});

describe("MemoryFirewall twin — the always-blocked Memory → Kernel edge", () => {
	it("toKernel ALWAYS blocks with MEMORY_CANNOT_DECLARE_TRUTH, regardless of confidence/taint", () => {
		fc.assert(
			fc.property(arbMemory, (m) => {
				const br = toKernel(m);
				expect(br.code).toBe("MEMORY_CANNOT_DECLARE_TRUTH");
				expect(br.howToFix.length).toBeGreaterThan(0);
				expect(
					br.howToFix.some((f) =>
						f.includes(
							"memory_to_contextpack_to_idea_to_mirror_to_goal_to_kernel",
						),
					),
				).toBe(true);
			}),
		);
	});

	it("a clean, fully-confident, untainted memory is STILL blocked", () => {
		const clean: MemoryItem = {
			id: "x",
			content: "surely true",
			provenance: "external_source:the spec",
			validityScope: "",
			expiresAt: "",
			confidence: 1.0,
			taint: [],
			branch: "main",
		};
		expect(toKernel(clean).code).toBe("MEMORY_CANNOT_DECLARE_TRUTH");
	});

	it("propose carries the taint forward — taint never silently drops", () => {
		fc.assert(
			fc.property(arbMemory, fc.string(), (m, goal) => {
				const entry = propose(m, goal);
				expect(entry.taint).toEqual(m.taint);
				expect(entry.memoryId).toBe(m.id);
			}),
		);
	});

	it("viaIdea yields a draft idea pointing back to the memory, with no mirror and no kernel write", () => {
		fc.assert(
			fc.property(arbMemory, (m) => {
				const cand = viaIdea(m);
				expect(cand.status).toBe("draft");
				expect(cand.provenance).toBe(`memory:${m.id}`);
				expect(cand.hasMirror).toBe(false);
				expect(cand.wroteKernel).toBe(false);
			}),
		);
	});
});
