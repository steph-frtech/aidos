"use server";

import { arr, type Decoder, isObject, readVia, str } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import {
	DEMO_GRAPH,
	graphDecoder,
	type LiveGraphView,
} from "../../version-dag/live";

export type { LiveGraphView } from "../../version-dag/live";

/**
 * /v3/version-dag — Server Actions (la lentille DAG de versions PORTÉE EN PROPRE dans V3,
 * ADR 0060/0092). Elle lit EN DIRECT le DAG de versions du projet actif de la session V3 à
 * travers la passerelle typée (S58) via le SDK S59 (`readVia` → `gateway_call`), décodé par
 * un décodeur PUR, avec un graphe / un jeu de têtes de démo déterministe en repli
 * (`source: "live" | "demo"`).
 *
 * RÉUTILISATION, JAMAIS DE JUMEAU (ADR 0092 / déterminisme-first §6/§8) : le décodeur
 * `graphDecoder` + le `DEMO_GRAPH` (le §120 canonique) sont RÉUTILISÉS depuis le module pur
 * `app/version-dag/live.ts` — la SEULE déclaration runtime de la forme `dag_get`, prouvée par
 * son miroir de parité (`app/version-dag/live.test.ts`). Cette lentille NE RÉ-IMPLÉMENTE PAS
 * la logique de l'espace des versions : la vérité vit dans le Go (`back/archive/dag`,
 * autoritaire) ; on ne fait que DÉCODER son contrat de lecture. Aucune logique dupliquée,
 * aucun double-typage.
 *
 * LE MUR (CLAUDE.md §2) : LECTURE seule — `dag_get` / `dag_heads` lisent l'espace des versions
 * (append-only, §120) ; enregistrer un nœud/une arête passe par le rôle `aidos` via le MCP
 * dag (S24), jamais une écriture depuis l'écran. Un malformé / non-dispatché / refusé retombe
 * DÉTERMINISTIQUEMENT sur la démo (source:"demo"), jamais une valeur partielle (ADR 0074).
 */

export interface LiveHeadsView {
	heads: string[];
	source: "live" | "demo";
}

/** Le jeu de têtes de démo déterministe — les deux lignes parallèles du graphe §120. */
const DEMO_HEADS = ["v2", "w1"];

// dag_heads → { heads:[string] }, décodé UNE fois (jamais double-typé).
const headsDecoder: Decoder<{ heads: string[] }> = (raw) => {
	if (!isObject(raw)) return null;
	const heads = arr(str)(raw.heads);
	if (heads === null) return null;
	return { heads };
};

/** liveHeads lit les têtes du DAG du projet actif (en direct → repli démo). */
export async function liveHeads(): Promise<LiveHeadsView> {
	const scope = await panelScope();
	const { data, source } = await readVia(scope, "dag_heads", {}, headsDecoder, {
		heads: DEMO_HEADS,
	});
	// Ne jamais rendre un jeu de têtes vide en direct : un DAG vide retombe sur les têtes
	// de démo, pour que la lentille et son e2e restent autonomes.
	if (source === "live" && data.heads.length === 0) {
		return { heads: DEMO_HEADS, source: "demo" };
	}
	return { heads: data.heads, source };
}

/**
 * liveGraph lit le DAG de versions ENTIER du projet actif (nœuds + arêtes + têtes) via la
 * passerelle (la lecture `dag_get`, en dessous de la ligne), décodé par le décodeur PUR de
 * `app/version-dag/live.ts`, avec le graphe de démo déterministe en repli. LECTURE seule (le
 * mur, §2) : enregistrer un nœud/une arête passe par le rôle `aidos` via le MCP dag, jamais ici.
 */
export async function liveGraph(): Promise<LiveGraphView> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"dag_get",
		{},
		graphDecoder,
		DEMO_GRAPH,
	);
	// Ne jamais rendre un graphe vide en direct : un DAG vide retombe sur le graphe de démo,
	// pour que la lentille et son e2e restent autonomes (l'exemple est toujours visible).
	if (source === "live" && data.nodes.length === 0) {
		return { ...DEMO_GRAPH, source: "demo" };
	}
	return { ...data, source };
}
