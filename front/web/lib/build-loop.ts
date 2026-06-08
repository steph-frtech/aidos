/**
 * build-loop.ts — the deterministic TS twin of back/runtime/buildloop (S83).
 *
 * THE STEP (ROADMAP S83): the build-loop service (the executing agent) + its
 * DETERMINISTIC CIRCUIT BREAKER. The loop takes a red set → compiles a ContextPack
 * (S33 algorithm) → calls the LLM → writes the sandbox (S82) → runs the affected
 * mirrors → iterates red→green → records the AgentRun/AgentAction (S52), and STOPS
 * HONESTLY the instant the non-gameable Stop passes OR a build that spends without
 * advancing is detected (BUILD_LOOP_NO_PROGRESS), wired to the HarnessCostBudget (S51).
 *
 * THE TWIN (no drift): this module mirrors the Go authority byte-for-byte — the SAME
 * no-progress signals (max-iterations / zero newly-green / repeated diff-hash / red↔green
 * oscillation), the SAME termination precedence (green-first via the non-gameable Stop,
 * else breaker, else continue), the SAME closed verdict enum. The reproducibility mirror
 * lib/build-loop.test.ts (fast-check) pins same-history → same-verdict.
 *
 * THE WALL (CLAUDE.md §2): termination is a PURE FUNCTION OF THE HISTORY — never an LLM
 * judgment. This module writes NOTHING; the Server Action records the AgentRun below the
 * line (S52). A truth proposed by the loop goes through propose→ChangeSet (S85), never a
 * write from this screen.
 */

/** The closed termination verdict — COMPUTED, never declared by the agent. */
export type Verdict = "continue" | "green" | "no_progress";

/** The closed verdict set, in canonical order (twin of buildloop.Verdicts). */
export const VERDICTS: readonly Verdict[] = [
	"continue",
	"green",
	"no_progress",
];

/** One recorded turn of the build loop — pure data, the unit the breaker reasons over. */
export interface Iteration {
	/** content-hash of the diff the LLM produced this turn (a repeat = churn). */
	diffHash: string;
	/** the mirror refs green AFTER this turn's sensors ran. */
	greenMirrors: string[];
}

/** The declared, above-the-line breaker envelope (budgets are declared, never learned). */
export interface Policy {
	/** hard cap on loop turns (0 = no cap). */
	maxIterations: number;
	/** consecutive zero-progress turns before the breaker trips (≥ 1 to arm). */
	stagnationWindow: number;
}

/** The non-gameable Stop input (twin of goal.StopInput). */
export interface StopInput {
	/** maps a red-set mirror ref → "green" | "red" (a missing entry is red). */
	sensors: Record<string, "green" | "red">;
	/** whether the prior green corpus is intact. */
	priorGreen: "intact" | "broken";
	/** current mutation score 0..1. */
	mutation: number;
	/** declared mutation floor 0..1. */
	mutationFloor: number;
	/** monster findings; any ⇒ block. */
	monsters: string[];
}

/** The declared HarnessCostBudget caps (S51) — 0 = no cap on that axis. */
export interface Budget {
	maxLlmTokensPerGoal: number;
	maxCiMinutes: number;
}
/** The measured consumption so far (S52-derived count, never an estimate). */
export interface MeasuredCost {
	llmTokens: number;
	ciMinutes: number;
}

/** The pure input to terminate — and NOTHING ELSE (no agent-confidence field). */
export interface TerminationInput {
	redSet: string[];
	stop: StopInput;
	history: Iteration[];
	policy: Policy;
	budget: Budget;
	cost: MeasuredCost;
	/** true iff a justified ValueCase clears an over-budget flag. */
	valueCaseJustified: boolean;
}

/** The typed termination decision. */
export interface Decision {
	verdict: Verdict;
	/** "BUILD_LOOP_NO_PROGRESS" when halted, else "". */
	blockCode: string;
	/** budget axes that contributed to a budget halt (for the console). */
	overBudgetAxes: string[];
}

/**
 * isClosed — the NON-GAMEABLE Stop predicate (twin of goal.IsClosed): a goal closes iff
 * red set→green ∧ prior green intact ∧ mutation ≥ floor ∧ no monster. A missing sensor
 * verdict counts as red (anti-passthrough). Pure, total, no confidence input.
 */
