/**
 * V3 — le TWIN PUR du BACKLOG GOUVERNÉ (ADR 0073, Plan B).
 *
 * Plan A (lib/v3/project serializeBody/parseBody) est le PORTEUR de fidélité : le transcript
 * content-adressé dans projects.project est la vérité reprenable. Plan B est la PROJECTION
 * GOUVERNÉE, dérivée du REJEU (l'état final BuilderState), vers le truth-store via la passerelle
 * (idea_capture / changeset_open+apply / dag_branch — le mur §2). C'est une projection
 * d'INSPECTION/backlog : LOSSY (elle perd l'ordre des messages, les replies, les refus, la
 * facette/échelle des idées), donc JAMAIS le chemin de reprise — seulement « voici la projection
 * truth-store de ce projet ». La vision complète choisie par l'utilisateur (for idea: idea_capture ;
 * for kernel: changeset ; dag_branch) EST ce Plan B, correctement positionné comme projection.
 *
 * projectStateToBacklog est PUR & TOTAL & DÉTERMINISTE (zéro I/O, zéro horloge, zéro LLM) :
 * l'action serveur (saveProjectBacklog) le DÉROULE en appels gateway, dans l'ORDRE
 * idea → changeset → dag (jamais une arête sans son changeset, jamais un changeset sans ses
 * idées). Le mapping niveau→proposes RÉUTILISE la table EL05 (lib/besoin-proposes, alignée sur le
 * Go LevelToProposes — une seule source de vérité, jamais une seconde table). Miroir : backlog.test.ts.
 *
 * LE MUR (§2) : ce twin ne fait que CALCULER ce qu'il faudrait projeter ; il n'écrit rien. La
 * projection réelle passe par des gestes Go gouvernés (idea_capture est below-the-line ; un
 * changeset reste une PROPOSITION). Il ne franchit jamais idée→miroir→/goal→approbation.
 */

import { levelToProposes, type ProposesKind } from "../besoin-proposes";
import type { BuilderState } from "../v2/builder";

/** Une idée à capturer (args de `idea_capture`, dérivée d'une Idea du rejeu). */
export interface BacklogIdea {
	readonly proposes: ProposesKind;
	readonly intent: string;
	readonly source: "human" | "incident";
	readonly detail: string;
}

/** Un changeset à ouvrir+appliquer (args de `changeset_open`, dérivé d'un ProposedKernel). */
export interface BacklogChangeset {
	/** Clé de CORRÉLATION locale (= la version content-adressée du kernel) reliant l'arête dag. */
	readonly id: string;
	readonly label: string;
	readonly specDelta: { readonly kind: "add"; readonly target: string };
	/** TOUJOURS fourni — sans mirror_delta, l'apply revient Blocked (la commit-gate de complétude). */
	readonly mirrorDelta: { readonly kind: "add"; readonly target: string };
}

/** Une arête de DAG à brancher (args de `dag_branch`), référençant son changeset par id. */
export interface BacklogDagEdge {
	readonly label: string;
	readonly changeset: string;
}

/** Le backlog gouverné complet, ORDONNÉ idée → changeset → dag. */
export interface ProjectBacklog {
	readonly ideas: readonly BacklogIdea[];
	readonly changesets: readonly BacklogChangeset[];
	readonly dagEdges: readonly BacklogDagEdge[];
}

/**
 * projectStateToBacklog — PROJETTE l'état rejoué d'un projet vers le backlog gouverné. PUR.
 * Les idées sur un rung NoEmit (journey/view/invariant — table EL05) seedent des ancres, elles
 * n'émettent AUCUNE idée (jamais un cast silencieux journey→product). Chaque kernel proposé
 * devient un changeset (spec + mirror delta) PUIS une arête de dag (un changeset APPLIED = une
 * phase). L'ordre des tableaux EST l'ordre d'émission : idées d'abord, puis changesets, puis dag.
 */
export function projectStateToBacklog(state: BuilderState): ProjectBacklog {
	const ideas: BacklogIdea[] = [];
	for (const idea of state.ideas) {
		const mapping = levelToProposes(idea.coordinate.level);
		// NoEmit (journey/view/invariant) : aucune idée — l'ancre seule contraint latéralement.
		if (mapping.kind !== "emit" || mapping.proposes === undefined) continue;
		ideas.push({
			proposes: mapping.proposes,
			intent: idea.intent,
			source: idea.provenance === "humain" ? "human" : "incident",
			detail: idea.intent,
		});
	}
	const changesets: BacklogChangeset[] = [];
	const dagEdges: BacklogDagEdge[] = [];
	for (const kernel of state.kernels) {
		const target = kernel.coordinate.scale;
		const id = kernel.version; // content-adressé, stable — la corrélation idée→changeset→dag
		changesets.push({
			id,
			label: `promote ${target}`,
			specDelta: { kind: "add", target },
			mirrorDelta: { kind: "add", target },
		});
		dagEdges.push({ label: `phase ${kernel.version}`, changeset: id });
	}
	return { ideas, changesets, dagEdges };
}
