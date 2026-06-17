/**
 * arch-fitness-data — the DETERMINISTIC demo fixture for the /arch-fitness panel (S59 cutover,
 * ADR 0092). It holds the canonical §46 checkout-federation cut + the twin `measure()` of it as
 * the demo `StructuralMetric` the panel falls back to when the gateway is unreachable
 * (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before S59 /arch-fitness computed its
 * displayed metric from the TS twin `lib/arch-fitness.measure()` directly — the twin WAS the live
 * source. S59 routes `measureAction` through the Go engine via the passerelle
 * (`readVia(scope, "measure", …)`, the dispatched below-the-line read of the arch-fitness MCP
 * server); this fixture is KEPT only as the deterministic fallback. The presence of this
 * `-data.ts` sibling is also what makes the T5 cliquet (twin-as-live-fitness) RECOGNISE
 * `lib/arch-fitness` as a twin — the panel stays GREEN because `actions.ts` imports the
 * `readVia` frontier (the witness the twin sits behind `source:"demo"`).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the demo metric is the same PURE twin compute the Go
 * `archfitness.Measure` reproduces — same graph → byte-identical metric. The parity mirror
 * arch-fitness-parity.test.ts pins the decoder shape == the Go measureOutput contract.
 */

import { type DepGraph, measure, type StructuralMetric } from "./arch-fitness";

/**
 * cleanCut is the canonical CLEAN cut of the §46 checkout federation: checkout depends on
 * billing across the HONORED contract; no violation, no cycle. The BASELINE the ratchet protects.
 * It is the graph the panel sends to the gateway `measure` tool AND the input to the demo metric.
 */
export function cleanCut(projectId: string): DepGraph {
	return {
		project: projectId || "shop",
		cells: { checkout: 5, billing: 3, catalog: 4 },
		honored: [{ a: "checkout", b: "billing" }],
		edges: [
			{
				from: "checkout.place",
				fromCell: "checkout",
				to: "billing.charge",
				toCell: "billing",
			},
		],
	};
}

/**
 * gatewayGraphArgs maps the front DepGraph to the Go `archfitness.DepGraph` JSON shape the
 * gateway `measure` tool expects: cells map, edges with `from_cell`/`to_cell`, and the
 * `federation.contracts` list (the front's `honored:[{a,b}]` becomes `{a,b,honored:true}`).
 * PURE — a deterministic projection, never an LLM.
 */
export function gatewayGraphArgs(g: DepGraph): Record<string, unknown> {
	return {
		project: g.project,
		cells: g.cells,
		edges: g.edges.map((e) => ({
			from: e.from,
			from_cell: e.fromCell,
			to: e.to,
			to_cell: e.toCell,
		})),
		federation: {
			contracts: g.honored.map((h) => ({ a: h.a, b: h.b, honored: true })),
		},
	};
}

/** demoMeasure is the deterministic demo StructuralMetric — the twin `measure()` of the clean cut. */
export function demoMeasure(projectId: string): StructuralMetric {
	return measure(cleanCut(projectId));
}
