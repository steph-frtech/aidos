"use server";

import { allLevels } from "@/lib/besoin-grammar";
import { besoinLevelSchema, captureProjection } from "@/lib/besoin-intake";
import { DEMO_PROJECT, demoGraphState } from "@/lib/besoin-intake-data";
import { readVia, type Source } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import {
	type BesoinGraphState,
	type IdeeSchemaRow,
	stateDecoder,
} from "./live";

/**
 * Server Action de la lentille /v3/idée (idea capture) — l'ÉTAGE D'ENTRÉE de la verticale (§23),
 * porté EN PROPRE dans la session V3 (parcours « Concevoir ») et LISANT LE MOTEUR EN DIRECT (le
 * serveur Go `besoin-intake`, EL15, déjà dispatché par la passerelle — ADR 0009/0092).
 *
 * LE CHEMIN LIVE. `loadIdeeAction` lit l'état du BesoinGraph du projet actif via
 * `readVia(scope, "besoin_graph_state", {project}, stateDecoder, demoGraphState)` : le niveau
 * ENTRABLE (EL07, calculé côté serveur), le nombre de nœuds persistés, si le besoin est résolu, et
 * les verdicts par rung. Le projet actif (le cookie) EST la frontière RLS sur laquelle la
 * passerelle route (S55). Sur tout échec (pas d'endpoint, transport, payload malformé, store non
 * dispatché) readVia retombe sur l'instantané démo (source:"demo", ADR 0074 — un écran jamais vide,
 * un e2e autonome, jamais un faux « live »).
 *
 * LA GRAMMAIRE FERMÉE (les schémas de niveau) est une fonction PURE de la grammaire + du mapping
 * EL05 — le Go `besoin_level_schema` la reproduit byte-à-byte —, donc calculée par le twin
 * `lib/besoin-intake` CÔTÉ SERVEUR, derrière la frontière readVia (le cliquet T5 reste vert : le
 * twin ne sert jamais de chemin live). Elle accompagne l'état live.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : décodeur + repli démo purs ; même entrée → même verdict,
 * zéro LLM ; les args portent un `project` SCALAIRE (pas de json.RawMessage — le scar S59 évité).
 * LE MUR (§2/§9) : `besoin_graph_state` est une lecture sous la ligne — l'écran n'écrit AUCUNE
 * vérité. Capturer une idée passe par la porte gouvernée idea_capture (EL05, via /besoin-intake) ;
 * la promotion reste idée → miroir → /goal.
 */

/** IdeeView — ce que la lentille rend : l'état live (ou démo) du graphe + les schémas + la source. */
export interface IdeeView {
	/** l'état du BesoinGraph lu (en direct ou repli démo). */
	state: BesoinGraphState;
	/** la grammaire fermée applatie : un rung par niveau (champs requis + verdict EL05 émet/pas). */
	schemas: IdeeSchemaRow[];
	/** la source AGRÉGÉE de l'écran : "live" si l'état du graphe a été lu en direct, "demo" sinon. */
	source: Source;
}

/**
 * grammarSchemaRows projette la grammaire fermée (un rung par niveau) en lignes d'affichage PURES :
 * champs requis + la décision EL05 (capturer ici émet-il une idée, et de quel genre). PURE — le twin
 * reproduit le Go ; aucun LLM, même grammaire → mêmes lignes.
 */
function grammarSchemaRows(): IdeeSchemaRow[] {
	const rows: IdeeSchemaRow[] = [];
	for (const level of allLevels()) {
		const schema = besoinLevelSchema(level);
		const projection = captureProjection(level);
		if (schema === null || projection === null) continue;
		rows.push({
			level,
			requiredFields: schema.requiredFields,
			emits: projection.emits,
			proposes: projection.proposes,
		});
	}
	return rows;
}

/**
 * loadIdeeAction lit l'état LIVE du BesoinGraph du projet actif (par `besoin_graph_state` via la
 * passerelle) et l'accompagne des schémas de la grammaire fermée. NE LANCE JAMAIS : readVia retombe
 * sur l'instantané démo sur tout échec (source:"demo"). La grammaire est toujours rendue (pure),
 * vivante ou démo.
 */
export async function loadIdeeAction(): Promise<IdeeView> {
	const scope = await panelScope();
	// Le projet actif EST la frontière RLS ; un scope vide → lecture non-scopée → repli démo.
	const project = scope.activeProject || DEMO_PROJECT;
	const { data, source } = await readVia(
		scope,
		"besoin_graph_state",
		{ project },
		stateDecoder,
		demoGraphState(project),
	);
	return { state: data, schemas: grammarSchemaRows(), source };
}
