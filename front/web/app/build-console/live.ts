import type {
	AttemptDiff,
	RunResult,
	SensorResult,
	Verdict,
} from "../../lib/build-console";
import { arr, type Decoder, isObject, num, str } from "../../lib/gateway-sdk";

/**
 * /build-console live reads — the PURE decoders over the Go build-console tools' outputs (S86
 * cutover, ADR 0092 kill-twins batch-2). Kept OUT of actions.ts (a Next "use server" module may
 * only export async functions) so the parity mirror (live.test.ts) imports the decoders directly.
 *
 * NEVER DOUBLE-TYPED (the S59 done-criterion): `projectDecoder` / `stableDecoder` are the SINGLE
 * runtime declarations of the two live shapes; `ProjectView` / `StableView` are the front types the
 * decoders fill. The parity mirror pins the decoders == the Go contracts
 * (buildconsolesrv.projectOutput / recordStableOutput — snake_case fields), NOT a second
 * implementation of the projection logic (the Go buildconsole.Project / RecordStablePhase is
 * authoritative). DETERMINISM-FIRST (§6/§8): same JSON → same verdict; a malformed payload returns
 * null and readVia falls back to the demo view.
 */

/** The live shape of `buildconsole_project` (the Go projectOutput, snake_case decoded). */
export interface ProjectView {
	runId: string;
	goal: string;
	result: RunResult;
	attempts: AttemptDiff[];
	sensors: SensorResult[];
	ciSpent: number;
	ciCap: number;
	tokensSpent: number;
	tokensCap: number;
	overBudgetAxes: string[];
	verdict: Verdict;
	breakerTripped: boolean;
	pendingCount: number;
	pendingIds: string[];
	/** the non-gameable faithfulness check: the projected state EQUALS the recorded run. */
	faithfulProjection: boolean;
}

/** The live shape of `buildconsole_record_stable_phase` (the Go recordStableOutput, decoded). */
export interface StableView {
	stable: boolean;
	recorded: boolean;
	nodeId?: string;
	parentIds: string[];
	reasons: string[];
	blockCode?: string;
	explanation?: string;
	howToFix: string[];
}

/** decode one attempt entry ({ index, diff_hash, authorised }). */
function decodeAttempt(raw: unknown): AttemptDiff | null {
	if (!isObject(raw)) return null;
	const index = num(raw.index);
	const diffHash = str(raw.diff_hash);
	if (index === null || diffHash === null) return null;
	return { index, diffHash, authorised: raw.authorised === true };
}

/** decode one sensor entry ({ id, green }). */
function decodeSensor(raw: unknown): SensorResult | null {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	if (id === null) return null;
	return { id, green: raw.green === true };
}

/**
 * projectDecoder decodes the Go `buildconsole_project` output (projectOutput). The required
 * identity + counts + the faithfulness flag must decode; the attempts/sensors/axes/pending witness
 * lists are advisory (an absent list — `omitempty` on the Go side — decodes to []). A missing
 * required field → null (→ demo fallback).
 */
export const projectDecoder: Decoder<ProjectView> = (raw) => {
	if (!isObject(raw)) return null;
	const runId = str(raw.run_id);
	const goal = str(raw.goal);
	const result = str(raw.result);
	const ciSpent = num(raw.ci_minutes_spent);
	const ciCap = num(raw.ci_minutes_cap);
	const tokensSpent = num(raw.llm_tokens_spent);
	const tokensCap = num(raw.llm_tokens_cap);
	const verdict = str(raw.verdict);
	if (
		runId === null ||
		goal === null ||
		result === null ||
		ciSpent === null ||
		ciCap === null ||
		tokensSpent === null ||
		tokensCap === null ||
		verdict === null
	) {
		return null;
	}
	const attempts = arr(decodeAttempt)(raw.attempts ?? []) ?? [];
	const sensors = arr(decodeSensor)(raw.sensors ?? []) ?? [];
	const overBudgetAxes = arr(str)(raw.over_budget_axes ?? []) ?? [];
	const pendingIds = arr(str)(raw.approval_pending_ids ?? []) ?? [];
	const pendingCount = num(raw.approval_pending_count) ?? pendingIds.length;
	return {
		runId,
		goal,
		result: result as RunResult,
		attempts,
		sensors,
		ciSpent,
		ciCap,
		tokensSpent,
		tokensCap,
		overBudgetAxes,
		verdict: verdict as Verdict,
		breakerTripped: raw.breaker_tripped === true,
		pendingCount,
		pendingIds,
		faithfulProjection: raw.faithful_projection === true,
	};
};

/**
 * stableDecoder decodes the Go `buildconsole_record_stable_phase` output (recordStableOutput). The
 * `stable` / `recorded` booleans are required; node_id / block_code / explanation are optional
 * (`omitempty`); the parent_ids / reasons / how_to_fix witness lists decode to [] when absent. A
 * non-object payload → null (→ demo fallback).
 */
export const stableDecoder: Decoder<StableView> = (raw) => {
	if (!isObject(raw)) return null;
	if (typeof raw.stable !== "boolean" || typeof raw.recorded !== "boolean") {
		return null;
	}
	const parentIds = arr(str)(raw.parent_ids ?? []) ?? [];
	const reasons = arr(str)(raw.reasons ?? []) ?? [];
	const howToFix = arr(str)(raw.how_to_fix ?? []) ?? [];
	const nodeId = str(raw.node_id);
	const blockCode = str(raw.block_code);
	const explanation = str(raw.explanation);
	return {
		stable: raw.stable,
		recorded: raw.recorded,
		nodeId: nodeId === null ? undefined : nodeId,
		parentIds,
		reasons,
		blockCode: blockCode === null || blockCode === "" ? undefined : blockCode,
		explanation:
			explanation === null || explanation === "" ? undefined : explanation,
		howToFix,
	};
};
