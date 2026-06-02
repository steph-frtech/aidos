/**
 * Agent run — the PURE projection of back/runtime/agentrun (AIDOS step S52). A run is a
 * RUNTIME EVENT below the waterline, NOT a layer/truth: it carries NO version and NO
 * mirror field (the type makes that unrepresentable). Determinism-first: `applyWall`
 * stamps the wall verdict via lib/agentlayer.mayWrite (the S04 predicate). No I/O.
 */

import { type AgentSpec, type BlockReason, mayWrite } from "./agentlayer";

/** The closed run-result enum. */
export const RESULTS = ["green", "still_red", "blocked", "abandoned"] as const;
export type Result = (typeof RESULTS)[number];

/** The closed action-type enum. */
export const ACTION_TYPES = ["read", "write", "propose", "run_mirror"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/** One attempted action inside a run. autorisee = the wall verdict. */
export interface AgentAction {
	type: ActionType;
	cible: string;
	autorisee: boolean;
	raisonBlocage?: BlockReason;
}

/**
 * AgentRun — one execution of a CoucheAgent. NO `version`, NO `mirror` field: a run is
 * not a layer. (The type itself is the structural invariant the Go property test pins.)
 */
export interface AgentRun {
	id: string;
	agent: string;
	goal: string;
	redWorkItem: string;
	contextPack: string;
	actions: AgentAction[];
	result: Result;
	startedAt: string;
	endedAt: string;
}

/**
 * applyWall — stamps an action with the wall verdict. A write above the waterline lands
 * autorisee=false with AGENT_WRITE_ABOVE_WATERLINE; reads/proposes/run_mirror and
 * below-the-line writes are authorised. Pure, total, deterministic.
 */
export function applyWall(
	action: Pick<AgentAction, "type" | "cible">,
	spec: AgentSpec,
): AgentAction {
	if (action.type !== "write") {
		return { ...action, autorisee: true };
	}
	const dec = mayWrite(spec, action.cible);
	return { ...action, autorisee: dec.allowed, raisonBlocage: dec.blockReason };
}
