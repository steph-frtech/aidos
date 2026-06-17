import {
	arr,
	type Decoder,
	isObject,
	num,
	str,
} from "../../../lib/gateway-sdk";
import type {
	LinkRow,
	LinkStatus,
	LinksView,
} from "../../../lib/v2/links-data";

/**
 * /v3/liens lecture live — le DÉCODEUR PUR sur la sortie de l'outil Go `links_graph` (le serveur
 * `links` dispatché par la passerelle — back/mcp/links/linksrv, qui appelle back/kernel/links ;
 * cutover S59, ADR 0092 : le moteur Go est la SEULE source live des liens).
 *
 * Tenu HORS de actions.ts (un module Next « use server » ne peut exporter que des fonctions async)
 * pour que le miroir de parité (live.test.ts) importe le décodeur PUR directement. L'import de
 * gateway-sdk est RELATIF (et non l'alias @/) : seul le chemin relatif résout pour ce module.
 *
 * JAMAIS DOUBLEMENT TYPÉ (la done-criterion S59) : `linksGraphDecoder` est l'UNIQUE déclaration
 * runtime de la forme `graphOutput` du Go (linksrv.graphOutput = { ok, links[], all_pinned, green,
 * stale, absent } ; chaque ligne = linkStatusRow { kind, from, to, valid, status?, error? }). Il
 * ne RÉIMPLÉMENTE pas la validation/résolution des liens (back/kernel/links.Validate/Resolve est la
 * source unique — le Go juge le statut green|stale|absent §41–§42) ; il ne fait que décoder le
 * verdict. DÉTERMINISME-FIRST (§6/§8) : même JSON → même verdict, zéro LLM ; un payload malformé
 * renvoie null et readVia retombe sur la vue de démo (source:"demo").
 *
 * LE MUR (CLAUDE.md §2) : ceci ne fait que DÉCODER une lecture sous la ligne — `links_graph` lit un
 * graphe + des heads et renvoie un verdict, il n'écrit aucune vérité ; promouvoir un lien passe
 * par idée → miroir → /goal → approbation, jamais une écriture depuis l'écran.
 */

const STATUSES: ReadonlySet<string> = new Set<LinkStatus>([
	"green",
	"stale",
	"absent",
]);

/** decodeStatus accepte exactement le jeu clos green|stale|absent ; sinon undefined (toléré). */
function decodeStatus(v: unknown): LinkStatus | undefined {
	const s = str(v);
	return s !== null && STATUSES.has(s) ? (s as LinkStatus) : undefined;
}

/**
 * decodeRow décode une ligne linkStatusRow du Go. kind/from/to/valid sont REQUIS (le Go les rend
 * toujours) ; status/error sont optionnels (un lien invalide n'a pas de status, un lien valide n'a
 * pas d'error). Un champ requis manquant / mal typé → null (→ repli démo).
 */
const decodeRow: Decoder<LinkRow> = (raw) => {
	if (!isObject(raw)) return null;
	const kind = str(raw.kind);
	const from = str(raw.from);
	const to = str(raw.to);
	const valid = typeof raw.valid === "boolean" ? raw.valid : null;
	if (kind === null || from === null || to === null || valid === null) {
		return null;
	}
	const status = decodeStatus(raw.status);
	const errVal = raw.error;
	const error = typeof errVal === "string" ? errVal : undefined;
	const row: LinkRow = { kind, from, to, valid };
	return { ...row, ...(status ? { status } : {}), ...(error ? { error } : {}) };
};

/**
 * linksGraphDecoder décode la sortie de l'outil Go `links_graph` ({ ok, links, all_pinned, green,
 * stale, absent }) vers la LinksView que la lentille rend, SANS les nœuds. La liste `links` (les
 * verdicts) et les comptes viennent DU MOTEUR, jamais recalculés ici. Les `nodes` ne sont pas
 * portés par le tool (il renvoie des verdicts d'arêtes) : l'appelant ré-injecte les nœuds de la
 * fixture qu'il a envoyée (le repère React Flow). Un payload malformé → null (→ repli démo).
 */
export const linksGraphDecoder: Decoder<Omit<LinksView, "nodes">> = (raw) => {
	if (!isObject(raw)) return null;
	// Le Go rend TOUJOURS les cinq champs ({ links, all_pinned, green, stale, absent }) ; un payload
	// auquel il manque l'un d'eux est malformé → null (→ repli démo). `links` doit être un tableau.
	if (!Array.isArray(raw.links)) return null;
	const rows = arr(decodeRow)(raw.links);
	if (rows === null) return null;
	const allPinned = typeof raw.all_pinned === "boolean" ? raw.all_pinned : null;
	const green = num(raw.green);
	const stale = num(raw.stale);
	const absent = num(raw.absent);
	if (
		allPinned === null ||
		green === null ||
		stale === null ||
		absent === null
	) {
		return null;
	}
	return { rows, allPinned, green, stale, absent };
};
