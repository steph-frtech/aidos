"use server";

import {
	CODE_AGENT_CROSS_PROJECT_WRITE,
	classify,
	type Decision,
} from "@/lib/projectWall";

/**
 * /project-wall Server Actions (S55). Every action is a PURE, DETERMINISTIC
 * projection over lib/projectWall (the TS twin of back/runtime/projectwall) — no DB,
 * no clock, no LLM (determinism-first, CLAUDE.md §6/§8). The classifier is an
 * ALGORITHM, not a prompt. THE WALL (§2): nothing here writes truth — it only judges
 * project scope. The live MCP/gateway path arrives at S58; until then the verdict is
 * computed from the authoritative twin, byte-identical to the Go authority.
 */

export interface ClassifyView {
	source: "live" | "demo";
	verdict: "allow" | "deny";
	code?: string;
	severity?: string;
	explanation?: string;
	howToFix?: string[];
}

/**
 * classifyAction is the action-capable control behind the panel's "classify"
 * button: given (identity, active project) × (target project, claimed identity) it
 * EXECUTES projectwall.Classify and returns the verdict + (on deny) the actionable
 * BlockReason (AGENT_CROSS_PROJECT_WRITE). The same predicate the Postgres RLS
 * enforces — the two layers refuse the same op, independently.
 */
export async function classifyAction(
	identity: string,
	activeProject: string,
	targetProject: string,
	claimedIdentity: string,
): Promise<ClassifyView> {
	const d: Decision = classify(
		{ identity, activeProject },
		{ projectId: targetProject, claimedIdentity },
	);
	if (d.verdict === "deny" && d.blockReason) {
		return {
			source: "demo",
			verdict: "deny",
			code: d.blockReason.code,
			severity: d.blockReason.severity,
			explanation: d.blockReason.explanation,
			howToFix: d.blockReason.howToFix,
		};
	}
	return { source: "demo", verdict: "allow" };
}

/** blockCode returns the stable code this wall emits (for the panel legend). */
export async function blockCode(): Promise<string> {
	return CODE_AGENT_CROSS_PROJECT_WRITE;
}
