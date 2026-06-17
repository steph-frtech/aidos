/**
 * build-console-data — the DETERMINISTIC demo fixtures + gateway-arg projections for the
 * /build-console panel (ADR 0092 kill-twins batch-2).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before the cutover /build-console
 * computed both displayed ops (the projected console state, the stable-phase verdict) from the
 * TS twin `lib/build-console` directly — the twin WAS the live source. The cutover routes both
 * Server Actions through the Go engine via the passerelle (`readVia(scope, "buildconsole_project"
 * | "buildconsole_record_stable_phase", …)`, the dispatched below-the-line reads of the
 * build-console MCP server); this fixture is KEPT only as the deterministic fallback
 * (`source:"demo"`). The presence of this `-data.ts` sibling is also what makes the T5 cliquet
 * (twin-as-live-fitness) RECOGNISE `lib/build-console` as a twin — the panel stays GREEN because
 * `actions.ts` imports the `readVia` frontier (the witness the twin sits behind `source:"demo"`).
 *
 * TWO RESPONSIBILITIES (both PURE):
 *   - the GATEWAY-ARG PROJECTION (`gatewayProjectArgs` / `gatewayStableArgs`) maps the panel's
 *     parsed input to the Go tools' snake_case input contract (projectInput / recordStableInput).
 *     NO body rides as a json.RawMessage (the S59 scar): writes/links/sensors/heads/cut all ride
 *     as objects/arrays of objects — never a byte array;
 *   - the DEMO OUTPUT (`demoProject` / `demoStable`) is the SAME pure twin compute the Go engine
 *     reproduces — `project` + `stateEqualsRun` for the console state, `recordStablePhase` for the
 *     §43 verdict — re-shaped to the live wire output the decoder fills (live.ts).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): every function here is pure — same input → same output;
 * no clock, no rng, no LLM. The parity mirror app/build-console/live.test.ts pins the decoders
 * == the Go projectOutput / recordStableOutput contracts. THE WALL (§2): both ops are read inputs;
 * the console state + the node are projections, never a truth.
 */

import type { ProjectView, StableView } from "../app/build-console/live";
import {
	type ConsoleInput,
	project,
	recordStablePhase,
	type StablePhaseRequest,
	stateEqualsRun,
} from "./build-console";

// ── Gateway-arg projections — the panel input → the Go tools' snake_case input contract ──

/**
 * gatewayProjectArgs maps the parsed console input to the Go `buildconsole_project` tool's
 * projectInput (snake_case). The writes ride as `{ diff_hash, authorised }` objects and the
 * arrays as arrays of strings — NO json.RawMessage body (the S59 scar guard).
 */
export function gatewayProjectArgs(
	input: ConsoleInput,
): Record<string, unknown> {
	return {
		run_id: input.runId,
		goal: input.goal,
		result: input.result,
		writes: input.writes.map((w) => ({
			diff_hash: w.diffHash,
			authorised: w.authorised,
		})),
		diff_hashes: input.diffHashes,
		green_mirrors: input.greenMirrors,
		verdict: input.verdict,
		max_ci_minutes: input.ciMinutesCap,
		max_llm_tokens_per_goal: input.llmTokensCap,
		spent_ci_minutes: input.ciMinutesSpent,
		spent_llm_tokens: input.llmTokensSpent,
		over_budget_axes: input.overBudgetAxes,
		pending: input.pending,
	};
}

/**
 * gatewayStableArgs maps the §43 cut to the Go `buildconsole_record_stable_phase` tool's
 * recordStableInput (snake_case). The links/sensors ride as arrays of objects and the
 * cut/heads as plain objects — NO json.RawMessage body (the S59 scar guard).
 */
export function gatewayStableArgs(
	req: StablePhaseRequest,
): Record<string, unknown> {
	return {
		project_slug: req.projectId,
		cut: req.cut,
		heads: req.heads,
		links: req.links.map((l) => ({
			from_id: l.fromId,
			from_version: l.fromVersion,
			to_id: l.toId,
			to_version: l.toVersion,
		})),
		sensors: req.sensors.map((s) => ({ id: s.id, pass: s.pass })),
		label: req.label,
	};
}

// ── Demo outputs — the same pure twin compute the Go engine reproduces, in the live wire shape ──

/**
 * demoProject is the deterministic fallback for `buildconsole_project`: the SAME pure twin
 * projection (`project` + the non-gameable `stateEqualsRun`) the Go `buildconsole.Project`
 * reproduces, flattened to the live ProjectView the decoder fills. `source:"demo"`.
 */
export function demoProject(input: ConsoleInput): ProjectView {
	const state = project(input);
	const faithful = stateEqualsRun(state, {
		id: input.runId,
		goal: input.goal,
		result: input.result,
		writes: input.writes,
	});
	return {
		runId: state.runId,
		goal: state.goal,
		result: state.result,
		attempts: state.attempts,
		sensors: state.sensors,
		ciSpent: state.cost.ciMinutesSpent,
		ciCap: state.cost.ciMinutesCap,
		tokensSpent: state.cost.llmTokensSpent,
		tokensCap: state.cost.llmTokensCap,
		overBudgetAxes: state.cost.overBudgetAxes,
		verdict: state.breaker.verdict,
		breakerTripped: state.breaker.tripped,
		pendingCount: state.approval.pendingCount,
		pendingIds: state.approval.pendingIds,
		faithfulProjection: faithful,
	};
}

/**
 * demoStable is the deterministic fallback for `buildconsole_record_stable_phase`: the SAME pure
 * §43 twin verdict (`recordStablePhase`) the Go `buildconsole.RecordStablePhase` reproduces,
 * re-shaped to the live StableView the decoder fills. `source:"demo"`.
 */
export function demoStable(req: StablePhaseRequest): StableView {
	const r = recordStablePhase(req);
	return {
		stable: r.stable,
		recorded: r.recorded,
		parentIds: [],
		reasons: r.reasons,
		blockCode: r.blockCode === "" ? undefined : r.blockCode,
		explanation: undefined,
		howToFix: r.howToFix,
	};
}
