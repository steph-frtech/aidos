"use server";

import {
	type BuildConsoleState,
	project,
	recordStablePhase,
	type StablePhaseResult,
	stateEqualsRun,
	type Verdict,
	type WriteAction,
} from "@/lib/build-console";

/**
 * Server Actions for the /build-console Workbench panel (S86 — the live build console +
 * per-project stable-phase recording).
 *
 * THE STEP (ROADMAP S86): the live console of the app-builder — the diff streamed per attempt,
 * the sensor results, the HarnessCostBudget consumption (S51), the circuit-breaker (S83) state,
 * the AgentRun timeline (S52), and the human approval gate (S85) — PLUS `aidos stable`'s
 * per-project DAG-node recording at the S23/S40 verdict.
 *
 * THE TWO ACTION-CAPABLE OPS (ui-completeness, CLAUDE.md §7):
 *   - PROJECT the build state — given a recorded AgentRun + the loop history + decision + cost +
 *     pending, COMPUTE the streamed console state and assert it EQUALS the recorded run (the
 *     console can never fabricate a turn or a green);
 *   - RECORD a stable phase — given a project's §43 cut, COMPUTE the verdict and record the
 *     per-project DAG node ONLY when stable; refuse an inconsistent cut
 *     (STABLE_PHASE_INCONSISTENT_CUT — no node from a red mirror).
 *
 * THE WALL (CLAUDE.md §2): both ops are READ/COMPUTE below the line — they write NOTHING. The
 * console projects records that already exist; recording a DAG node rides the privileged `aidos`
 * writer (this action returns the node VALUE). Determinism-first: the projection is a transform
 * and the stable verdict is phases.IsStable — no LLM enters; the pure twins are the authority.
 */

export interface ProjectResult {
	ok: boolean;
	messageKey?: string;
	state?: BuildConsoleState;
	/** the non-gameable faithfulness check: the projected state EQUALS the recorded run. */
	faithful?: boolean;
}

function parseList(raw: string): string[] {
	return raw
		.split("\n")
		.map((s) => s.trim())
		.filter((s) => s !== "");
}

/**
 * parseWrites reads the writes textarea: one write per line, "diffHash | authorised"
 * (authorised = "ok"/"true"/"1"/"yes" ⇒ true; anything else ⇒ refused). Deterministic.
 */
function parseWrites(raw: string): WriteAction[] {
	return parseList(raw).map((line) => {
		const [diffPart, authPart = ""] = line.split("|");
		const a = authPart.trim().toLowerCase();
		return {
			diffHash: diffPart.trim(),
			authorised: a === "ok" || a === "true" || a === "1" || a === "yes",
		};
	});
}

/**
 * projectBuildStateAction is the action-capable control behind the build console: the human
 * supplies the recorded run (id / goal / result / writes), the per-turn diff hashes, the latest
 * greens, the loop verdict, the cost meter and the pending approvals, then submits — the action
 * PROJECTS the streamed console state DETERMINISTICALLY and returns it, ASSERTING it equals the
 * recorded run (faithful). No LLM enters.
 */
