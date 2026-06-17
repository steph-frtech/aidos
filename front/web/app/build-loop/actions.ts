"use server";

import type { Decision, Iteration } from "@/lib/build-loop";
import {
	demoTerminate,
	gatewayTerminateArgs,
	type TerminationForm,
} from "@/lib/build-loop-data";
import { readVia, type Source } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { decisionDecoder } from "./live";

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
 * ADR 0092 batch-2 CUTOVER (the Go engine is the SINGLE live source). `evaluateTerminationAction`
 * now reads the LIVE termination Decision from the Go build-loop MCP server through the passerelle
 * (`readVia(scope, "buildloop_terminate", …)`, the dispatched below-the-line read), with the twin
 * `lib/build-loop.terminate()` (via `demoTerminate`) preserved ONLY as the deterministic demo
 * fallback (`source:"live"|"demo"`). The `readVia` frontier import keeps the T5 cliquet GREEN (the
 * twin sits behind the demo fallback, never as the live source).
 *
 * THE ACTION-CAPABLE OP (ui-completeness, CLAUDE.md §7): the op this screen develops is the
 * TERMINATION DECISION — given a red set, the live sensor verdicts, the iteration history and the
 * declared budget, COMPUTE whether the loop terminates green, halts (no_progress), or continues.
 * It is a PURE FUNCTION OF THE HISTORY (the Go buildloop.Terminate authority; the twin
 * lib/build-loop.terminate is byte-identical, demo-only) — never an LLM judgment. The control on
 * the screen is bound to it and executes it; the Playwright e2e proves it.
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
	/** Whether the Decision came from the live gateway or the demo fallback. */
	source?: Source;
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
 * parseForm reads the console form into the typed TerminationForm — the SINGLE parse both the live
 * gateway-arg projection (gatewayTerminateArgs) and the demo Decision (demoTerminate) consume.
 * Deterministic: same FormData → same form.
 */
function parseForm(formData: FormData): TerminationForm {
	return {
		redSet: parseList(String(formData.get("redSet") ?? "")),
		greenSensors: parseList(String(formData.get("greenSensors") ?? "")),
		priorBroken: String(formData.get("priorBroken") ?? "") === "on",
		mutation: Number(formData.get("mutation") ?? "0") || 0,
		mutationFloor: Number(formData.get("mutationFloor") ?? "0") || 0,
		monsters: parseList(String(formData.get("monsters") ?? "")),
		history: parseHistory(String(formData.get("history") ?? "")),
		maxIterations: Number(formData.get("maxIterations") ?? "0") || 0,
		stagnationWindow: Number(formData.get("stagnationWindow") ?? "0") || 0,
		maxLlmTokens: Number(formData.get("maxLlmTokens") ?? "0") || 0,
		spentLlmTokens: Number(formData.get("spentLlmTokens") ?? "0") || 0,
		valueCaseJustified:
			String(formData.get("valueCaseJustified") ?? "") === "on",
	};
}

/**
 * evaluateTerminationAction is the action-capable control behind the build-loop console
 * (CLAUDE.md §7 ui-completeness): the human supplies the red set, the green sensor verdicts, the
 * non-gameable Stop conditions (prior-green / mutation / floor / monsters), the iteration history
 * and the declared budget, then submits — the action COMPUTES the termination decision
 * DETERMINISTICALLY (the Go engine is the authority via the passerelle, the twin is the demo
 * fallback) and returns it (green | no_progress | continue), with the BUILD_LOOP_NO_PROGRESS block
 * code + over-budget axes when the breaker tripped. No LLM enters; the judge is the mirror verdict
 * + the pure detector.
 */
export async function evaluateTerminationAction(
	_prev: EvaluateResult,
	formData: FormData,
): Promise<EvaluateResult> {
	const form = parseForm(formData);
	if (form.redSet.length === 0) return { ok: false, messageKey: "redSetEmpty" };

	const scope = await panelScope();
	// LIVE read through the passerelle (the dispatched build-loop `buildloop_terminate` tool); the
	// twin demoTerminate() is the deterministic fallback (source:"live"|"demo") — ADR 0092.
	const { data: decision, source } = await readVia(
		scope,
		"buildloop_terminate",
		gatewayTerminateArgs(form),
		decisionDecoder,
		demoTerminate(form),
	);

	return { ok: true, decision, iterations: form.history.length, source };
}
