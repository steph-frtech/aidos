import type { CellViolation, FanOutSpec } from "@/lib/federation-cockpit";
import { arr, type Decoder, isObject, str } from "../../../lib/gateway-sdk";

/**
 * /v3/cellules — live read — le décodeur PUR sur la sortie du tool Go `fan_out` (le serveur
 * `federation` dispatché par la passerelle — S103/§51, ADR 0092 le lot kill-twins).
 *
 * LA CELLULE, LE CONCEPT. Une grosse app n'est jamais un seul noyau indivis : c'est une
 * FÉDÉRATION délibérée de cellules (bounded contexts §49), reliées par des contrats. Le §51
 * dit comment une RÈGLE TRANSVERSE se propage : une policy globale exprimée UNE FOIS « fan-out »
 * vers une RedWorkQueue PAR cellule — chaque cellule qui la VIOLE rougit, les autres restent
 * VERTES et continuent de livrer (« le red wave déploie globalement, chaque cellule réconcilie
 * localement »). Cette lentille lit CE fan-out EN DIRECT, par le tool `fan_out`.
 *
 * Gardé HORS de actions.ts (un module Next « use server » ne peut exporter que des fonctions
 * async) pour que le miroir de parité (live.test.ts) importe le décodeur PUR directement.
 *
 * JAMAIS DOUBLEMENT TYPÉ (le critère de S59) : le décodeur est l'UNIQUE déclaration runtime de la
 * forme du `fanOutOutput` Go (federationsrv.fanOutOutput = `{ waves: CellRedWave[], affected }`) ;
 * il ne RÉIMPLÉMENTE pas la logique de fan-out (back/runtime/federation.FanOut est la source
 * unique). DÉTERMINISME-FIRST (§6/§8) : même JSON → même verdict ; un payload malformé renvoie
 * null et readVia retombe sur la vague-démo.
 *
 * LE MUR (CLAUDE.md §2) : ceci ne fait que DÉCODER une lecture sous la ligne — `fan_out` renvoie
 * les vagues par cellule comme une VALEUR (l'INSERT réel dans runtime.red_work_queue est le
 * travail du hook S22 sous la ligne de flottaison, jamais ce tool) ; geler une vérité passe par
 * propose → ChangeSet → /goal → approbation.
 */

/**
 * decodeWaveCell décode un `CellRedWave` Go ({ cell, reddened, queue }) en un `CellViolation`
 * front (cell, violates). Le fan-out Go reporte la violation comme `reddened` (une cellule que la
 * policy étend ET qui viole est rougie) ; les lignes de queue restent indicatives pour la lentille.
 */
function decodeWaveCell(raw: unknown): CellViolation | null {
	if (!isObject(raw)) return null;
	const cell = str(raw.cell);
	if (cell === null) return null;
	if (typeof raw.reddened !== "boolean") return null;
	return { cell, violates: raw.reddened };
}

/**
 * waveIdOf lit l'id de la vague de policy estampillé sur la première ligne de queue d'une cellule
 * rougie (RedWorkItem.wave_id), l'adresse de contenu dont le serveur a estampillé le fan-out.
 * Absent (aucune cellule rougie) ⇒ "" — l'action estampille alors l'id demandé. PUR.
 */
function waveIdOf(raw: Record<string, unknown>): string {
	const waves = raw.waves;
	if (!Array.isArray(waves)) return "";
	for (const w of waves) {
		if (!isObject(w)) continue;
		const queue = w.queue;
		if (!Array.isArray(queue)) continue;
		for (const row of queue) {
			if (!isObject(row)) continue;
			const id = str(row.wave_id);
			if (id !== null && id !== "") return id;
		}
	}
	return "";
}

/**
 * fanOutDecoder décode la sortie du tool Go `fan_out` ({ waves, affected }) en le `FanOutSpec`
 * front que la lentille projette : pour chaque cellule, son bit de violation (← `reddened`).
 * `waves` est requis (un fan-out absent/vide est un « aucune vague active » légal) ; une cellule
 * de vague malformée → null (→ repli démo). C'est l'unique déclaration runtime de la forme.
 */
export const fanOutDecoder: Decoder<FanOutSpec> = (raw) => {
	if (!isObject(raw)) return null;
	const waves = arr(decodeWaveCell)(raw.waves);
	if (waves === null) return null;
	const policyWaveId = waveIdOf(raw);
	return { policyWaveId, cells: waves };
};
