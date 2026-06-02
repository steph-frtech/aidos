/**
 * Goal engine — the Workbench /goal source (AIDOS step S29).
 *
 * KRD §56–§59, §63 ①, LIVRE XX: the only legitimate door from a candidate-truth (an idea) to truth —
 * `idea → mirror → /goal`. A goal is a DRAFT ChangeSet (S20) carrying the idea's spec_delta +
 * mirror_delta atomically PLUS the RED SET — the failing mirror refs that ARE the goal (§56: "le test
 * rouge EST le goal ; le set rouge EST la todo-list").
 *
 * The stop is NON-GAMEABLE (§57 Algorithme ①, §8): a goal closes iff
 *
 *     red set → green  ∧  prior green intact  ∧  mutation ≥ floor  ∧  no monster
 *
 * `isClosed` computes that verdict; it takes NO agent-confidence input — the engine never reads the
 * agent's claim of "done" (the whole point of S29: the agent never grades its own copy).
 *
 * This module is the DECLARED TWIN of the Go package back/runtime/goal — the SAME four-condition stop,
 * the SAME OPEN/CLOSED computed status, the SAME GOAL_STILL_RED refusal. One semantics, no drift — so
 * /goal renders EXACTLY what the Go engine computes. The reproducibility mirror lib/goal.test.ts
 * (fast-check) pins it.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): /goal PROJECTS the goal and computes the stop
 * verdict; opening a goal and stamping it CLOSED are TRUTH writes owned by the aidos CLI writer role
 * via the /goal flow + S20's commit-gate. The agent DB role is SELECT-only on ideas.goal — never a
 * write (and never a CLOSED stamp) from this screen.
 */

/** A mirror's live verdict as the stop predicate reads it (twin of goal.SensorState). */
export type SensorState = "green" | "red";

/** Whether the prior green corpus is intact (twin of goal.PriorGreenState). §8. */
export type PriorGreenState = "intact" | "broken";

/** A goal's computed lifecycle status (twin of goal.Status). CLOSED is computed, never declared. */
export type GoalStatus = "OPEN" | "CLOSED";

/** The actionable refusal shape (mirrors blockreason.BlockReason, KRD §44.5). */
export interface BlockReason {
	code: string;
	severity: string;
	explanation: string;
	howToFix: string[];
}

/** The canonical GOAL_STILL_RED BlockReason — the twin of blockreason.For (FR prose). */
export const GOAL_STILL_RED: BlockReason = {
	code: "GOAL_STILL_RED",
	severity: "blocking",
	explanation:
		"Refus de la fermeture (stop non-gameable, KRD §57 Algorithme ①/§8) : le goal ne peut PAS être fermé — au moins une des quatre conditions calculées échoue (un miroir encore rouge, un vert antérieur cassé, un score de mutation sous le seuil, ou un monstre). « Done » est CALCULÉ, jamais déclaré : le moteur ne lit jamais la confiance de l'agent.",
	howToFix: [
		"close_red_mirrors : passez au vert tout miroir encore rouge du set rouge (la todo-list du goal).",
		"restore_prior_green : réparez tout vert antérieur cassé — aucune fermeture ne casse un seul vert existant (KRD §8).",
		"raise_mutation_or_remove_monster : remontez le score de mutation au-dessus du seuil et éliminez tout monstre (orphelin / vérité sans miroir).",
		"rerun aidos check : la fermeture est admise dès que les quatre conditions tiennent — jamais sur la déclaration de l'agent.",
	],
};

/** Declared (never learned) secondary anti-runaway guard — time/turns/tokens (twin of goal.Budgets). */
export interface Budgets {
	timeSeconds: number;
	turns: number;
	tokens: number;
}

/** A goal as the panel renders it: the idea/changeset refs, the red set, status, budgets. */
export interface Goal {
	id: string;
	ideaRef: string;
	changeSetRef: string;
	changeSetStatus: "DRAFT" | "APPLIED" | "REVERTED";
	redSet: string[];
	status: GoalStatus;
	budgets: Budgets;
}

/** The live verdicts the stop predicate reads (twin of goal.StopInput). NO confidence field. */
export interface StopInput {
	/** Per red-set mirror ref → its live verdict. A missing entry is treated as red. */
	sensors: Record<string, SensorState>;
	priorGreen: PriorGreenState;
	mutation: number;
	mutationFloor: number;
	monsters: string[];
}

/** The four computed conditions, individually — what the stop indicator renders. */
export interface StopConditions {
	redSetGreen: boolean;
	priorGreenIntact: boolean;
	mutationOk: boolean;
	noMonster: boolean;
}

/** Compute each of the four non-gameable stop conditions (twin of the IsClosed clauses). */
export function stopConditions(
	redSet: string[],
	input: StopInput,
): StopConditions {
	const redSetGreen = redSet.every((m) => input.sensors[m] === "green");
	return {
		redSetGreen,
		priorGreenIntact: input.priorGreen === "intact",
		mutationOk: input.mutation >= input.mutationFloor,
		noMonster: input.monsters.length === 0,
	};
}

/**
 * isClosed — the NON-GAMEABLE stop predicate (twin of goal.IsClosed). A goal closes iff all four
 * conditions hold. Pure, total, deterministic; takes NO agent-confidence input. A missing sensor
 * verdict counts as red (anti-passthrough): the goal cannot close on absent evidence.
 */
export function isClosed(redSet: string[], input: StopInput): boolean {
	const c = stopConditions(redSet, input);
	return c.redSetGreen && c.priorGreenIntact && c.mutationOk && c.noMonster;
}

/**
 * closeBlockReason — the actionable GOAL_STILL_RED refusal when isClosed is false (twin of
 * goal.CloseBlockReason). null when the goal IS closeable.
 */
export function closeBlockReason(
	redSet: string[],
	input: StopInput,
): BlockReason | null {
	return isClosed(redSet, input) ? null : GOAL_STILL_RED;
}
