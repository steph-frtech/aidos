/**
 * lib/besoin-candescend.test.ts — the EL07 TS-twin reproducibility mirror (vitest + fast-check).
 * Pins the twin is byte-equivalent to the Go authority: canDescend / shrinkOptionSpace are pure,
 * deterministic, and obey the anti-vacuity law (CLAUDE.md §6/§8).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	canDescend,
	type NodeInput,
	shrinkOptionSpace,
} from "./besoin-candescend";
import { optionSpaceFor } from "./besoin-thresholds";

function productNode(selects: string[]): NodeInput {
	return {
		level: "product",
		body: { intent: "x", scenarios: ["s1"], selects },
		refsTo: ["journey"],
		present: true,
	};
}

const JOURNEY_CHOICES = optionSpaceFor("product", "journey")?.choices ?? [];

describe("shrinkOptionSpace (EL07 anti-vacuity count)", () => {
	it("prunes N − k when selecting k of N declared archetypes", () => {
		const n = productNode(["onboarding", "core-task"]);
		expect(shrinkOptionSpace(n, "product")).toBe(JOURNEY_CHOICES.length - 2);
	});

	it("is 0 when selecting nothing (vacant)", () => {
		expect(shrinkOptionSpace(productNode([]), "product")).toBe(0);
	});

	it("is 0 when selecting only invalid choices", () => {
		expect(
			shrinkOptionSpace(productNode(["not-a-real-archetype"]), "product"),
		).toBe(0);
	});

	it("is reproducible — same node → same count", () => {
		const n = productNode(["onboarding"]);
		const first = shrinkOptionSpace(n, "product");
		for (let i = 0; i < 50; i++) {
			expect(shrinkOptionSpace(n, "product")).toBe(first);
		}
	});

	it("is the positive sentinel for the non-enumerable operation→entity pair", () => {
		const op: NodeInput = {
			level: "operation",
			body: { steps: ["s"], fixture: "f", selects: ["create"] },
			refsTo: [],
			present: true,
		};
		expect(shrinkOptionSpace(op, "operation")).toBeGreaterThan(0);
	});
});

describe("canDescend (EL07 forcing verdict)", () => {
	it("a right-sized, narrowing product is enough", () => {
		const v = canDescend(
			productNode(["onboarding", "core-task"]),
			"product",
			true,
		);
		expect(v.enough).toBe(true);
		expect(v.blockReasons).toHaveLength(0);
	});

	it("a parsable-but-non-constraining product is not_enough (anti-vacuity)", () => {
		const v = canDescend(productNode([]), "product", true);
		expect(v.enough).toBe(false);
		expect(v.blockReasons.map((b) => b.code)).toContain(
			"BESOIN_OPTION_SPACE_NOT_NARROWED",
		);
	});

	it("incomplete metadata is not_enough", () => {
		const v = canDescend(productNode(["onboarding"]), "product", false);
		expect(v.enough).toBe(false);
		expect(v.blockReasons.map((b) => b.code)).toContain(
			"BESOIN_METADATA_INCOMPLETE",
		);
	});

	it("too many scenarios is not_enough (declared threshold)", () => {
		const n = productNode(["onboarding"]);
		n.body.scenarios = ["a", "b", "c", "d", "e", "f"]; // > maxScenarios (5)
		const v = canDescend(n, "product", true);
		expect(v.enough).toBe(false);
		expect(v.blockReasons.map((b) => b.code)).toContain(
			"BESOIN_BODY_VACANT_OR_MALFORMED",
		);
	});

	it("an operation forward dep toward entity carries an OpenQuestion, enough=true", () => {
		const op: NodeInput = {
			level: "operation",
			body: { steps: ["s"], fixture: "f", selects: ["create"] },
			refsTo: [],
			present: true,
		};
		const v = canDescend(op, "operation", true);
		expect(v.enough).toBe(true);
		expect(v.openQuestions.length).toBeGreaterThan(0);
		expect(v.blockReasons).toHaveLength(0);
	});

	it("an absent node is not_enough", () => {
		const v = canDescend(
			{ level: "product", body: {}, refsTo: [], present: false },
			"product",
			true,
		);
		expect(v.enough).toBe(false);
		expect(v.blockReasons.map((b) => b.code)).toContain("BESOIN_NODE_ABSENT");
	});

	it("property: a non-narrowing product is never enough; narrowing never carries anti-vacuity block", () => {
		fc.assert(
			fc.property(fc.subarray(JOURNEY_CHOICES), (selects) => {
				const v = canDescend(productNode(selects), "product", true);
				const shrink = shrinkOptionSpace(productNode(selects), "product");
				if (shrink === 0) {
					return (
						v.enough === false &&
						v.blockReasons.some(
							(b) => b.code === "BESOIN_OPTION_SPACE_NOT_NARROWED",
						)
					);
				}
				return !v.blockReasons.some(
					(b) => b.code === "BESOIN_OPTION_SPACE_NOT_NARROWED",
				);
			}),
		);
	});

	it("property: canDescend is reproducible", () => {
		fc.assert(
			fc.property(fc.subarray(JOURNEY_CHOICES), (selects) => {
				const first = canDescend(productNode(selects), "product", true);
				for (let i = 0; i < 10; i++) {
					const again = canDescend(productNode(selects), "product", true);
					if (
						again.enough !== first.enough ||
						again.blockReasons.length !== first.blockReasons.length
					) {
						return false;
					}
				}
				return true;
			}),
		);
	});
});
