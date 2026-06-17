import { describe, expect, it } from "vitest";
import {
	cleanCut,
	demoMeasure,
	gatewayGraphArgs,
} from "../../../lib/arch-fitness-data";
import { metricDecoder } from "./live";

/**
 * /v3/arch-fitness lecture live — le MIROIR DE PARITÉ (Vitest, le slot N1 front frozen ; ADR 0092
 * batch kill-twins).
 *
 * Il prouve que le `metricDecoder` TS décode un ÉCHANTILLON de la sortie de l'outil Go arch-fitness
 * `measure` (archfitnesssrv.measureOutput : `{ ok, metric }`, la métrique étant
 * archfitness.StructuralMetric aux champs snake_case) — le CONTRAT de l'outil, PAS une seconde
 * implémentation de la logique de métrique structurelle (le Go archfitness.Measure est autoritaire).
 * Ce test pinne uniquement que la forme du fil décode fidèlement (l'enveloppe `metric`, les quatre
 * comptes snake_case, les témoins violations/cycles, une liste de témoins absente) et qu'un payload
 * malformé retombe DÉTERMINISTIQUEMENT sur la métrique de démo.
 *
 * DÉTERMINISME-FIRST (§6/§8) : même entrée → même verdict, zéro LLM.
 */

describe("v3/arch-fitness live — measure decoder parity", () => {
	it("decodes a Go-sample measureOutput (clean contracted cut)", () => {
		const goSample = {
			ok: true,
			metric: {
				project: "shop",
				boundary_violations: 0,
				inter_cell_cycles: 0,
				inter_bc_edges: 1,
				max_cell_complexity: 5,
				violations: [],
				cycles: [],
			},
		};
		const decoded = metricDecoder(goSample);
		expect(decoded).toEqual({
			project: "shop",
			boundaryViolations: 0,
			interCellCycles: 0,
			interBcEdges: 1,
			maxCellComplexity: 5,
			violations: [],
			cycles: [],
		});
	});

	it("decodes a metric carrying boundary-violation + cycle witnesses", () => {
		const decoded = metricDecoder({
			ok: true,
			metric: {
				project: "shop",
				boundary_violations: 1,
				inter_cell_cycles: 1,
				inter_bc_edges: 2,
				max_cell_complexity: 5,
				violations: [
					{
						from: "checkout.price",
						from_cell: "checkout",
						to: "catalog.lookup",
						to_cell: "catalog",
					},
				],
				cycles: [["checkout", "billing"]],
			},
		});
		expect(decoded?.boundaryViolations).toBe(1);
		expect(decoded?.violations[0]).toEqual({
			from: "checkout.price",
			fromCell: "checkout",
			to: "catalog.lookup",
			toCell: "catalog",
		});
		expect(decoded?.cycles).toEqual([["checkout", "billing"]]);
	});

	it("tolerates a flat payload (metric fields at the root) and absent witnesses", () => {
		const decoded = metricDecoder({
			project: "shop",
			boundary_violations: 0,
			inter_cell_cycles: 0,
			inter_bc_edges: 0,
			max_cell_complexity: 3,
		});
		expect(decoded?.project).toBe("shop");
		expect(decoded?.violations).toEqual([]);
		expect(decoded?.cycles).toEqual([]);
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(metricDecoder(null)).toBeNull();
		expect(metricDecoder({})).toBeNull(); // pas de metric, pas de champs plats
		// un compte requis manquant → null.
		expect(
			metricDecoder({
				metric: {
					project: "shop",
					boundary_violations: 0,
					inter_cell_cycles: 0,
					inter_bc_edges: 1,
					// max_cell_complexity manquant
				},
			}),
		).toBeNull();
		// un compte non-numérique → null.
		expect(
			metricDecoder({
				metric: {
					project: "shop",
					boundary_violations: "x",
					inter_cell_cycles: 0,
					inter_bc_edges: 1,
					max_cell_complexity: 5,
				},
			}),
		).toBeNull();
	});

	it("the demo metric matches the decoded clean cut (twin ≡ the live contract shape)", () => {
		// Le repli de démo est le measure() du twin de la coupe propre ; le round-tripper à travers la
		// projection d'args passerelle + le décodeur donne la MÊME forme de métrique que la lecture
		// live renvoie — le twin est derrière source:"demo", identique en forme à la métrique live
		// autoritaire du Go.
		const demo = demoMeasure("shop");
		expect(demo.project).toBe("shop");
		expect(demo.boundaryViolations).toBe(0);
		expect(demo.interCellCycles).toBe(0);
		// la projection d'args passerelle de la coupe propre porte le contrat honoré en fédération.
		const args = gatewayGraphArgs(cleanCut("shop"));
		expect(args.federation).toEqual({
			contracts: [{ a: "checkout", b: "billing", honored: true }],
		});
	});
});
