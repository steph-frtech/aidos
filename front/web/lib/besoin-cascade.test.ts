/**
 * lib/besoin-cascade.test.ts — the EL08 TS-twin reproducibility mirror (vitest + fast-check). Pins the
 * twin is byte-equivalent to the Go authority (back/runtime/besoin/cascade.go): anchorsAbove, descend,
 * shrinkOptionSpaceCascade and reopenAnchor are pure/deterministic and obey the compound law
 * (CLAUDE.md §6/§8): a premature descent is refused; |OptionSpace| is strictly smaller under a frozen
 * anchor; reopening a frozen anchor needs a ChangeSet (anti-overwrite §9).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	anchorsAbove,
	type CascadeNode,
	descend,
	isAnchored,
	reopenAnchor,
	shrinkOptionSpaceCascade,
} from "./besoin-cascade";
import { optionSpaceFor } from "./besoin-thresholds";

const JOURNEY_CHOICES = optionSpaceFor("product", "journey")?.choices ?? [];

function frozenProduct(selects: string[]): CascadeNode {
	return {
		level: "product",
		body: { intent: "x", scenarios: ["créer", "cocher"], selects },
		status: "resolved",
		refsTo: ["journey"],
	};
}

describe("anchorsAbove (EL08 frozen grounding)", () => {
	it("returns only frozen rungs strictly above, in descent order", () => {
		const nodes: CascadeNode[] = [
			frozenProduct(["onboarding"]),
			{
				level: "journey",
				body: { gherkin: "Given x When y Then z" },
				status: "drafting",
				refsTo: ["view"],
			},
		];
		const anchors = anchorsAbove(nodes, "view");
		expect(anchors.map((a) => a.level)).toEqual(["product"]);
		expect(anchorsAbove(nodes, "product")).toEqual([]);
	});

	it("a band has no descent position → no anchors", () => {
		expect(anchorsAbove([frozenProduct(["onboarding"])], "policy")).toEqual([]);
	});

	it("isAnchored requires a frozen rung above", () => {
		const nodes = [frozenProduct(["onboarding"])];
		expect(isAnchored(nodes, "journey")).toBe(true);
		expect(isAnchored(nodes, "product")).toBe(false);
	});
});

describe("descend (premature descent refused)", () => {
	it("refuses descent when the source rung is not right-sized", () => {
		const res = descend([frozenProduct([])], "product", true);
		expect(res.ok).toBe(false);
		expect(res.refusal?.blockReasons.map((b) => b.code)).toContain(
			"CANNOT_DESCEND_LEVEL_NOT_RIGHTSIZED",
		);
	});

	it("opens the next rung when right-sized", () => {
		const res = descend(
			[frozenProduct(["onboarding", "core-task"])],
			"product",
			true,
		);
		expect(res.ok).toBe(true);
		expect(res.opened).toBe("journey");
	});
});

describe("shrinkOptionSpaceCascade (compound measured)", () => {
	it("is strictly smaller under a frozen anchor", () => {
		const cs = shrinkOptionSpaceCascade(
			[frozenProduct(["onboarding", "core-task"])],
			"product",
		);
		expect(cs.enumerable).toBe(true);
		expect(cs.before).toBe(JOURNEY_CHOICES.length);
		expect(cs.after).toBe(2);
		expect(cs.after).toBeLessThan(cs.before);
		expect(cs.shrink).toBe(JOURNEY_CHOICES.length - 2);
	});

	it("does not narrow without a frozen anchor (drafting product)", () => {
		const drafting: CascadeNode = {
			level: "product",
			body: { intent: "x", scenarios: ["a"], selects: ["onboarding"] },
			status: "drafting",
			refsTo: ["journey"],
		};
		const cs = shrinkOptionSpaceCascade([drafting], "product");
		expect(cs.shrink).toBe(0);
		expect(cs.after).toBe(cs.before);
	});

	it("carries the positive sentinel for the non-enumerable operation→entity pair", () => {
		const op: CascadeNode = {
			level: "operation",
			body: { steps: ["s"], fixture: "f", selects: ["create"] },
			status: "resolved",
			refsTo: [],
		};
		const cs = shrinkOptionSpaceCascade([op], "operation");
		expect(cs.enumerable).toBe(false);
		expect(cs.shrink).toBeGreaterThan(0);
		expect(cs.openQuestion).not.toBe("");
	});
});

describe("reopenAnchor (anti-overwrite §9)", () => {
	it("refuses reopening a frozen anchor without a ChangeSet", () => {
		const res = reopenAnchor(frozenProduct(["onboarding"]), "");
		expect(res.ok).toBe(false);
		expect(res.code).toBe("BESOIN_ANCHOR_OVERWRITE");
	});

	it("allows the reopen with a ChangeSet (recorded decision, prior body preserved)", () => {
		const res = reopenAnchor(frozenProduct(["onboarding"]), "cs-42");
		expect(res.ok).toBe(true);
		expect(res.reopened?.status).toBe("drafting");
		expect(res.reopened?.body.selects).toEqual(["onboarding"]);
	});

	it("an unfrozen node needs no ChangeSet", () => {
		const drafting: CascadeNode = {
			level: "product",
			body: { selects: ["onboarding"] },
			status: "drafting",
			refsTo: ["journey"],
		};
		expect(reopenAnchor(drafting, "").ok).toBe(true);
	});
});

describe("EL08 reproducibility + compound law (fast-check)", () => {
	it("shrinkOptionSpaceCascade is reproducible and obeys N − k", () => {
		fc.assert(
			fc.property(
				fc.uniqueArray(fc.constantFrom(...JOURNEY_CHOICES)),
				(selects) => {
					const cs = shrinkOptionSpaceCascade(
						[frozenProduct(selects)],
						"product",
					);
					const again = shrinkOptionSpaceCascade(
						[frozenProduct(selects)],
						"product",
					);
					expect(again).toEqual(cs);
					expect(cs.before).toBe(JOURNEY_CHOICES.length);
					if (selects.length === 0) {
						expect(cs.shrink).toBe(0);
						expect(cs.after).toBe(cs.before);
					} else {
						expect(cs.after).toBe(selects.length);
						expect(cs.shrink).toBe(JOURNEY_CHOICES.length - selects.length);
						if (selects.length < JOURNEY_CHOICES.length) {
							expect(cs.after).toBeLessThan(cs.before);
						}
					}
				},
			),
		);
	});

	it("reopenAnchor is fail-closed without a ChangeSet, open with one", () => {
		fc.assert(
			fc.property(fc.boolean(), fc.string(), (frozen, cs) => {
				const node: CascadeNode = {
					level: "product",
					body: { selects: ["onboarding"] },
					status: frozen ? "resolved" : "drafting",
					refsTo: ["journey"],
				};
				const res = reopenAnchor(node, cs);
				if (frozen && cs.trim() === "") expect(res.ok).toBe(false);
				else expect(res.ok).toBe(true);
			}),
		);
	});
});