export async function projectBuildStateAction(
	_prev: ProjectResult,
	formData: FormData,
): Promise<ProjectResult> {
	const runId = String(formData.get("runId") ?? "").trim();
	if (runId === "") return { ok: false, messageKey: "runIdEmpty" };
	const goal = String(formData.get("goal") ?? "").trim();
	const result = (String(formData.get("result") ?? "green").trim() ||
		"green") as BuildConsoleState["result"];

	const writes = parseWrites(String(formData.get("writes") ?? ""));
	const diffHashes = parseList(String(formData.get("diffHashes") ?? ""));
	const greenMirrors = parseList(String(formData.get("greenMirrors") ?? ""));
	const verdict = (String(formData.get("verdict") ?? "continue").trim() ||
		"continue") as Verdict;

	const ciMinutesSpent = Number(formData.get("ciMinutesSpent") ?? "0") || 0;
	const ciMinutesCap = Number(formData.get("ciMinutesCap") ?? "0") || 0;
	const llmTokensSpent = Number(formData.get("llmTokensSpent") ?? "0") || 0;
	const llmTokensCap = Number(formData.get("llmTokensCap") ?? "0") || 0;
	const overBudgetAxes = parseList(
		String(formData.get("overBudgetAxes") ?? ""),
	);
	const pending = parseList(String(formData.get("pending") ?? ""));

	const state = project({
		runId,
		goal,
		result,
		writes,
		diffHashes,
		greenMirrors,
		verdict,
		ciMinutesSpent,
		ciMinutesCap,
		llmTokensSpent,
		llmTokensCap,
		overBudgetAxes,
		pending,
	});

	const faithful = stateEqualsRun(state, { id: runId, goal, result, writes });
	return { ok: true, state, faithful };
}

export interface StableResult {
	ok: boolean;
	messageKey?: string;
	result?: StablePhaseResult;
}

/**
 * parseSensors reads the sensors textarea: one sensor per line, "id | pass" (pass = "ok"/"true"/
 * "green"/"1" ⇒ true). Deterministic.
 */
function parseSensors(raw: string): { id: string; pass: boolean }[] {
	return parseList(raw).map((line) => {
		const [idPart, passPart = ""] = line.split("|");
		const p = passPart.trim().toLowerCase();
		return {
			id: idPart.trim(),
			pass: p === "ok" || p === "true" || p === "green" || p === "1",
		};
	});
}

/**
 * parseLinks reads the links textarea: one link per line, "fromId@fromV -> toId@toV".
 * Deterministic.
 */
function parseLinks(raw: string): {
	fromId: string;
	fromVersion: string;
	toId: string;
	toVersion: string;
}[] {
	return parseList(raw)
		.map((line) => {
			const [from, to] = line.split("->").map((s) => s.trim());
			if (!from || !to) return null;
			const [fromId, fromVersion = ""] = from.split("@");
			const [toId, toVersion = ""] = to.split("@");
			return {
				fromId: fromId.trim(),
				fromVersion: fromVersion.trim(),
				toId: toId.trim(),
				toVersion: toVersion.trim(),
			};
		})
		.filter((l): l is NonNullable<typeof l> => l !== null);
}

/**
 * parseHeads reads the heads textarea: one head per line, "id@version". Deterministic.
 */
function parseHeads(raw: string): Record<string, string> {
	const heads: Record<string, string> = {};
	for (const line of parseList(raw)) {
		const [id, version = ""] = line.split("@");
		heads[id.trim()] = version.trim();
	}
	return heads;
}

/**
 * recordStablePhaseAction is the second action-capable control: the human supplies a project's
 * §43 cut (heads / links / sensors), then submits — the action COMPUTES the coherent-cut verdict
 * and records the per-project DAG node ONLY when stable; an inconsistent cut is refused with
 * STABLE_PHASE_INCONSISTENT_CUT (no node from a red mirror). It writes NOTHING (the wall): the
 * privileged `aidos` writer commits the node. Deterministic twin; no LLM.
 */
export async function recordStablePhaseAction(
	_prev: StableResult,
	formData: FormData,
): Promise<StableResult> {
	const projectId = String(formData.get("projectId") ?? "").trim();
	if (projectId === "") return { ok: false, messageKey: "projectIdEmpty" };

	const heads = parseHeads(String(formData.get("heads") ?? ""));
	const links = parseLinks(String(formData.get("links") ?? ""));
	const sensors = parseSensors(String(formData.get("sensors") ?? ""));
	const label = String(formData.get("label") ?? "").trim() || "stable-phase";

	// the cut is the heads selection (one version per constraint).
	const cut: Record<string, string> = { ...heads };

	const result = recordStablePhase({
		projectId,
		cut,
		heads,
		links,
		sensors,
		label,
	});
	return { ok: true, result };
}
