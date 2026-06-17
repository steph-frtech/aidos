import type { StructuralMetric } from "../../lib/arch-fitness";
import { arr, type Decoder, isObject, num, str } from "../../lib/gateway-sdk";

/**
 * /arch-fitness live read — the decoder over the Go arch-fitness `measure` tool output (S59
 * cutover, ADR 0092). Kept OUT of actions.ts (a Next "use server" module may only export async
 * functions) so the parity mirror (live.test.ts) can import the PURE decoder directly.
 *
 * NEVER DOUBLE-TYPED (the S59 done-criterion): `metricDecoder` is the SINGLE runtime declaration
 * of the live metric shape; the static StructuralMetric is the front twin's type the decoder
 * fills. The parity mirror pins the decoder == the Go `measureOutput.metric` contract
 * (boundary_violations / inter_cell_cycles / inter_bc_edges / max_cell_complexity / violations /
 * cycles), NOT a second implementation of the metric logic (the Go archfitness.Measure is
 * authoritative). DETERMINISM-FIRST (§6/§8): same JSON → same verdict; a malformed payload returns
 * null and readVia falls back to the demo metric.
 */

function decodeViolation(
	raw: unknown,
): { from: string; fromCell: string; to: string; toCell: string } | null {
	if (!isObject(raw)) return null;
	const from = str(raw.from);
	const fromCell = str(raw.from_cell);
	const to = str(raw.to);
	const toCell = str(raw.to_cell);
	if (from === null || fromCell === null || to === null || toCell === null) {
		return null;
	}
	return { from, fromCell, to, toCell };
}

function decodeCycle(raw: unknown): string[] | null {
	return arr(str)(raw);
}

/**
 * metricDecoder decodes the Go `measure` tool output ({ ok, metric }) into the front
 * StructuralMetric. The tool wraps the metric under `metric`; a flat payload is tolerated. The
 * violations/cycles witnesses are advisory — an absent list (a clean cut) decodes to []. A missing
 * required count → null (→ demo fallback).
 */
export const metricDecoder: Decoder<StructuralMetric> = (raw) => {
	if (!isObject(raw)) return null;
	const m = isObject(raw.metric) ? raw.metric : raw;
	const project = str(m.project);
	const boundaryViolations = num(m.boundary_violations);
	const interCellCycles = num(m.inter_cell_cycles);
	const interBcEdges = num(m.inter_bc_edges);
	const maxCellComplexity = num(m.max_cell_complexity);
	if (
		project === null ||
		boundaryViolations === null ||
		interCellCycles === null ||
		interBcEdges === null ||
		maxCellComplexity === null
	) {
		return null;
	}
	const violations = arr(decodeViolation)(m.violations ?? []) ?? [];
	const cycles = arr(decodeCycle)(m.cycles ?? []) ?? [];
	return {
		project,
		boundaryViolations,
		interCellCycles,
		interBcEdges,
		maxCellComplexity,
		violations,
		cycles,
	};
};
