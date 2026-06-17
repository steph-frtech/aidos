/**
 * Goal piloting — the Workbench /goal-piloting CONTRACT TYPES (AIDOS step S66).
 *
 * S66 (ROADMAP-app-builder, KRD §56–§59, §63 ①): the UI-piloted /goal. A human PORTEUR
 * D'AUTORITÉ (S63) opens a goal from a grilled idea — the engine PROPOSES a DRAFT ChangeSet
 * (spec_delta + mirror_delta atomically) and computes the LIVE red set; the close gate is the
 * NON-GAMEABLE stop (red set→green ∧ prior intact ∧ mutation ≥ floor ∧ no monster).
 *
 * S59 CUTOVER (ADR 0092 — the Go engine is the SINGLE live source). This module USED to be the
 * DECLARED TWIN of the Go package back/runtime/goalpiloting — it re-implemented the actor gate, the
 * open, the close gate and the red-set sort in TS, and the panel read it as the live source. Those
 * READ functions are GONE: the goal-open, the non-gameable close and the red-set sort are now read
 * LIVE from the Go goal-piloting MCP server through the passerelle
 * (app/goal-piloting/actions.ts → readVia(scope, "goal_pilot_open" / "goal_pilot_close", …),
 * decoded by app/goal-piloting/live.ts). The demo fallback is the inert fixture lib/goal-piloting-data.
 *
 * WHAT REMAINS HERE (no twin logic): the CONTRACT TYPES the decoder fills + the panel renders
 * (PilotBlock, Delta, PilotOpenInput, PilotResult, and the re-exported RealActor / Budgets / Goal /
 * StopInput), plus the two canonical FR refusal constants (IDEA_WITHOUT_MIRROR / NO_RED_SET) the Go
 * engine returns verbatim — they document the contract the openDecoder maps, never a second
 * computation. The PLACEHOLDER_ACTOR / GOAL_STILL_RED refusals now come from the Go engine, decoded
 * by live.ts (no TS re-implementation).
 *
 * THE WALL (CLAUDE.md §2/§7): the live tools PROPOSE (a DRAFT ChangeSet) and VERDICT (the
 * non-gameable close) — they never APPLY a ChangeSet nor stamp CLOSED; the screen writes no Kernel.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): no logic lives here anymore — the Go engine is authoritative;
 * the decoder (live.ts) is the only pure projection of its wire contract; "done" is computed by the
 * Go non-gameable stop, never declared.
 */

export type { RealActor } from "./authority-binding";
export type { Budgets, Goal, StopInput } from "./goal";

/** The unified, actionable refusal surfaced to the screen — the code carried verbatim. */
export interface PilotBlock {
	code: string;
	severity: string;
	explanation: string;
	howToFix: string[];
}

/** A delta the idea proposes (twin of changeset.Delta — only the fields the screen needs). */
export interface Delta {
	kind: string;
	target: string;
}

/** The screen-facing open input shape (twin of goalpiloting.OpenInput, the projected subset). */
export interface PilotOpenInput {
	ideaId: string;
	specDelta: Delta;
	/** Absent ⇒ a vœu (refused IDEA_WITHOUT_MIRROR). */
	mirrorDelta?: Delta;
	parentPhase: string;
	/** The LIVE red set the engine derived (S22 Impact) — the worklist. Non-empty for a real goal. */
	redSet: string[];
	budgets: import("./goal").Budgets;
}

/** What the screen receives when an authority-bearing human opens a goal (twin of PilotResult). */
export interface PilotResult {
	actor: import("./authority-binding").RealActor;
	goal: import("./goal").Goal;
}

/**
 * The canonical IDEA_WITHOUT_MIRROR refusal (the Go blockreason.For prose). KEPT as the documented
 * contract the openDecoder maps a refusal onto — NOT a second computation (the Go engine returns it).
 */
export const IDEA_WITHOUT_MIRROR: PilotBlock = {
	code: "IDEA_WITHOUT_MIRROR",
	severity: "blocking",
	explanation:
		"Refus de l'ouverture du goal : l'idée ne porte AUCUN mirror_delta. Une vérité sans miroir est un vœu (un monstre, §57/LIVRE XX) — le moteur de goal ne promeut jamais une idée sans son miroir. Aucun ChangeSet n'est ouvert.",
	howToFix: [
		"draft_mirror_for_idea : écrivez d'abord le miroir (Gherkin / propriété / fixture) qui prouve l'idée, puis rouvrez le /goal.",
		"idea → mirror → /goal : la seule porte légitime vers la vérité passe par le miroir.",
	],
};

/**
 * The canonical NO_RED_SET refusal (a green test is not a goal, §56). KEPT as the documented
 * contract the openDecoder maps a refusal onto — NOT a second computation (the Go engine returns it).
 */
export const NO_RED_SET: PilotBlock = {
	code: "NO_RED_SET",
	severity: "blocking",
	explanation:
		"Refus de l'ouverture du goal : le set rouge dérivé est VIDE. Un test déjà vert n'est pas un goal (§56 : le set rouge EST la todo-list) — il n'y a rien à fermer. Aucun goal n'est ouvert.",
	howToFix: [
		"bump_a_source : un goal naît quand un changement rougit au moins un miroir porteur.",
		"verify the red wave : vérifiez que le miroir reflète une source dont la tête a bougé (S22).",
	],
};
