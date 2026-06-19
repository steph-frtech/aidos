import {
	arr,
	type Decoder,
	isObject,
	type Source,
	str,
} from "../../../lib/gateway-sdk";

/**
 * /v3/inspection — les DÉCODEURS PURS de la VUE D'INSPECTION du backlog gouverné (ADR 0073 Plan B).
 *
 * La vue lit la PROJECTION TRUTH-STORE du projet via la passerelle (ADR 0092) : `idea_list`
 * (les idées capturées) + `dag_get` (la topologie des phases). C'est l'INVERSE GOUVERNÉ — une vue
 * STRUCTURELLE d'inspection en LECTURE SEULE, jamais le chemin de reprise (la conversation vit dans
 * le transcript / Plan A). DÉTERMINISME-FIRST : décodeurs purs, même JSON → même verdict ; un
 * payload mal formé → null → readVia retombe sur le repli démo (source:"demo"). LE MUR (§2) :
 * lecture below-the-line — aucune écriture.
 */

/** Une idée projetée dans le truth-store (sortie de `idea_list`). */
export interface ProjectedIdea {
	readonly id: string;
	readonly intent: string;
	readonly proposes: string;
	readonly source: string;
	readonly status: string;
}

/** Le résumé de la topologie du DAG du projet (sortie de `dag_get`). */
export interface DagSummary {
	readonly nodes: number;
	readonly edges: number;
	readonly heads: number;
}

/** La vue d'inspection complète : les idées + le résumé dag + la source honnête. */
export interface InspectionView {
	readonly ideas: readonly ProjectedIdea[];
	readonly dag: DagSummary;
	readonly source: Source;
	/** L'ancre content-adressée du projet (null si le projet n'est pas encore en Postgres). */
	readonly projectId: string | null;
}

function decodeIdea(raw: unknown): ProjectedIdea | null {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const intent = str(raw.intent);
	if (id === null || intent === null) return null;
	return {
		id,
		intent,
		proposes: str(raw.proposes) ?? "",
		source: str(raw.source) ?? "",
		status: str(raw.status) ?? "",
	};
}

/** ideasDecoder — décode la sortie de `idea_list` ({ ideas: [...] }) en idées projetées. */
export const ideasDecoder: Decoder<ProjectedIdea[]> = (raw) => {
	if (!isObject(raw)) return null;
	return arr(decodeIdea)(raw.ideas ?? []);
};

/** dagDecoder — décode la sortie de `dag_get` ({ nodes, edges, heads }) en COMPTES (nulls → 0). */
export const dagDecoder: Decoder<DagSummary> = (raw) => {
	if (!isObject(raw)) return null;
	return {
		nodes: Array.isArray(raw.nodes) ? raw.nodes.length : 0,
		edges: Array.isArray(raw.edges) ? raw.edges.length : 0,
		heads: Array.isArray(raw.heads) ? raw.heads.length : 0,
	};
};

/** Le repli démo (gateway injoignable / projet non ancré) : une projection VIDE, honnête. */
export const demoIdeas: readonly ProjectedIdea[] = [];
export const demoDag: DagSummary = { nodes: 0, edges: 0, heads: 0 };
