/**
 * Goal piloting — the Workbench /goal-piloting source (AIDOS step S66).
 *
 * S66 (ROADMAP-app-builder, KRD §56–§59, §63 ①): the UI-piloted /goal. A human PORTEUR
 * D'AUTORITÉ (S63) opens a goal from a grilled idea — the engine PROPOSES a DRAFT ChangeSet
 * (spec_delta + mirror_delta atomically) and computes the LIVE red set; the close gate is the
 * NON-GAMEABLE stop (red set→green ∧ prior intact ∧ mutation ≥ floor ∧ no monster).
 *
 * This module is the DECLARED TWIN of the Go package back/runtime/goalpiloting — the SAME two
 * gates in the SAME order, DEFERRING to the SAME owners:
 *   - the ACTOR gate REUSES lib/authority-binding (requireRealActor — the twin of S63), so a
 *     placeholder/agent is refused PLACEHOLDER_ACTOR exactly as the Go engine refuses it;
 *   - the CLOSE gate REUSES lib/goal (isClosed / closeBlockReason — the twin of S29's
 *     non-gameable stop), so the four-condition verdict on screen matches the Go engine.
 * One semantics, no drift. The reproducibility mirror lib/goal-piloting.test.ts (fast-check) pins it.
 *
 * THE WALL (CLAUDE.md §2/§7): every function here returns VALUES — pilotOpenGoal returns a
 * DRAFT ChangeSet PROPOSAL, never APPLIED; pilotCloseGoal is a pure predicate, it never stamps
 * CLOSED. The screen PROPOSES a ChangeSet, never writes the Kernel. Persistence of the proposed
 * ChangeSet rides the changeset door (S20) under human approval — the aidos CLI role, never the agent.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure, total, deterministic; no clock, no rng, no I/O; no
 * agent-confidence is ever an input — "done" is computed, never declared.
 */

import {
	type BlockReason as ActorBlockReason,
	type RealActor,
	requireRealActor,
} from "./authority-binding";
import {
	type Budgets,
	GOAL_STILL_RED,
	type Goal,
	isClosed,
	type StopInput,
} from "./goal";

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

/** The pure input to pilotOpenGoal (twin of goalpiloting.OpenInput, screen-facing subset). */
export interface PilotOpenInput {
	ideaId: string;
	specDelta: Delta;
	/** Absent ⇒ a vœu (refused IDEA_WITHOUT_MIRROR). */
	mirrorDelta?: Delta;
	parentPhase: string;
	/** The LIVE red set the engine derived (S22 Impact) — the worklist. Non-empty for a real goal. */
	redSet: string[];
	budgets: Budgets;
}

/** What the screen receives when an authority-bearing human opens a goal (twin of PilotResult). */
export interface PilotResult {
	actor: RealActor;
	goal: Goal;
}

/** The canonical IDEA_WITHOUT_MIRROR refusal (twin of blockreason.For, FR prose). */
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

/** The canonical NO_RED_SET refusal (a green test is not a goal, §56). */
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

/** The PLACEHOLDER_ACTOR refusal mapped from the S63 actor gate into the PilotBlock shape. */
function fromActorBlock(b: ActorBlockReason): PilotBlock {
	return {
		code: b.code,
		severity: b.severity,
		explanation: b.explanation,
		howToFix: b.howToFix,
	};
}

/**
 * pilotOpenGoal — the S66 UI-piloted goal-open (twin of goalpiloting.PilotOpenGoal). It runs
 * TWO gates in order:
 *   1) the ACTOR gate (S63): a real human, never a placeholder/agent — else PLACEHOLDER_ACTOR;
 *   2) the OPEN (S29): a mirror-less idea is refused IDEA_WITHOUT_MIRROR; an empty red set is
 *      refused NO_RED_SET; otherwise an OPEN goal carrying a DRAFT ChangeSet PROPOSAL + the
 *      LIVE red set.
 * It WRITES NOTHING — the goal it returns carries a DRAFT (proposed) ChangeSet, never APPLIED.
 * Returns the PilotResult on success, or a PilotBlock refusal. Pure.
 */
export function pilotOpenGoal(
	actor: RealActor,
	input: PilotOpenInput,
): { result: PilotResult | null; block: PilotBlock | null } {
	// (1) The actor gate — never a goal for nobody (the wall).
	const actorBlock = requireRealActor(actor);
	if (actorBlock !== null) {
		return { result: null, block: fromActorBlock(actorBlock) };
	}
	// (2a) A mirror-less idea is a vœu — refused before anything is opened.
	if (input.mirrorDelta === undefined) {
		return { result: null, block: IDEA_WITHOUT_MIRROR };
	}
	// (2b) An empty red set is not a goal.
	if (input.redSet.length === 0) {
		return { result: null, block: NO_RED_SET };
	}
	// (2c) The OPEN — a DRAFT ChangeSet proposal + the live red set, status OPEN.
	const goal: Goal = {
		id: `goal:${input.ideaId}`,
		ideaRef: input.ideaId,
		changeSetRef: `cs:${input.ideaId}`,
		changeSetStatus: "DRAFT",
		redSet: liveRedSet(input.redSet),
		status: "OPEN",
		budgets: input.budgets,
	};
	return { result: { actor, goal }, block: null };
}

/**
 * pilotCloseGoal — the S66 UI-piloted close attempt (twin of goalpiloting.PilotCloseGoal). It
 * DEFERS to S29's non-gameable stop: the GOAL_STILL_RED refusal while any of the four conditions
 * fails, null when closeable. It NEVER stamps CLOSED. Pure; no agent-confidence input.
 */
export function pilotCloseGoal(
	redSet: string[],
	input: StopInput,
): PilotBlock | null {
	return isClosed(redSet, input) ? null : GOAL_STILL_RED;
}

/** canClose — whether the four-condition stop holds (the live close indicator). Defers to isClosed. */
export function canClose(redSet: string[], input: StopInput): boolean {
	return isClosed(redSet, input);
}

/** liveRedSet — the worklist in stable sorted order (twin of goal.RedSetSorted). Pure. */
export function liveRedSet(redSet: string[]): string[] {
	return [...redSet].sort();
}
