"use server";

import { readVia, type Source } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import {
	canonGraph,
	demoLinksView,
	gatewayGraphArgs,
	type LinksView,
} from "@/lib/v2/links-data";
import { linksGraphDecoder } from "./live";

/**
 * Server Actions de la lentille V3 /v3/liens (les SIX LIENS §41/§17).
 *
 * LENTILLE NATIVE LIVE (ADR 0092 — le moteur Go est la SEULE source live des liens) :
 * `linksGraphAction` lit le graphe LIVE depuis le serveur Go `links` à travers la passerelle
 * (`readVia(scope, "links_graph", …)`, la lecture below-the-line dispatchée qui appelle
 * back/kernel/links.Validate/Resolve). Le calcul des liens (validate/resolve/filter/all-pinned)
 * était un TWIN PUR « byte-identique au Go » (lib/v2/links.ts) — pas du client-UX légitime (§2) ;
 * il N'EST PLUS le chemin vivant. Le twin (via lib/v2/links-data) n'est conservé QUE comme repli
 * déterministe de démo (source:"live"|"demo", JAMAIS « calcul pur (repli démo) ») ; l'import de la frontière
 * readVia garde le cliquet T5 (twin-as-live-fitness) VERT (le twin est derrière le repli de démo).
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : le décodeur + le repli de démo (le calcul pur du twin que
 * le moteur Go reproduit) sont purs ; une réponse malformée / non dispatchée / refusée donne la vue
 * de démo. LE MUR (§2/§9) : la lentille PROJETTE une lecture des liens — aucune écriture-vérité
 * depuis l'écran ; promouvoir un lien reste idée → miroir → /goal → approbation. Le scope du MUR
 * côté passerelle vient de `panelScope()` (le cookie S57, server-side).
 */

export interface LiensView {
	readonly ok: true;
	readonly view: LinksView;
	readonly source: Source;
}

export async function linksGraphAction(): Promise<LiensView> {
	const graph = canonGraph();
	const scope = await panelScope();
	// Le repli déterministe (le même calcul pur du twin que le moteur Go reproduit).
	const demo = demoLinksView();
	// Lecture LIVE via la passerelle (l'outil Go `links_graph` dispatché) ; demo est le repli
	// (source:"live"|"demo") — ADR 0092. Le décodeur ne porte pas les nœuds → on les ré-injecte.
	const { data, source } = await readVia(
		scope,
		"links_graph",
		gatewayGraphArgs(graph),
		linksGraphDecoder,
		{
			rows: demo.rows,
			allPinned: demo.allPinned,
			green: demo.green,
			stale: demo.stale,
			absent: demo.absent,
		},
	);
	// Le tool renvoie des verdicts d'arêtes, jamais les nœuds : on ré-injecte les nœuds de la
	// fixture envoyée (le repère React Flow, déterministe — le même graphe a servi d'argument).
	const view: LinksView = { ...data, nodes: demo.nodes };
	return { ok: true, view, source };
}
