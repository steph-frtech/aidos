"use server";

import type {
	ConsoleInput,
	StablePhaseRequest,
	WriteAction,
} from "@/lib/build-console";
import {
	demoProject,
	demoStable,
	gatewayProjectArgs,
	gatewayStableArgs,
} from "@/lib/build-console-data";
import { readVia, type Source } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import {
	type ProjectView,
	projectDecoder,
	type StableView,
	stableDecoder,
} from "./live";

/**
 * Server Actions for the /build-console Workbench panel (S86 — the live build console +
 * per-project stable-phase recording).
 *
 * THE STEP (ROADMAP S86): the live console of the app-builder — the diff streamed per attempt,
 * the sensor results, the HarnessCostBudget consumption (S51), the circuit-breaker (S83) state,
 * the AgentRun timeline (S52), and the human approval gate (S85) — PLUS `aidos stable`'s
 * per-project DAG-node recording at the S23/S40 verdict.
 *
 * KILL-TWINS CUTOVER (ADR 0092 — the Go engine is the SINGLE live source). Both ops now read the
 * LIVE result from the Go build-console MCP server through the passerelle:
 *   - `projectBuildStateAction` → `readVia(scope, "buildconsole_project", …)`;
 *   - `recordStablePhaseAction` → `readVia(scope, "buildconsole_record_stable_phase", …)`.
 * The twin `lib/build-console` is preserved ONLY as the deterministic demo fallback
 * (`demoProject` / `demoStable`, `source:"live"|"demo"`). The `readVia` frontier import keeps the
 * T5 cliquet GREEN (the twin sits behind the demo fallback, never as the live source).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the decoders + the demo fallbacks (the same pure twin
 * compute the Go engine reproduces) are pure; a malformed / undispatched / refused answer yields
 * the demo view. THE WALL (§2): both ops are READ/COMPUTE below the line — they write NOTHING. The
 * console projects records that already exist; recording a DAG node rides the privileged `aidos`
 * writer (these actions return the node VALUE). No LLM enters the dispatch.
 */

export interface ProjectResult {
	ok: boolean;
	messageKey?: string;
	view?: ProjectView;
	source?: Source;
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
 * reads the LIVE projected console state from the Go engine via the passerelle (the demo twin is
 * the deterministic fallback), ASSERTING it equals the recorded run (faithfulProjection). No LLM.
 */
export async function projectBuildStateAction(
	_prev: ProjectResult,
	formData: FormData,
): Promise<ProjectResult> {
	const runId = String(formData.get("runId") ?? "").trim();
	if (runId === "") return { ok: false, messageKey: "runIdEmpty" };
	const goal = String(formData.get("goal") ?? "").trim();
	const result = (String(formData.get("result") ?? "green").trim() ||
		"green") as ConsoleInput["result"];

	const writes = parseWrites(String(formData.get("writes") ?? ""));
	const diffHashes = parseList(String(formData.get("diffHashes") ?? ""));
	const greenMirrors = parseList(String(formData.get("greenMirrors") ?? ""));
	const verdict = (String(formData.get("verdict") ?? "continue").trim() ||
		"continue") as ConsoleInput["verdict"];

	const ciMinutesSpent = Number(formData.get("ciMinutesSpent") ?? "0") || 0;
	const ciMinutesCap = Number(formData.get("ciMinutesCap") ?? "0") || 0;
	const llmTokensSpent = Number(formData.get("llmTokensSpent") ?? "0") || 0;
	const llmTokensCap = Number(formData.get("llmTokensCap") ?? "0") || 0;
	const overBudgetAxes = parseList(
		String(formData.get("overBudgetAxes") ?? ""),
	);
	const pending = parseList(String(formData.get("pending") ?? ""));

	const input: ConsoleInput = {
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
	};

	const scope = await panelScope();
	// LIVE read through the passerelle (the dispatched buildconsole_project tool); demoProject() is
	// the deterministic fallback (source:"live"|"demo") — ADR 0092.
	const { data, source } = await readVia(
		scope,
		"buildconsole_project",
		gatewayProjectArgs(input),
		projectDecoder,
		demoProject(input),
	);
	return { ok: true, view: data, source };
}

export interface StableResult {
	ok: boolean;
	messageKey?: string;
	view?: StableView;
	source?: Source;
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
 * §43 cut (heads / links / sensors), then submits — the action reads the LIVE §43 verdict from the
 * Go engine via the passerelle (the demo twin is the deterministic fallback) and records the
 * per-project DAG node ONLY when stable; an inconsistent cut is refused with
 * STABLE_PHASE_INCONSISTENT_CUT (no node from a red mirror). It writes NOTHING (the wall): the
 * privileged `aidos` writer commits the node. No LLM enters the dispatch.
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

	const req: StablePhaseRequest = {
		projectId,
		cut,
		heads,
		links,
		sensors,
		label,
	};

	const scope = await panelScope();
	// LIVE read through the passerelle (the dispatched buildconsole_record_stable_phase tool);
	// demoStable() is the deterministic fallback (source:"live"|"demo") — ADR 0092.
	const { data, source } = await readVia(
		scope,
		"buildconsole_record_stable_phase",
		gatewayStableArgs(req),
		stableDecoder,
		demoStable(req),
	);
	return { ok: true, view: data, source };
}
