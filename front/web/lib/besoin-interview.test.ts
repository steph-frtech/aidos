/**
 * lib/besoin-interview.test.ts — EL13 reproducibility mirror (Vitest + fast-check): the TS twin of the
 * interview is DETERMINISTIC and code-authoritative (CLAUDE.md §6/§8). The properties pin: dispatchOf is
 * total over the grammar; enterableLevel ranges only over SOURCE rungs; recordAnswer is deterministic;
 * `resolved` is COMPUTED (= canDescend.enough), never declared; an off-altitude / fuzzy turn does not
 * record; the spike route is the legal three-hop gate.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canDescend, type NodeInput } from "./besoin-candescend";
import { allLevels, type Level, levels, outgoingRef } from "./besoin-grammar";
import {
	dispatchableLevels,
	dispatchOf,
	enterableLevel,
	recordAnswer,
	SPIKE_GATE,
} from "./besoin-interview";

const GESTURES = new Set(["grill", "view", "action", "generic"]);

describe("dispatchOf — total over the grammar, fail-closed otherwise", () => {
	it("maps every grammar level to a closed-set gesture", () => {
		for (const l of allLevels()) {
			const { gesture, ok } = dispatchOf(l);
			expect(ok).toBe(true);
			expect(GESTURES.has(gesture)).toBe(true);
		}
	});
	it("fails closed for an out-of-grammar level", () => {
		expect(dispatchOf("nonsense")).toEqual({ gesture: "generic", ok: false });
	});
	it("product dispatches to grill, view to view, control/action to action", () => {
		expect(dispatchOf("product").gesture).toBe("grill");
		expect(dispatchOf("view").gesture).toBe("view");
		expect(dispatchOf("control").gesture).toBe("action");
		expect(dispatchOf("action").gesture).toBe("action");
	});
	it("dispatchableLevels lists all 9 grammar levels", () => {
		expect(dispatchableLevels()).toHaveLength(allLevels().length);
	});
});

// emptyNode is an absent node (every level not-enough) so enterableLevel returns the first SOURCE rung.
const emptyNode = (l: Level): NodeInput => ({
	level: l,
	body: {},
	refsTo: [],
	present: false,
});

describe("enterableLevel — only SOURCE rungs, deterministic", () => {
	it("a fresh graph enters at product", () => {
		const l = enterableLevel(emptyNode, () => true);
		expect(l).toBe("product");
		// never a transversal band.
		expect(levels()).toContain(l);
	});
	it("is deterministic", () => {
		const a = enterableLevel(emptyNode, () => true);
		const b = enterableLevel(emptyNode, () => true);
		expect(a).toBe(b);
	});
});

describe("recordAnswer — code judges; resolved is computed", () => {
	it("a right-sized product is recorded and resolved", () => {
		const body = {
			intent: "Un suivi de tâches",
			scenarios: ["créer", "cocher"],
			selects: ["onboarding", "core-task"],
		};
		const r = recordAnswer("product", body, true, false);
		expect(r.routing).toBe("record");
		expect(r.resolved).toBe(true);
		// resolved EQUALS the canDescend verdict over the recorded node (computed, never declared).
		const ref = outgoingRef("product");
		const node: NodeInput = {
			level: "product",
			body,
			refsTo: ref ? [ref.refTo] : [],
			present: true,
		};
		expect(r.resolved).toBe(canDescend(node, "product", true).enough);
	});

	it("an entity attributes body at product is rejected by schema (off-altitude)", () => {
		const r = recordAnswer(
			"product",
			{ attributes: ["id", "title"] },
			true,
			false,
		);
		expect(r.routing).toBe("off_altitude");
		expect(r.resolved).toBe(false);
		expect(r.blockReason?.explanation).toContain("schéma");
	});

	it("a fuzzy answer routes to /spike via the legal three-hop gate", () => {
		const body = {
			intent: "rendre heureux",
			scenarios: ["être heureux"],
			selects: ["onboarding"],
		};
		const r = recordAnswer("product", body, true, true);
		expect(r.routing).toBe("spike");
		expect(r.spikeRoute).toEqual([...SPIKE_GATE]);
		expect(r.resolved).toBe(false);
	});

	it("a product that satisfies the schema but selects nothing is recorded yet not resolved (anti-vacuity)", () => {
		// intent + scenarios satisfy the product schema (so NOT off-altitude), but selecting no view
		// archetype leaves the anti-vacuity branch open → recorded, not resolved.
		const r = recordAnswer(
			"product",
			{ intent: "x", scenarios: ["créer"], selects: [] },
			true,
			false,
		);
		expect(r.routing).toBe("record");
		expect(r.resolved).toBe(false);
		expect(r.openBranches.length).toBeGreaterThan(0);
	});

	it("a product missing a required field (scenarios) fails its own schema (off-altitude)", () => {
		// A body missing a declared required field of its own level is a schema mismatch (EL12) — the
		// honest, consistent verdict: it does not even satisfy the current rung's field-set.
		const r = recordAnswer(
			"product",
			{ intent: "x", selects: ["onboarding"] },
			true,
			false,
		);
		expect(r.routing).toBe("off_altitude");
		expect(r.resolved).toBe(false);
	});
});

describe("recordAnswer — deterministic (same input → same output)", () => {
	it("property: identical args yield identical results", () => {
		fc.assert(
			fc.property(
				fc.boolean(),
				fc.boolean(),
				fc.array(fc.string(), { maxLength: 7 }),
				(metaComplete, routeToSpike, scenarios) => {
					const body = { intent: "x", scenarios, selects: ["onboarding"] };
					const r1 = recordAnswer("product", body, metaComplete, routeToSpike);
					const r2 = recordAnswer("product", body, metaComplete, routeToSpike);
					expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
				},
			),
		);
	});
});
