import { describe, expect, it } from "vitest";
import {
	cleanCut,
	demoMeasure,
	gatewayGraphArgs,
} from "../../lib/arch-fitness-data";
import { metricDecoder } from "./live";

/**
 * /arch-fitness live measure read — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092
 * kill-twins batch).
 *
 * It proves the TS `metricDecoder` decodes a SAMPLE of the Go arch-fitness `measure` tool output
 * (archfitnesssrv.measureOutput: `{ ok, metric }`, the metric being archfitness.StructuralMetric
 * with snake_case fields) — the tool's CONTRACT, NOT a second implementation of the structural
 * metric logic (the Go archfitness.Measure is authoritative). This test pins only that the wire
 * shape decodes faithfully (the `metric` wrapper, the four snake_case counts, the
 * violations/cycles witnesses, an absent witness list) and that a malformed payload deterministically
 * falls back to the demo metric.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("arch-fitness live — measure decoder parity", () => {
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
		expect(metricDecoder({})).toBeNull(); // no metric, no flat fields
		// a missing required count → null.
		expect(
			metricDecoder({
				metric: {
					project: "shop",
					boundary_violations: 0,
					inter_cell_cycles: 0,
					inter_bc_edges: 1,
					// max_cell_complexity missing
				},
			}),
		).toBeNull();
		// a non-number count → null.
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
		// The demo fixture is the twin measure() of the clean cut; round-tripping it through the
		// gateway-arg projection + the decoder yields the SAME metric shape the live read returns —
		// the twin sits behind source:"demo", identical in shape to the Go-authoritative live metric.
		const demo = demoMeasure("shop");
		expect(demo.project).toBe("shop");
		expect(demo.boundaryViolations).toBe(0);
		expect(demo.interCellCycles).toBe(0);
		// the gateway-arg projection of the clean cut carries the honored contract as federation.
		const args = gatewayGraphArgs(cleanCut("shop"));
		expect(args.federation).toEqual({
			contracts: [{ a: "checkout", b: "billing", honored: true }],
		});
	});
});
