/**
 * lib/besoin-cascade.ts — the TYPESCRIPT TWIN of EL08 (back/runtime/besoin/cascade.go). The anchor
 * CASCADE + the MEASURED constraint inheritance (the compound PROVEN), all PURE/TOTAL/DETERMINISTIC:
 *
 *   - anchorsAbove(nodes, level) → the frozen (resolved) SOURCE rungs strictly ABOVE level, in descent
 *     order: the single readable grounding the rung below reads (the compound P1).
 *   - descend(nodes, fromLevel, metaComplete) → opens fromLevel+1 ONLY when canDescend(fromLevel).enough;
 *     a premature descent is REFUSED with CANNOT_DESCEND_LEVEL_NOT_RIGHTSIZED (never an opinion).
 *   - shrinkOptionSpaceCascade(nodes, level) → |OptionSpace(level→next)| BEFORE anchors (the full
 *     declared closed set) vs AFTER the frozen anchor prunes it. Under a FROZEN anchor the count is
 *     STRICTLY smaller; with no frozen anchor it is NOT narrowed (Shrink 0 — compounding failed).
 *   - reopenAnchor(node, changeSet) → reopening a FROZEN anchor without a ChangeSet is refused
 *     (BESOIN_ANCHOR_OVERWRITE, anti-overwrite §9); with one it is a recorded decision, append-only.
 *
 * It REUSES the grammar + thresholds + candescend twins (the single source) — byte-equivalent to the
 * Go authority. Writes NO truth (the wall, §2).
 */

import {
	type BlockReason,
	canDescend,
	type NodeInput,
} from "./besoin-candescend";
import {
	isSourceRung,
	type Level,
	levels,
	nextLevel,
	prevLevel,
} from "./besoin-grammar";
import { optionSpaceFor } from "./besoin-thresholds";

// NodeStatus mirrors the Go closed set (empty|drafting|resolved). A node is FROZEN iff resolved.
export type NodeStatus = "empty" | "drafting" | "resolved";

// CascadeNode is a graph node as the cascade reads it: its level, body (for `selects`), status, and
// the resolved outgoing refs. The screen passes the node set; the twin never re-implements the graph.
export interface CascadeNode {
	level: Level;
	body: Record<string, unknown>;
	status: NodeStatus;
	refsTo: Level[];
}

export interface Anchor {
	level: Level;
	body: Record<string, unknown>;
}

// sourceIndex returns the descent index of a SOURCE rung, or -1 for a band / non-grammar level.
function sourceIndex(level: Level): number {
	return levels().indexOf(level);
}

// anchorsAbove returns the frozen (resolved) SOURCE rungs strictly above `level`, in descent order.
// A band / non-grammar level is off the descent path → no anchors. Pure, total.
export function anchorsAbove(nodes: CascadeNode[], level: Level): Anchor[] {
	const idx = sourceIndex(level);
	if (idx < 0) return [];
	const out: Anchor[] = [];
	for (const l of levels()) {
		if (sourceIndex(l) >= idx) break; // strictly above.
		const n = nodes.find((x) => x.level === l);
		if (n?.status !== "resolved") continue; // only FROZEN rungs.
		out.push({ level: l, body: n.body });
	}
	return out;
}

// isAnchored reports whether the rung immediately above `level` is a frozen anchor. Pure.
export function isAnchored(nodes: CascadeNode[], level: Level): boolean {
	const prev = prevLevel(level);
	if (!prev) return false;
	const n = nodes.find((x) => x.level === prev);
	return !!n && n.status === "resolved";
}

// CascadeBlockCode widens the besoin-local codes with the EL08 cascade codes (descent / overwrite).
export type CascadeBlockCode =
	| BlockReason["code"]
	| "CANNOT_DESCEND_LEVEL_NOT_RIGHTSIZED"
	| "BESOIN_ANCHOR_OVERWRITE";

export interface CascadeBlockReason {
	code: CascadeBlockCode;
	severity: "blocking";
	explanation: string;
	howToFix: string[];
}

// DescendRefusal carries the gate's BlockReasons + the cascade CANNOT_DESCEND code on a refused descent.
export interface DescendRefusal {
	enough: false;
	missing: string[];
	openQuestions: string[];
	blockReasons: CascadeBlockReason[];
}

export interface DescendResult {
	ok: boolean;
	opened: Level | null;
	refusal: DescendRefusal | null;
}

const CANNOT_DESCEND = "CANNOT_DESCEND_LEVEL_NOT_RIGHTSIZED" as const;

