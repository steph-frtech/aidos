import { arr, type Decoder, isObject, str } from "../../../lib/gateway-sdk";
import type {
	AggregateVerdict,
	DrillStep,
	OwnMirror,
} from "../../../lib/v2/kernel-tree-data";

/**
 * /v3/arbres live read — le décodeur PUR sur la sortie de l'outil Go `tree_aggregate` (le cutover
 * S59 / ADR 0092 : le moteur Go est l'UNIQUE source vivante de l'arbre de composition).
 *
 * Gardé HORS de actions.ts (un module Next "use server" ne peut exporter que des fonctions async)
 * pour que le miroir de parité (live.test.ts) importe le décodeur PUR directement.
 *
 * NEVER DOUBLE-TYPED (le critère S59) : `aggregateDecoder` est la SEULE déclaration runtime de la
 * forme du verdict live ; le type statique AggregateVerdict (déclaré dans kernel-tree-data) est ce
 * que le décodeur remplit. Le miroir de parité épingle que le décodeur == le contrat de l'outil Go
 * `kerneltreesrv.aggregateOutput` (`{ ok, verdict, drill_down:[{layer_id,version,own_mirror,
 * aggregate}], cycle, error }`) — PAS une seconde implémentation de la loi §109 (le Go
 * composes.Aggregate est autoritatif). DÉTERMINISME-FIRST (§6/§8) : même JSON → même verdict ; un
 * payload malformé renvoie null et readVia retombe sur le verdict-démo (source:"demo").
 *
 * IMPORT RELATIF (jamais `@/…`) : la lentille importe le décodeur + le SDK par chemin relatif,
 * comme les autres cutover ; l'import-VALEUR du twin (kernel-tree-data → kernel-tree) reste
 * derrière la frontière readVia dans actions.ts (le cliquet T5 reste vert).
 */

/** ownMirrorOf décode un voyant own_mirror — exactement GREEN|RED, sinon null. */
function decodeOwnMirror(raw: unknown): OwnMirror | null {
	const s = str(raw);
	return s === "GREEN" || s === "RED" ? s : null;
}

/** decodeStep décode un pas du drill-down §110 (la forme `pathStepOut` du serveur Go). */
function decodeStep(raw: unknown): DrillStep | null {
	if (!isObject(raw)) return null;
	const layerId = str(raw.layer_id);
	const ownMirror = decodeOwnMirror(raw.own_mirror);
	const aggregate = decodeOwnMirror(raw.aggregate);
	if (layerId === null || ownMirror === null || aggregate === null) return null;
	// version est tolérée absente (un nœud racine sans version pinnée) → "".
	const version = str(raw.version) ?? "";
	return { layerId, version, ownMirror, aggregate };
}

/**
 * aggregateDecoder décode la sortie de l'outil Go `tree_aggregate`
 * (`{ ok, verdict, drill_down, cycle, error }`) en AggregateVerdict front.
 *
 *   - ok:false + cycle → un refus typé CAUSED_BY_CYCLE : on renvoie le verdict RED + le cycle
 *     (le panneau l'affiche comme un refus, jamais une boucle infinie silencieuse) ;
 *   - ok:false sans cycle (une autre erreur typée) → null (→ repli démo) ;
 *   - ok:true → le verdict (GREEN|RED) + le drill-down ; un drill_down/cycle absent décode à [].
 *
 * PURE & TOTALE : même JSON → même verdict. Un payload malformé (verdict hors {GREEN,RED}, un pas
 * sans layer_id) → null.
 */
export const aggregateDecoder: Decoder<AggregateVerdict> = (raw) => {
	if (!isObject(raw)) return null;
	const cycle = arr(str)(raw.cycle ?? []) ?? [];
	if (raw.ok === false) {
		// un cycle refusé est un verdict honnête (RED + le cycle nommé), pas un repli.
		if (cycle.length > 0) return { verdict: "RED", drillDown: [], cycle };
		return null;
	}
	const verdict = decodeOwnMirror(raw.verdict);
	if (verdict === null) return null;
	const drillDown = arr(decodeStep)(raw.drill_down ?? []);
	if (drillDown === null) return null;
	return { verdict, drillDown, cycle };
};
