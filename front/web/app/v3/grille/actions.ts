"use server";

import { readVia, type Source } from "../../../lib/gateway-sdk";
import { panelScope } from "../../../lib/panelScope";
import type { Grid } from "../../../lib/v2/grid";
import {
	DEMO_GRID_KERNELS,
	demoGrid,
	gridBuildArgs,
} from "../../../lib/v2/grid-data";
import { gridDecoder } from "./live";

/**
 * Server Action de la lentille /v3/grille — la GRILLE niveau × facette (FK03 ; FKE-1.4 « les deux
 * axes »), portée EN PROPRE dans le shell V3 (parcours « Comprendre », ADR 0060).
 *
 * S59 CUTOVER (ADR 0092 — le moteur Go est l'UNIQUE source vivante). `gridLive` lit la matrice LIVE
 * depuis le serveur MCP `grid` du moteur Go par la passerelle (`readVia(scope, "grid_build", …)`, la
 * lecture below-the-line dispatchée — grid.Build est autoritatif). Le twin lib/v2/grid (buildGrid)
 * est CONSERVÉ UNIQUEMENT comme repli démo déterministe (`demoGrid`, source:"live"|"demo"). L'import
 * frontière readVia garde le cliquet T5 (twin-as-live-fitness) VERT : le twin (importé via le
 * fichier-data) reste DERRIÈRE le repli source:"demo", jamais comme source vivante.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : le décodeur + le repli démo (le même calcul pur que le Go
 * reproduit) sont purs ; un payload mal formé / non-dispatché / refusé rend la grille-démo. LE MUR
 * (§2) : lecture seule — la grille est une projection de coordonnées ; geler une vérité passe par
 * idée → miroir → /goal → approbation, jamais une écriture depuis l'écran.
 */

export interface GridView {
	grid: Grid | null;
	source: Source;
}

/**
 * gridLive lit la grille via la passerelle (le tool `grid_build`, dispatché), avec la grille-démo
 * du twin comme repli déterministe. Renvoie la grille + sa source honnête ("live"|"demo"). Quand le
 * repli démo lui-même est vide (n ≤ 0), le composant rend l'état vide (jamais un lien mort).
 */
export async function gridLive(
	n: number = DEMO_GRID_KERNELS,
): Promise<GridView> {
	const scope = await panelScope();
	const demo = demoGrid(n);
	if (demo === null) return { grid: null, source: "demo" };
	const { data, source } = await readVia(
		scope,
		"grid_build",
		gridBuildArgs(n),
		gridDecoder,
		demo,
	);
	return { grid: data, source };
}
