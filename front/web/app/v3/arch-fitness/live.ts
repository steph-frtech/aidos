import type { StructuralMetric } from "../../../lib/arch-fitness";
import {
	arr,
	type Decoder,
	isObject,
	num,
	str,
} from "../../../lib/gateway-sdk";

/**
 * /v3/arch-fitness lecture live — le décodeur sur la sortie de l'outil Go arch-fitness `measure`
 * (cutover S59, ADR 0092). Tenu HORS de actions.ts (un module Next "use server" ne peut exporter
 * que des fonctions asynchrones) pour que le miroir de parité (live.test.ts) importe le décodeur
 * PUR directement.
 *
 * JAMAIS DOUBLEMENT TYPÉ (la done-criterion S59) : `metricDecoder` est la SEULE déclaration runtime
 * de la forme de la métrique live ; le StructuralMetric statique est le type du twin front que le
 * décodeur remplit. Le miroir de parité pinne le décodeur == le contrat `measureOutput.metric` du Go
 * (boundary_violations / inter_cell_cycles / inter_bc_edges / max_cell_complexity / violations /
 * cycles), PAS une seconde implémentation de la logique de métrique (le Go archfitness.Measure est
 * autoritaire). DÉTERMINISME-FIRST (§6/§8) : même JSON → même verdict ; un payload malformé renvoie
 * null et readVia retombe sur la métrique de démo.
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
 * metricDecoder décode la sortie de l'outil Go `measure` ({ ok, metric }) vers le StructuralMetric
 * front. L'outil enveloppe la métrique sous `metric` ; un payload plat est toléré. Les témoins
 * violations/cycles sont indicatifs — une liste absente (coupe propre) décode à []. Un compte requis
 * manquant → null (→ repli de démo).
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
