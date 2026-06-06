/**
 * lib/emit-ideas.ts — the TYPESCRIPT TWIN of the EL16 deterministic emitter EmitIdeas(graph) → []Idea
 * (back/runtime/besoin/emit_ideas.go), GOVERNED by the closed table LevelToProposes (EL05). The Go
 * function is the AUTHORITY; this twin lets the /emit-ideas Workbench panel project a graph into the
 * backlog of draft Ideas BYTE-IDENTICALLY, action-capable from the screen, without a backend round-trip.
 *
 * THE RULE (ROADMAP EL16, never a silent cast): for each RESOLVED node whose rung MAPS
 * (levelToProposes(level).kind === "emit"), emit exactly one draft Idea {proposes =
 * levelToProposes(level).proposes, intent = the verbatim utterance, provenance = {source:"human",
 * detail: utterance}, status:"draft"}. NoEmit rungs (journey/view/invariant) emit NOTHING; a
 * non-resolved node (empty/drafting) emits nothing. The mapping is the pure table, never an LLM cast.
 *
 * THE WALL (CLAUDE.md §2): an emitted Idea is a candidate-truth — it carries NO version and NO mirror
 * (HasMirror always false). EmitIdeas writes no kernel and no mirror; promotion is the app-builder
 * writing the mirror via /goal (hand-off S64). DETERMINISM-FIRST: same nodes → same ordered []Idea.
 */

import { type Level, levelToProposes } from "./besoin-proposes";

// EmitNodeStatus mirrors besoin.NodeStatus — the closed need-lifecycle of a LevelNode.
export type EmitNodeStatus = "empty" | "drafting" | "resolved";

// EmitNode is the minimal node shape the emitter reads: its grammar level, its lifecycle status, and
// the verbatim human utterance (the intent + provenance the emitted Idea carries).
export interface EmitNode {
	level: Level;
	status: EmitNodeStatus;
	utterance: string;
}

// EmittedIdea is the draft Idea a resolved MAPPING rung projects. It carries NO version and NO mirror
// by construction (the wall). status is always "draft" (the only legal first state).
export interface EmittedIdea {
	proposes: string;
	intent: string;
	provenance: { source: "human"; detail: string };
	status: "draft";
	fromLevel: Level;
}

// The canonical descent order (sourceOrder then the transversal bands) — the topological backlog order
// the Idea list is emitted in (so S64 opens the goals top-down). Declared, never invented.
const EMIT_ORDER: Level[] = [
	"product",
	"journey",
	"view",
	"control",
	"action",
	"operation",
	"entity",
	"invariant",
	"policy",
];

/**
 * emitIdeas projects a set of need nodes into the ordered backlog of draft Ideas, GOVERNED by the
 * closed table levelToProposes (EL05). One draft Idea per RESOLVED MAPPING rung, in descent order;
 * NoEmit rungs and non-resolved nodes contribute nothing. Pure total: same nodes → same ordered list.
 */
export function emitIdeas(nodes: EmitNode[]): EmittedIdea[] {
	const byLevel = new Map<Level, EmitNode>();
	for (const n of nodes) byLevel.set(n.level, n);

	const out: EmittedIdea[] = [];
	for (const level of EMIT_ORDER) {
		const node = byLevel.get(level);
		if (!node) continue;
		if (node.status !== "resolved") continue; // only a right-sized rung projects (EL07).
		const m = levelToProposes(level);
		if (m.kind !== "emit" || !m.proposes) continue; // NoEmit — constraint lives in anchors_above.
		out.push({
			proposes: m.proposes,
			intent: node.utterance, // the verbatim utterance (matches the Go projectNode).
			provenance: { source: "human", detail: node.utterance },
			status: "draft",
			fromLevel: level,
		});
	}
	return out;
}

/**
 * emitCount returns how many Ideas the nodes WOULD emit (the backlog depth) — EXCLUDES NoEmit rungs and
 * non-resolved nodes. The count authority the panel renders (never re-derived). Pure total.
 */
export function emitCount(nodes: EmitNode[]): number {
	return emitIdeas(nodes).length;
}
