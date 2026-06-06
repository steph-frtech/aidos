import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	CHECKOUT_FLAT,
	CHECKOUT_GRAPH,
	compare,
	decide,
	emitFromFlat,
	emitFromGraph,
	harvest,
	MIN_IDEA_GAIN,
	measure,
	RUNG_ORDER,
} from "./besoin-necessity";

/**
 * besoin-necessity.test.ts — the determinism-first reproducibility mirror for the EL01 spike TS
 * twin. Same need → same backlog → same verdict (no LLM, no clock, no rng), and the front twin
 * agrees with the Go probe: GO (BesoinGraph strictly dominates the flat prompt, reproducible).
 */
describe("besoin necessity spike twin (EL01)", () => {
	it("emits 5 mapping Ideas + 2 NoEmit-seeded rungs from the BesoinGraph", () => {
		const bl = emitFromGraph(CHECKOUT_GRAPH);
		expect(bl.items.length).toBe(5); // product, control, action, operation, entity
		expect(bl.noEmitSeeded).toBe(2); // journey, view seed anchors, emit nothing
		expect(bl.ordered).toBe(true);
		// journey/view never leak into the Idea list.
		for (const it of bl.items) {
			expect(it.rung === "journey" || it.rung === "view").toBe(false);
		}
	});

	it("emits exactly 1 undifferentiated, untyped, unordered candidate from the flat prompt", () => {
		const fl = measure(emitFromFlat(CHECKOUT_FLAT));
		expect(fl.numIdeas).toBe(1);
		expect(fl.numResolved).toBe(0);
		expect(fl.numFullyTyped).toBe(0);
		expect(fl.numAnchored).toBe(0);
		expect(fl.ordered).toBe(false);
	});

	it("the BesoinGraph backlog strictly dominates the flat prompt on every axis", () => {
		const cmp = compare("t", CHECKOUT_GRAPH, CHECKOUT_FLAT);
		expect(cmp.deltaIdeas).toBeGreaterThanOrEqual(MIN_IDEA_GAIN);
		expect(cmp.deltaResolved).toBeGreaterThan(0);
		expect(cmp.deltaFullyTyped).toBeGreaterThan(0);
		expect(cmp.deltaAnchored).toBeGreaterThan(0);
		expect(cmp.graphOrdered).toBe(true);
		expect(cmp.flatOrdered).toBe(false);
		// The exact numbers the Go probe reports.
		expect(cmp.graph.numIdeas).toBe(5);
		expect(cmp.flat.numIdeas).toBe(1);
		expect(cmp.deltaIdeas).toBe(4);
	});

	it("the backlog is topologically ordered in the canonical §23 rung order", () => {
		const bl = emitFromGraph(CHECKOUT_GRAPH);
		const want = ["product", "control", "action", "operation", "entity"];
		expect(bl.items.map((i) => i.rung)).toEqual(want);
		bl.items.forEach((it, i) => {
			expect(it.topoRank).toBe(i);
		});
		// the deepest mapping rung (entity) carries the NoEmit journey/view in anchors_above.
		const last = bl.items[bl.items.length - 1];
		expect(last.anchorsAbove).toContain("journey");
		expect(last.anchorsAbove).toContain("view");
	});

	it("the necessity verdict is GO", () => {
		const v = decide();
		expect(v.go).toBe(true);
		expect(v.reproducible).toBe(true);
	});

	it("the harvested lesson is a DRAFT Idea with NO mirror and NO frozen version (the wall)", () => {
		const d = harvest();
		expect(d.hasMirror).toBe(false);
		expect(d.hasVersion).toBe(false);
		expect(d.status).toBe("draft");
		expect(d.provenanceKind).toBe("human");
		expect(d.intent.length).toBeGreaterThan(0);
		expect(d.openQuestions.length).toBeGreaterThan(0);
	});

	it("the rung order is the total, closed §23 verticale", () => {
		expect(RUNG_ORDER).toEqual([
			"product",
			"journey",
			"view",
			"control",
			"action",
			"operation",
			"entity",
		]);
	});

	it("decide is reproducible (determinism-first): same verdict + deltas across many runs", () => {
		const first = decide();
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 1000 }), () => {
				const v = decide();
				return (
					v.go === first.go &&
					v.cmp.deltaIdeas === first.cmp.deltaIdeas &&
					v.cmp.graph.numIdeas === first.cmp.graph.numIdeas &&
					v.cmp.flat.numIdeas === first.cmp.flat.numIdeas
				);
			}),
			{ numRuns: 200 },
		);
	});
});
