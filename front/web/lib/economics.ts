/**
 * Harness economics — the PURE projection of back/runtime/economics (AIDOS step S51).
 *
 * Determinism-first (CLAUDE.md §6/§8): `evaluate` is the authoritative pure function,
 * mirroring the Go `Evaluate` verdict-for-verdict — the per-axis comparison is
 * arithmetic, the verdict selection is a switch, the BlockReason is the S13 shape. No
 * I/O, no Date.now(), no clock. Same {budget, cost, valueCase} → same verdict. The
 * panel runs this per row, so each badge is COMPUTED, never declared. Covered by
 * lib/economics.test.ts (the reproducibility mirror).
 *
 * The HarnessCostBudget is the DECLARED bar (above the line, read-only). The
 * MeasuredCost is CONSUMED (telemetry / changesets / the S40 mutation run / the goal's
 * spend). Nothing here authors or raises the budget.
 */

/** risk_if_broken — the closed declared enum (KRD §66.3). */
export const RISKS = ["low", "medium", "high", "critical"] as const;
export type Risk = (typeof RISKS)[number];

/** decision — the closed declared enum (KRD §66.3). Only `justified` clears the flag. */
export const DECISIONS = ["justified", "too_expensive", "revisit"] as const;
export type Decision = (typeof DECISIONS)[number];

/** verdict — the EconomicsDecision, closed enum. `evaluate` is total over these. */
export const VERDICTS = [
	"within_budget",
	"over_budget_justified",
	"over_budget_flagged",
] as const;
export type Verdict = (typeof VERDICTS)[number];

/** The advisory BlockReason code raised when a costly truth exceeds its budget unjustified. */
export const CODE_HARNESS_COST_EXCEEDS_BUDGET = "HARNESS_COST_EXCEEDS_BUDGET";

/** The HarnessCostBudget — a cell's DECLARED, above-the-line cap (KRD §66.3). */
export interface HarnessCostBudget {
	cellRef: string;
	maxCiMinutes: number;
	maxLlmTokensPerGoal: number;
	maxMutationRuntimeSeconds: number;
	maxHumanReviewMinutes: number;
	expectedRiskReduction: Risk;
}

/** The MeasuredCost — the CONSUMED real harness cost (never produced here). */
export interface MeasuredCost {
	ciMinutes: number;
	llmTokens: number;
	mutationRuntimeSeconds: number;
	humanReviewMinutes: number;
}

/** A ValueCase — ties a costly truth to a decision (KRD §66.3). */
export interface ValueCase {
	truth: string;
	riskIfBroken: Risk;
	expectedImpact: string;
	harnessCost: Partial<MeasuredCost>;
	decision: Decision;
}

/** The actionable refusal (KRD §44.5: code, severity, explanation, how_to_fix[]). */
export interface BlockReason {
	code: string;
	severity: "blocking";
	explanation: string;
	howToFix: string[];
}

/** The typed result of `evaluate` — the verdict, the over-budget axes, the BlockReason when flagged. */
export interface EconomicsDecision {
	cellRef: string;
	verdict: Verdict;
	overAxes: string[];
	blockReason: BlockReason | null;
}

/** The per-axis OR over-budget rule (ADR 0035): over on ANY cap is over budget; equal = within. */
export function overBudgetAxes(
	b: HarnessCostBudget,
	c: MeasuredCost,
): string[] {
	const axes: string[] = [];
	if (c.ciMinutes > b.maxCiMinutes) axes.push("ci_minutes");
	if (c.llmTokens > b.maxLlmTokensPerGoal) axes.push("llm_tokens");
	if (c.mutationRuntimeSeconds > b.maxMutationRuntimeSeconds)
		axes.push("mutation_runtime");
	if (c.humanReviewMinutes > b.maxHumanReviewMinutes)
		axes.push("human_review_minutes");
	return axes;
}

/** The canonical advisory BlockReason for a flagged truth (mirrors the Go shape). */
function harnessCostExceedsBudget(
	cellRef: string,
	axes: string[],
): BlockReason {
	return {
		code: CODE_HARNESS_COST_EXCEEDS_BUDGET,
		severity: "blocking",
		explanation:
			`Économie du harnais (KRD §66.3) : le coût de harnais mesuré de la cellule « ${cellRef} » dépasse ` +
			`son HarnessCostBudget déclaré sur ${axes.join(", ")}, sans ValueCase « justified ». Une contrainte ` +
			`coûteuse qui ne justifie pas sa valeur est signalée. Le budget est DÉCLARÉ au-dessus de la ligne ` +
			`(zone fitness, lecture seule) ; l'agent ne le règle jamais.`,
		howToFix: [
			"open_value_case : ouvrez une ValueCase pour cette vérité coûteuse (reliez son coût au risk_if_broken et à l'expected_impact, et tranchez).",
			"reduce_harness_cost : ramenez le coût mesuré sous le cap déclaré.",
			"raise_budget_via_goal : si le cap est trop bas, relevez-le via un /goal — jamais une édition directe.",
		],
	};
}

/**
 * evaluate — the pure heart of S51, mirroring the Go `Evaluate`. Total over
 * (budget, cost, valueCase): within every cap ⇒ within_budget; over any cap with a
 * justified ValueCase ⇒ over_budget_justified; over any cap with no justified
 * ValueCase ⇒ over_budget_flagged with a HARNESS_COST_EXCEEDS_BUDGET BlockReason.
 */
export function evaluate(
	b: HarnessCostBudget,
	c: MeasuredCost,
	vc: ValueCase | null,
): EconomicsDecision {
	const axes = overBudgetAxes(b, c);
	if (axes.length === 0) {
		return {
			cellRef: b.cellRef,
			verdict: "within_budget",
			overAxes: [],
			blockReason: null,
		};
	}
	if (vc !== null && vc.decision === "justified") {
		return {
			cellRef: b.cellRef,
			verdict: "over_budget_justified",
			overAxes: axes,
			blockReason: null,
		};
	}
	return {
		cellRef: b.cellRef,
		verdict: "over_budget_flagged",
		overAxes: axes,
		blockReason: harnessCostExceedsBudget(b.cellRef, axes),
	};
}

/** Render seconds as a compact "Nm" / "Ns" duration for the panel (e.g. 300 → "5m"). */
export function durationLabel(seconds: number): string {
	if (seconds % 60 === 0) return `${seconds / 60}m`;
	return `${seconds}s`;
}