// descend opens the rung below `fromLevel` — ONLY when canDescend(fromLevel).enough. A premature
// descent is refused, the refusal verdict carrying the gate's BlockReasons + the CANNOT_DESCEND code.
// Pure (does not mutate; the screen applies the open). metaComplete is the EL04 verdict (gate b).
export function descend(
	nodes: CascadeNode[],
	fromLevel: Level,
	metaComplete: boolean,
): DescendResult {
	const node = nodes.find((x) => x.level === fromLevel);
	const input: NodeInput = node
		? {
				level: fromLevel,
				body: node.body,
				refsTo: node.refsTo,
				present: true,
			}
		: { level: fromLevel, body: {}, refsTo: [], present: false };
	const v = canDescend(input, fromLevel, metaComplete);
	if (!v.enough) {
		const refusal: DescendRefusal = {
			enough: false,
			missing: v.missing,
			openQuestions: v.openQuestions,
			blockReasons: [
				...v.blockReasons,
				{
					code: CANNOT_DESCEND,
					severity: "blocking",
					explanation: `Descente refusée : le niveau ${fromLevel} n'est pas right-sized (¬CanDescend.enough) — on ne descend pas avant d'avoir assez déclaré.`,
					howToFix: ["right_size_current_level"],
				},
			],
		};
		return { ok: false, opened: null, refusal };
	}
	const next = nextLevel(fromLevel);
	return { ok: true, opened: next, refusal: null };
}

export interface CascadeShrink {
	level: Level;
	next: Level | null;
	enumerable: boolean;
	before: number;
	after: number;
	shrink: number;
	openQuestion: string;
}

const CASCADE_SENTINEL = 1;

// shrinkOptionSpaceCascade measures the COMPOUND: |OptionSpace(level→next)| BEFORE anchors vs AFTER the
// FROZEN anchor at `level` prunes it via its `selects`. Strictly smaller under a frozen anchor; 0 with
// no frozen anchor; positive sentinel for a non-enumerable pair / leaf. Pure, deterministic.
export function shrinkOptionSpaceCascade(
	nodes: CascadeNode[],
	level: Level,
): CascadeShrink {
	const cs: CascadeShrink = {
		level,
		next: null,
		enumerable: false,
		before: -1,
		after: -1,
		shrink: CASCADE_SENTINEL,
		openQuestion: "",
	};
	if (!isSourceRung(level)) {
		cs.openQuestion = `${level} is off the descent path: no lower OptionSpace.`;
		return cs;
	}
	const next = nextLevel(level);
	if (!next) {
		cs.openQuestion =
			"entity is the leaf rung: no lower OptionSpace to narrow (cascade vacuously satisfied).";
		return cs;
	}
	cs.next = next;
	const os = optionSpaceFor(level, next);
	if (!os?.enumerable) {
		cs.openQuestion =
			os?.openQuestion ??
			`no declared OptionSpace for ${level}→${next} (not a consecutive descent pair).`;
		return cs;
	}
	cs.enumerable = true;
	cs.before = os.choices.length;
	const node = nodes.find((x) => x.level === level);
	if (node?.status !== "resolved") {
		cs.after = cs.before;
		cs.shrink = 0;
		return cs;
	}
	const selected = stringSet(node.body.selects);
	const full = new Set(os.choices);
	let kept = 0;
	for (const c of selected) if (full.has(c)) kept++;
	if (kept === 0) {
		cs.after = cs.before;
		cs.shrink = 0;
		return cs;
	}
	cs.after = kept;
	cs.shrink = Math.max(0, cs.before - cs.after);
	return cs;
}

export interface ReopenResult {
	ok: boolean;
	code: "BESOIN_ANCHOR_OVERWRITE" | "BESOIN_NODE_ABSENT" | null;
	explanation: string;
	// reopened, on success, is the node set back to drafting with the prior body preserved + the
	// reopen recorded (append-only §9).
	reopened: CascadeNode | null;
}

// reopenAnchor reopens a FROZEN (resolved) anchor for re-elicitation. Anti-overwrite (§9): a frozen
// anchor + no ChangeSet = a silent overwrite → refused (BESOIN_ANCHOR_OVERWRITE). With a ChangeSet it
// is a recorded decision; the prior body is preserved (append-only). An unfrozen node needs no
// ChangeSet. Pure, total.
export function reopenAnchor(
	node: CascadeNode | undefined,
	changeSet: string,
): ReopenResult {
	if (!node) {
		return {
			ok: false,
			code: "BESOIN_NODE_ABSENT",
			explanation: "Aucun nœud à rouvrir.",
			reopened: null,
		};
	}
	if (node.status !== "resolved") {
		return { ok: true, code: null, explanation: "", reopened: node };
	}
	if (changeSet.trim() === "") {
		return {
			ok: false,
			code: "BESOIN_ANCHOR_OVERWRITE",
			explanation: `Réécriture silencieuse de l'ancre figée ${node.level} interdite : rouvrir une ancre résolue est une DÉCISION enregistrée (ChangeSet), jamais une édition (anti-overwrite §9).`,
			reopened: null,
		};
	}
	return {
		ok: true,
		code: null,
		explanation: "",
		reopened: { ...node, body: node.body, status: "drafting" },
	};
}

function stringSet(v: unknown): Set<string> {
	const out = new Set<string>();
	if (!Array.isArray(v)) return out;
	for (const e of v) if (typeof e === "string" && e.trim() !== "") out.add(e);
	return out;
}
