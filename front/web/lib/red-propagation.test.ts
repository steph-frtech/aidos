/**
 * Reproducibility mirror (∀) for the weighted red-propagation projection (lib/red-propagation.ts),
 * the TS twin of back/kernel/propagation's rapid property test. fast-check is the frozen front
 * invariant slot (ADR 0003). It pins KRD §112 + ADR 0018: fireParent is total + deterministic, a
 * cosmetic-only change never reddens a parent with a positive threshold, a critical link without
 * evidence is always rejected, and the tier ordering is monotone. Plus the §114 worked-example
 * unit rows (the done criteria, rendered by /red-propagation).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	activation,
	fireParent,
	type Graph,
	type Link,
	validateWeight,
	type Weight,
} from "./red-propagation";
import { buildCartGraph } from "./red-propagation-data";

const ALL_WEIGHTS: readonly Weight[] = ["cosmetic", "load-bearing", "critical"];

const weightArb = fc.constantFrom<Weight>(...ALL_WEIGHTS);

/** A random single-parent graph: parent "p" with a drawn threshold and n weighted children. */
const graphArb = fc
	.record({
		threshold: fc.constantFrom(0, 1, 2),
		children: fc.array(
			fc.record({ weight: weightArb, changed: fc.boolean() }),
			{ maxLength: 6 },
		),
	})
	.map(({ threshold, children }): Graph => {
		const edges: Link[] = children.map((c, i) => ({
			parent: { id: "p", version: "v1" },
			child: { id: `c${i}`, version: "v1" },
			weight: c.weight,
		}));
		const changed = children
			.map((c, i) => (c.changed ? `c${i}` : null))
			.filter((x): x is string => x !== null);
		return {
			parents: {
				p: { layerId: "p", version: "v1", activationThreshold: threshold },
			},
			edges,
			changed,
		};
	});

describe("fireParent — §112 weighted, thresholded fire", () => {
	it("is total and deterministic (always GREEN|RED, same input ⇒ same verdict)", () => {
		fc.assert(
			fc.property(graphArb, (g) => {
				const v1 = fireParent(g, "p");
				const v2 = fireParent(g, "p");
				expect(v1 === "GREEN" || v1 === "RED").toBe(true);
				expect(v1).toBe(v2);
			}),
		);
	});

	it("cosmetic-only changes never redden a parent with threshold > 0 (the done invariant)", () => {
		const cosmeticGraphArb = fc
			.record({
				threshold: fc.constantFrom(1, 2),
				n: fc.integer({ min: 0, max: 6 }),
				changedMask: fc.array(fc.boolean(), { maxLength: 6 }),
			})
			.map(({ threshold, n, changedMask }): Graph => {
				const edges: Link[] = Array.from({ length: n }, (_, i) => ({
					parent: { id: "p", version: "v1" },
					child: { id: `c${i}`, version: "v1" },
					weight: "cosmetic" as const,
				}));
				const changed = edges
					.map((e, i) => (changedMask[i] ? e.child.id : null))
					.filter((x): x is string => x !== null);
				return {
					parents: {
						p: { layerId: "p", version: "v1", activationThreshold: threshold },
					},
					edges,
					changed,
				};
			});
		fc.assert(
			fc.property(cosmeticGraphArb, (g) => {
				expect(fireParent(g, "p")).toBe("GREEN");
			}),
		);
	});
});

describe("validateWeight — §112/§2463 admission discipline", () => {
	it("rejects critical without evidence and accepts every other admissible link", () => {
		fc.assert(
			fc.property(
				weightArb,
				fc.option(fc.constant("INC-2026-014"), { nil: undefined }),
				(weight, evidence) => {
					const br = validateWeight({ weight, weightEvidence: evidence });
					if (weight === "critical" && !evidence) {
						expect(br).not.toBeNull();
						expect(br?.code).toBe("CRITICAL_WEIGHT_WITHOUT_EVIDENCE");
						expect(br?.howToFix.length).toBeGreaterThan(0);
					} else {
						expect(br).toBeNull();
					}
				},
			),
		);
	});
});

describe("activation — monotone tier ordering (ADR 0018, never learned)", () => {
	it("critical ≥ load-bearing ≥ cosmetic, critical strictly > cosmetic", () => {
		expect(activation("critical")).toBeGreaterThanOrEqual(
			activation("load-bearing"),
		);
		expect(activation("load-bearing")).toBeGreaterThanOrEqual(
			activation("cosmetic"),
		);
		expect(activation("critical")).toBeGreaterThan(activation("cosmetic"));
	});
});

describe("§114 cart worked example — the done criteria", () => {
	it("a cosmetic change (help-link) leaves the cart aggregate GREEN", () => {
		expect(fireParent(buildCartGraph(["help-link"]), "cart")).toBe("GREEN");
	});
	it("a load-bearing change (checkout-button) reddens the cart aggregate", () => {
		expect(fireParent(buildCartGraph(["checkout-button"]), "cart")).toBe("RED");
	});
	it("a critical weight without evidence is rejected", () => {
		expect(validateWeight({ weight: "critical" })?.code).toBe(
			"CRITICAL_WEIGHT_WITHOUT_EVIDENCE",
		);
	});
	it("a critical weight with evidence is accepted", () => {
		expect(
			validateWeight({ weight: "critical", weightEvidence: "INC-2026-014" }),
		).toBeNull();
	});
});
