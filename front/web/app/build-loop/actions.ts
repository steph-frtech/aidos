"use server";

import {
	type Decision,
	type Iteration,
	type StopInput,
	terminate,
} from "@/lib/build-loop";

/**
 * Server Actions for the /build-loop Workbench panel (S83 — the build-loop service + the
 * deterministic circuit breaker).
 *
 * THE STEP (ROADMAP S83): the executing agent of the app-builder. The loop takes a red set →
 * compiles a ContextPack (S33 algorithm) → calls the LLM → writes the sandbox (S82) → runs the
 * affected mirrors → iterates red→green → records the AgentRun/AgentAction (S52), and STOPS
 * HONESTLY the instant the non-gameable Stop passes OR a build that spends without advancing is
 * detected (BUILD_LOOP_NO_PROGRESS), wired to the HarnessCostBudget (S51).
 *
 * THE ACTION-CAPABLE OP (ui-completeness, CLAUDE.md §7): the op this screen develops is the
 * TERMINATION DECISION — given a red set, the live sensor verdicts, the iteration history and the
 * declared budget, COMPUTE whether the loop terminates green, halts (no_progress), or continues.
 * It is a PURE FUNCTION OF THE HISTORY (the deterministic twin lib/build-loop.terminate,
 * byte-identical to back/runtime/buildloop.Terminate) — never an LLM judgment. The control on the
 * screen is bound to it and executes it; the Playwright e2e proves it.
 *
 * THE WALL (CLAUDE.md §2): the termination decision is a READ/COMPUTE below the line — it writes
 * NOTHING. The AgentRun it would record rides the agentloop below-the-line INSERT grant (S52); a
 * truth the loop proposes goes through propose→ChangeSet (S85). This action never touches the
 * kernel/mirrors/fitness — it returns the Decision as a VALUE.
 */

export interface EvaluateResult {
	ok: boolean;
	/** i18n key under "buildLoop.messages" describing a validation outcome (empty when ok). */
	messageKey?: string;
	/** The computed termination decision (when ok). */
	decision?: Decision;
	/** Echo of the iteration count the decision was taken over. */
	iterations?: number;
}

function parseList(raw: string): string[] {
	return raw
		.split("\n")
		.map((s) => s.trim())
		.filter((s) => s !== "");
}

/**
 * parseHistory reads the history textarea: one iteration per line, "diffHash | m1,m2"
 * (the green mirror refs after that turn, comma-separated; the comma-list may be empty).
 * Deterministic parse — same text → same history.
 */
function parseHistory(raw: string): Iteration[] {
	return parseList(raw).map((line) => {
		const [diffPart, greenPart = ""] = line.split("|");
		return {
			diffHash: diffPart.trim(),
			greenMirrors: greenPart
				.split(",")
				.map((s) => s.trim())
				.filter((s) => s !== ""),
		};
	});
}

/**
 * evaluateTerminationAction is the action-capable control behind the build-loop console
 * (CLAUDE.md §7 ui-completeness): the human supplies the red set, the green sensor verdicts, the
 * non-gameable Stop conditions (prior-green / mutation / floor / monsters), the iteration history
 * and the declared budget, then submits — the action COMPUTES the termination decision
 * DETERMINISTICALLY (the code is the authority) and returns it (green | no_progress | continue),
 * with the BUILD_LOOP_NO_PROGRESS block code + over-budget axes when the breaker tripped. No LLM
 * enters; the judge is the mirror verdict + the pure detector.
 */
export async function evaluateTerminationAction(
	_prev: EvaluateResult,
	formData: FormData,
): Promise<EvaluateResult> {
	const redSet = parseList(String(formData.get("redSet") ?? ""));
	if (redSet.length === 0) return { ok: false, messageKey: "redSetEmpty" };

	const greenSensors = parseList(String(formData.get("greenSensors") ?? ""));
	const priorBroken = String(formData.get("priorBroken") ?? "") === "on";
	const mutation = Number(formData.get("mutation") ?? "0") || 0;
	const mutationFloor = Number(formData.get("mutationFloor") ?? "0") || 0;
	const monsters = parseList(String(formData.get("monsters") ?? ""));

	const history = parseHistory(String(formData.get("history") ?? ""));

	const maxIterations = Number(formData.get("maxIterations") ?? "0") || 0;
	const stagnationWindow = Number(formData.get("stagnationWindow") ?? "0") || 0;

	const maxLlmTokens = Number(formData.get("maxLlmTokens") ?? "0") || 0;
	const spentLlmTokens = Number(formData.get("spentLlmTokens") ?? "0") || 0;
	const valueCaseJustified =
		String(formData.get("valueCaseJustified") ?? "") === "on";

	const greenIdx = new Set(greenSensors);
	const sensors: StopInput["sensors"] = {};
	for (const m of redSet) sensors[m] = greenIdx.has(m) ? "green" : "red";

	const decision = terminate({
		redSet,
		stop: {
			sensors,
			priorGreen: priorBroken ? "broken" : "intact",
			mutation,
			mutationFloor,
			monsters,
		},
		history,
		policy: { maxIterations, stagnationWindow },
		budget: { maxLlmTokensPerGoal: maxLlmTokens, maxCiMinutes: 0 },
		cost: { llmTokens: spentLlmTokens, ciMinutes: 0 },
		valueCaseJustified,
	});

	return { ok: true, decision, iterations: history.length };
}
