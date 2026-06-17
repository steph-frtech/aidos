/**
 * federation-cockpit-data — the DETERMINISTIC demo fixtures for the /federation-cockpit panel
 * (S59 cutover, ADR 0092). It holds the canonical §50 two-cell federation (order + payment, one
 * honored contract), the baseline / regressed structural cuts, the transverse red wave, and the
 * `fan_out` gateway-arg projection — the demo state the panel falls back to when the gateway is
 * unreachable (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before S59 /federation-cockpit overlaid a
 * HARD-CODED transverse wave (DEMO_WAVE) onto the assembled snapshot — the wave was a static twin
 * value. S59 routes the wave through the Go engine via the passerelle (`readVia(scope, "fan_out",
 * …)`, the dispatched below-the-line read of the federation MCP server): the cockpit's RED-WAVE
 * FAN-OUT (which cells a global policy reddened + each reddened cell's RedWorkQueue) is now read
 * LIVE. These fixtures are KEPT only as the deterministic fallback. The presence of this `-data.ts`
 * sibling is also what makes the T5 cliquet (twin-as-live-fitness) RECOGNISE `lib/federation-cockpit`
 * as a twin — the panel stays GREEN because `actions.ts` imports the `readVia` frontier (the witness
 * the twin sits behind `source:"demo"`).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the demo wave is the same shape the Go `federation.FanOut`
 * reproduces — same policy + cells → byte-identical fan-out. The parity mirror
 * app/federation-cockpit/live.test.ts pins the decoder shape == the Go fanOutOutput contract.
 *
 * THE WALL (CLAUDE.md §2): the fan_out read is BELOW the line — it returns the per-cell waves as a
 * VALUE; the actual INSERT into runtime.red_work_queue is the S22 hook's job below the waterline.
 */

import type { DepGraph } from "./arch-fitness";
import type {
	Federation as CellFederation,
	Project as CellProject,
} from "./cell-federation";
import type { FanOutSpec } from "./federation-cockpit";

/** The canonical two-cell federation: order green + payment green, one honored contract. */
export const DEMO_PROJECT: CellProject = {
	id: "shop",
	nodes: [
		{ id: "order-op", cell: "order", kind: "layer" },
		{ id: "order-mirror", cell: "order", kind: "mirror" },
		{ id: "order-contract", cell: "order", kind: "contract", public: true },
		{ id: "payment-op", cell: "payment", kind: "layer" },
		{ id: "payment-mirror", cell: "payment", kind: "mirror" },
		{ id: "payment-contract", cell: "payment", kind: "contract", public: true },
	],
	ratchets: { order: "green", payment: "green" },
};

export const DEMO_FEDERATION: CellFederation = {
	contracts: [{ a: "order", b: "payment", honored: true }],
};

/** The baseline dep-graph cut (one honored inter-cell edge → structural HELD against itself). */
export const DEMO_DEP_GRAPH: DepGraph = {
	project: "shop",
	cells: { order: 3, payment: 3 },
	edges: [
		{
			from: "order-contract",
			fromCell: "order",
			to: "payment-contract",
			toCell: "payment",
		},
	],
	honored: [{ a: "order", b: "payment" }],
};

/** The §50 transverse red wave: a global policy reddens ONLY payment; order stays green & ships. */
export const DEMO_WAVE: FanOutSpec = {
	policyWaveId: "wave-pii-1",
	cells: [
		{ cell: "order", violates: false },
		{ cell: "payment", violates: true },
	],
};

/** The empty wave the panel boots with (no active transverse wave). */
export const DEMO_NO_WAVE: FanOutSpec = {
	policyWaveId: "wave-pii-1",
	cells: [],
};

/** A candidate cut that ADDS an un-contracted inter-cell edge → a structural regression (BROKEN). */
export const DEMO_REGRESSED_GRAPH: DepGraph = {
	project: "shop",
	cells: { order: 3, payment: 3 },
	edges: [
		{
			from: "order-contract",
			fromCell: "order",
			to: "payment-contract",
			toCell: "payment",
		},
		// a NEW un-contracted dependency: order-op → payment-op (boundary violation).
		{
			from: "order-op",
			fromCell: "order",
			to: "payment-op",
			toCell: "payment",
		},
	],
	honored: [{ a: "order", b: "payment" }],
};

/** demoWave is the deterministic demo FanOutSpec the panel falls back to (fired or empty). */
export function demoWave(fireWave: boolean): FanOutSpec {
	return fireWave ? DEMO_WAVE : DEMO_NO_WAVE;
}

/**
 * gatewayFanOutArgs maps the §50 transverse policy + the demo cells to the Go federation `fan_out`
 * tool input shape: the GlobalInvariant policy (expressed once over the federation), the seed
 * violated cell, the policy wave id (stamps each cell's queue), and the per-cell violation rows
 * (each carrying its empty stale-edges/heads — the go-sdk infers the non-omitempty slices as
 * REQUIRED input, the engine ignores them when violates is false). PURE — a deterministic
 * projection, never an LLM. Mirrors the transport_batch_s59_test fan_out payload.
 */
export function gatewayFanOutArgs(fireWave: boolean): Record<string, unknown> {
	const wave = demoWave(fireWave);
	return {
		policy: {
			name: "pii-forgettable-federation",
			scope: "federation_policy",
			cells: ["order", "payment"],
			predicate: "every_aggregate_with_pii_implements_forgettable",
			blast_radius: "global",
			approval_required: "architecture_owner",
		},
		violated_cell: "payment",
		policy_wave_id: wave.policyWaveId,
		cells: wave.cells.map((cv) => ({
			cell: cv.cell,
			violates: cv.violates,
			bumped: cv.violates ? ["PaymentPII"] : [],
			edges: [],
			heads: {},
		})),
	};
}
