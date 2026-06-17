import { describe, expect, it } from "vitest";
import {
	demoAggregate,
	demoComposes,
	toComposesTree,
} from "../../../lib/v2/kernel-tree-data";
import { aggregateDecoder } from "./live";

/**
 * /v3/arbres live tree_aggregate read — le MIROIR DE PARITÉ (Vitest, le slot N1 front gelé ; ADR
 * 0092 kill-twins).
 *
 * Il prouve que le décodeur TS `aggregateDecoder` décode un ÉCHANTILLON de la sortie de l'outil Go
 * `tree_aggregate` (kerneltreesrv.aggregateOutput : `{ ok, verdict, drill_down:[{layer_id,version,
 * own_mirror,aggregate}], cycle, error }`) — le CONTRAT de l'outil, PAS une seconde implémentation
 * de la loi §109 (le Go composes.Aggregate est autoritatif). Ce test épingle seulement que la forme
 * du fil décode fidèlement (le verdict GREEN|RED, le drill-down §110, le refus de cycle
 * CAUSED_BY_CYCLE) et qu'un payload malformé retombe déterministiquement sur le verdict-démo.
 *
 * + un témoin de PARITÉ DÉMO ≡ CONTRAT LIVE : le verdict-démo (la même loi récursive pure
 * reproduite localement) a la MÊME forme que le verdict live — le twin sit derrière source:"demo".
 *
 * DÉTERMINISME-FIRST (§6/§8) : même entrée → même verdict, zéro LLM.
 */

describe("arbres live — tree_aggregate decoder parity", () => {
	it("decodes a Go-sample aggregateOutput (a green whole)", () => {
		const goSample = {
			ok: true,
			verdict: "GREEN",
			drill_down: [
				{
					layer_id: "whole",
					version: "v1",
					own_mirror: "GREEN",
					aggregate: "GREEN",
				},
			],
		};
		const decoded = aggregateDecoder(goSample);
		expect(decoded).toEqual({
			verdict: "GREEN",
			drillDown: [
				{
					layerId: "whole",
					version: "v1",
					ownMirror: "GREEN",
					aggregate: "GREEN",
				},
			],
			cycle: [],
		});
	});

	it("decodes a RED verdict carrying the §110 drill-down to the red child", () => {
		const decoded = aggregateDecoder({
			ok: true,
			verdict: "RED",
			drill_down: [
				{
					layer_id: "whole",
					version: "v1",
					own_mirror: "GREEN",
					aggregate: "RED",
				},
				{
					layer_id: "part",
					version: "v1",
					own_mirror: "RED",
					aggregate: "RED",
				},
			],
		});
		expect(decoded?.verdict).toBe("RED");
		expect(decoded?.drillDown).toHaveLength(2);
		expect(decoded?.drillDown[1]).toEqual({
			layerId: "part",
			version: "v1",
			ownMirror: "RED",
			aggregate: "RED",
		});
	});

	it("decodes a typed cycle refusal (ok:false + cycle) into a RED verdict + the named cycle", () => {
		const decoded = aggregateDecoder({
			ok: false,
			error: "CAUSED_BY_CYCLE",
			cycle: ["a", "b", "a"],
		});
		expect(decoded).toEqual({
			verdict: "RED",
			drillDown: [],
			cycle: ["a", "b", "a"],
		});
	});

	it("tolerates an absent drill_down / cycle (decodes to [])", () => {
		const decoded = aggregateDecoder({ ok: true, verdict: "GREEN" });
		expect(decoded).toEqual({ verdict: "GREEN", drillDown: [], cycle: [] });
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(aggregateDecoder(null)).toBeNull();
		expect(aggregateDecoder({})).toBeNull(); // no verdict
		// a verdict outside {GREEN,RED} → null.
		expect(aggregateDecoder({ ok: true, verdict: "MAYBE" })).toBeNull();
		// a drill-down step missing layer_id → null.
		expect(
			aggregateDecoder({
				ok: true,
				verdict: "RED",
				drill_down: [{ own_mirror: "RED", aggregate: "RED" }],
			}),
		).toBeNull();
		// ok:false WITHOUT a cycle (some other typed error) → null (→ demo).
		expect(aggregateDecoder({ ok: false, error: "boom" })).toBeNull();
	});

	it("the demo verdict matches the decoded live contract shape (twin ≡ the live shape)", () => {
		// Le verdict-démo (la loi §109 pure reproduite) a la MÊME forme que le verdict live :
		// le re-décoder à travers la projection du fil donne un verdict structurellement identique.
		const roots = demoComposes(40);
		const rootId = roots[0]?.id ?? "";
		const demo = demoAggregate(roots, rootId);
		expect(demo.verdict === "GREEN" || demo.verdict === "RED").toBe(true);
		expect(Array.isArray(demo.drillDown)).toBe(true);
		// projeter le verdict-démo au format fil Go puis le re-décoder → le MÊME verdict.
		const wire = {
			ok: true,
			verdict: demo.verdict,
			drill_down: demo.drillDown.map((s) => ({
				layer_id: s.layerId,
				version: s.version,
				own_mirror: s.ownMirror,
				aggregate: s.aggregate,
			})),
			cycle: demo.cycle,
		};
		expect(aggregateDecoder(wire)).toEqual(demo);
	});

	it("the composes tree projection carries one edge per non-root node (the §17 relation)", () => {
		const roots = demoComposes(30);
		const tree = toComposesTree(roots);
		// un projet = UN produit (UNE racine) → exactement (N-1) arêtes pour N nœuds.
		expect(tree.edges.length).toBe(tree.nodes.length - 1);
		// chaque arête porte un poids déclaré (§112) — jamais inventé.
		for (const e of tree.edges) {
			expect(e.weight === "load-bearing" || e.weight === "cosmetic").toBe(true);
		}
	});
});