export function isClosed(redSet: string[], s: StopInput): boolean {
	for (const m of redSet) {
		if (s.sensors[m] !== "green") return false;
	}
	if (s.priorGreen !== "intact") return false;
	if (s.mutation < s.mutationFloor) return false;
	if (s.monsters.length > 0) return false;
	return true;
}

function greenSet(ms: string[]): Set<string> {
	return new Set(ms);
}

/**
 * noProgress — the DETERMINISTIC no-progress detector (twin of buildloop.NoProgress): true
 * iff the build is spending without advancing, on ANY signal:
 *   (a) max-iterations cap reached;
 *   (b) zero newly-green across the last stagnationWindow turns;
 *   (c) the two most recent diffs are byte-identical churn;
 *   (d) a mirror green in the prior turn is no longer green now (red↔green oscillation).
 * Same history + policy ⇒ same verdict. Total: an empty history is "not stuck yet".
 */
export function noProgress(history: Iteration[], p: Policy): boolean {
	const n = history.length;
	if (n === 0) return false;

	// (a) max-iterations.
	if (p.maxIterations > 0 && n >= p.maxIterations) return true;

	if (p.stagnationWindow < 1) return false;

	// (c) repeated diff-hash.
	if (
		n >= 2 &&
		history[n - 1].diffHash !== "" &&
		history[n - 1].diffHash === history[n - 2].diffHash
	) {
		return true;
	}

	// (d) red↔green oscillation.
	if (n >= 2) {
		const latest = greenSet(history[n - 1].greenMirrors);
		for (const m of history[n - 2].greenMirrors) {
			if (!latest.has(m)) return true;
		}
	}

	// (b) zero newly-green across the window.
	if (n >= p.stagnationWindow) {
		const start = n - p.stagnationWindow;
		let sawNew = false;
		for (let k = start; k < n && !sawNew; k++) {
			const prev =
				k === 0 ? new Set<string>() : greenSet(history[k - 1].greenMirrors);
			for (const m of history[k].greenMirrors) {
				if (!prev.has(m)) {
					sawNew = true;
					break;
				}
			}
		}
		if (!sawNew) return true;
	}

	return false;
}

/**
 * overBudgetAxes — the over-budget axis names (byte-identical twin of the Go
 * economics.overBudgetAxes): a cost STRICTLY greater than its declared cap is over budget
 * (the cap is the inclusive ceiling). The axis names are the MeasuredCost field names in the
 * Go authority's stable order ("ci_minutes" then "llm_tokens"). A zero cap with a zero cost
 * is within budget (0 > 0 is false); a positive cost against a zero cap is over (matching Go,
 * which does not special-case a zero cap).
 */
function overBudgetAxes(b: Budget, c: MeasuredCost): string[] {
	const axes: string[] = [];
	if (c.ciMinutes > b.maxCiMinutes) axes.push("ci_minutes");
	if (c.llmTokens > b.maxLlmTokensPerGoal) axes.push("llm_tokens");
	return axes;
}

/**
 * terminate — the NON-GAMEABLE termination verdict (twin of buildloop.Terminate). Pure,
 * total, deterministic. Precedence:
 *   1. GREEN first — if the non-gameable Stop passes, terminate green.
 *   2. else BREAKER — not green AND (no-progress OR over-budget-flagged) ⇒ no_progress
 *      with BUILD_LOOP_NO_PROGRESS. A justified ValueCase clears the budget flag.
 *   3. else CONTINUE.
 * The LLM never decides termination; the judge is the mirror + the pure detector.
 */
export function terminate(input: TerminationInput): Decision {
	if (isClosed(input.redSet, input.stop)) {
		return { verdict: "green", blockCode: "", overBudgetAxes: [] };
	}
	const stuck = noProgress(input.history, input.policy);
	const axes = overBudgetAxes(input.budget, input.cost);
	const overBudget = axes.length > 0 && !input.valueCaseJustified;
	if (stuck || overBudget) {
		return {
			verdict: "no_progress",
			blockCode: "BUILD_LOOP_NO_PROGRESS",
			overBudgetAxes: overBudget ? axes : [],
		};
	}
	return { verdict: "continue", blockCode: "", overBudgetAxes: [] };
}
