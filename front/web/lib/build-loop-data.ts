/**
 * build-loop-data — the DETERMINISTIC demo fixture for the /build-loop panel (S83;
 * ADR 0092 batch-2 kill-twins flip). It holds the gateway-arg projection of the build-loop
 * console form AND the twin `terminate()` of it, kept ONLY as the demo `Decision` the panel
 * falls back to when the gateway is unreachable / undispatched / refused (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before the flip /build-loop computed
 * its displayed termination Decision from the TS twin `lib/build-loop.terminate()` DIRECTLY —
 * the twin WAS the live source. The flip routes `evaluateTerminationAction` through the Go
 * engine via the passerelle (`readVia(scope, "buildloop_terminate", …)`, the dispatched
 * below-the-line read of the build-loop MCP server, S59 cutover style); this fixture is KEPT
 * only as the deterministic fallback. The presence of this `-data.ts` sibling is ALSO what
 * makes the T5 cliquet (twin-as-live-fitness) RECOGNISE `lib/build-loop` as a twin — the panel
 * stays GREEN because `actions.ts` imports the `readVia` frontier (the witness the twin sits
 * behind `source:"demo"`).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): both the gateway-arg projection and the demo Decision are
 * the same PURE twin compute the Go `buildloop.Terminate` reproduces — same input → byte-identical
 * Decision. The parity mirror app/build-loop/live.test.ts pins the decoder shape == the Go
 * buildloop_terminate output contract (terminateOutput).
 */

import {
	type Decision,
	type Iteration,
	type StopInput,
	terminate,
} from "./build-loop";

/**
 * TerminationForm is the parsed, typed console input the panel collects (the same fields the
 * old twin-read consumed) — kept here so BOTH the live gateway-arg projection and the demo
 * Decision are computed from ONE source.
 */
export interface TerminationForm {
	redSet: string[];
	greenSensors: string[];
	priorBroken: boolean;
	mutation: number;
	mutationFloor: number;
	monsters: string[];
	history: Iteration[];
	maxIterations: number;
	stagnationWindow: number;
	maxLlmTokens: number;
	spentLlmTokens: number;
	valueCaseJustified: boolean;
}

/**
 * gatewayTerminateArgs maps the front TerminationForm to the Go `buildloop_terminate` tool's
 * `terminateInput` JSON shape (snake_case, the green_sensors/history/budget fields). PURE — a
 * deterministic projection, never an LLM. The history maps each Iteration to {diff_hash,
 * green_mirrors}; the budget rides max_llm_tokens_per_goal + spent_llm_tokens.
 */
export function gatewayTerminateArgs(
	f: TerminationForm,
): Record<string, unknown> {
	return {
		goal_id: "build-loop-console",
		red_set: f.redSet,
		green_sensors: f.greenSensors,
		prior_broken: f.priorBroken,
		mutation: f.mutation,
		mutation_floor: f.mutationFloor,
		monsters: f.monsters,
		history: f.history.map((it) => ({
			diff_hash: it.diffHash,
			green_mirrors: it.greenMirrors,
		})),
		max_iterations: f.maxIterations,
		stagnation_window: f.stagnationWindow,
		max_llm_tokens_per_goal: f.maxLlmTokens,
		spent_llm_tokens: f.spentLlmTokens,
		value_case_justified: f.valueCaseJustified,
	};
}

/**
 * demoTerminate is the deterministic demo Decision — the twin `terminate()` of the console
 * form. It is the SAME compute the Go `buildloop.Terminate` reproduces, so the demo and the
 * live read are identical in shape; the panel falls back to it on any gateway miss.
 */
export function demoTerminate(f: TerminationForm): Decision {
	const greenIdx = new Set(f.greenSensors);
	const sensors: StopInput["sensors"] = {};
	for (const m of f.redSet) sensors[m] = greenIdx.has(m) ? "green" : "red";
	return terminate({
		redSet: f.redSet,
		stop: {
			sensors,
			priorGreen: f.priorBroken ? "broken" : "intact",
			mutation: f.mutation,
			mutationFloor: f.mutationFloor,
			monsters: f.monsters,
		},
		history: f.history,
		policy: {
			maxIterations: f.maxIterations,
			stagnationWindow: f.stagnationWindow,
		},
		budget: { maxLlmTokensPerGoal: f.maxLlmTokens, maxCiMinutes: 0 },
		cost: { llmTokens: f.spentLlmTokens, ciMinutes: 0 },
		valueCaseJustified: f.valueCaseJustified,
	});
}
