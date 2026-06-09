/**
 * The WhyTree projection — the Workbench /why-tree source (AIDOS step FK13).
 *
 * FKE-35.1 / ROADMAP FK13: `/why` builds a WhyTree — the 5-whys REDRESSED — from a RED symptom.
 * It walks `caused_by` UPWARD (FK12, reused verbatim via ./caused-by), admits ONLY reproduced
 * causes (anti-confabulation), and terminates OBLIGATORILY in an anti-recurrence mirror
 * (root → /learn → mirror). A WhyTree without a terminal mirror is refused (WHYTREE_NO_MIRROR);
 * a non-reproduced cause is refused (WHYTREE_CAUSE_NOT_REPRODUCED); a caused_by cycle is refused.
 *
 * This module is the DECLARED projection of the Go package back/kernel/whytree — the same upward
 * walk, the same reproduction gate, the same obligatory-mirror refusal, the same root computation
 * — so the /why-tree panel builds exactly as the Go Build computes. One source, no drift.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock, no rng, no I/O,
 * NO LLM — so the same (symptom, edges, reproductions) always yields the same WhyTree (or the same
 * refusal). The judge is the reproduction bool, never a prompt. The reproducibility mirror
 * lib/why-tree.test.ts (fast-check) pins determinism, the reproduction gate, the no-mirror refusal,
 * and the root computation.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): /why-tree BUILDS the tree; it never writes
 * truth. Freezing the terminal mirror goes via propose → /learn → /goal → approval, never from
 * this screen.
 */

import { type Edge, type Ref, trace } from "./caused-by";

export type { Edge, Ref };
export { trace };

/** The why_tree link-kind discriminator (mirrors whytree's "why_tree" body kind). */
export const WHY_TREE_KIND = "why_tree" as const;

/** The closed origin of a symptom (mirrors whytree.ProvenanceKind). */
export type Provenance = "incident" | "mirror" | "human";

/** isKnownProvenance reports whether p is one of the closed provenance kinds. */
export function isKnownProvenance(p: string): p is Provenance {
	return p === "incident" || p === "mirror" || p === "human";
}

/**
 * A reproduction verdict — the anti-confabulation gate (mirrors whytree.Reproduction). A cause
 * with reproduced=false (or no entry) is REJECTED from the tree.
 */
export interface Reproduction {
	causeId: string;
	reproduced: boolean;
	detail?: string;
}

/** The obligatory anti-recurrence terminal mirror (mirrors whytree.TerminalMirror). */
export interface TerminalMirror {
	mirrorId: string;
	reflectsRootCause: string;
}

/** One reproduced candidate cause in the tree (mirrors whytree.CauseNode). */
export interface CauseNode {
	causeId: string;
	depth: number;
	reproduced: boolean;
}

/** The built WhyTree (mirrors whytree.WhyTree). */
export interface WhyTree {
	symptom: string;
	provenance: Provenance;
	causes: CauseNode[];
	rootCause: string;
	terminal: TerminalMirror;
}

/** The pure input to build (mirrors whytree.Input). */
export interface BuildInput {
	symptom: string;
	provenance: string;
	edges: readonly Edge[];
	reproductions: readonly Reproduction[];
	terminal: TerminalMirror;
}

/** The closed set of Build refusal codes (mirrors the whytree.Err* sentinels + the MCP classify). */
export type BuildError =
	| "UNKNOWN_PROVENANCE"
	| "CAUSED_BY_CYCLE"
	| "WHYTREE_CAUSE_NOT_REPRODUCED"
	| "WHYTREE_NO_MIRROR"
	| "WHYTREE_TERMINAL_MISMATCH";

/** Build's result: either a WhyTree or one of the closed refusal codes (a discriminated union). */
export type BuildResult =
	| { ok: true; tree: WhyTree }
	| { ok: false; error: BuildError; cause?: string };

/**
 * build is the PURE deterministic constructor of a WhyTree (mirrors whytree.Build):
 *   1. validate the provenance (closed set) — else UNKNOWN_PROVENANCE;
 *   2. walk caused_by UPWARD via trace (deterministic, cycle-refusing) — a cycle ⇒ CAUSED_BY_CYCLE;
 *   3. each candidate cause requires a POSITIVE reproduction — else WHYTREE_CAUSE_NOT_REPRODUCED;
 *   4. the root = the deepest reproduced cause (a leaf symptom is its own root);
 *   5. a terminal mirror is OBLIGATORY (non-empty id) reflecting the root — else WHYTREE_NO_MIRROR
 *      / WHYTREE_TERMINAL_MISMATCH.
 * Total, never throws.
 */
export function build(input: BuildInput): BuildResult {
	if (!isKnownProvenance(input.provenance)) {
		return { ok: false, error: "UNKNOWN_PROVENANCE" };
	}

	const traced = trace(input.symptom, input.edges);
	if (!traced.ok) {
		return { ok: false, error: "CAUSED_BY_CYCLE" };
	}

	const repro = new Map<string, Reproduction>();
	for (const r of input.reproductions) repro.set(r.causeId, r);

	const depth = traceDepths(input.symptom, input.edges);
	const causes: CauseNode[] = [];
	for (const id of traced.chain.causes) {
		const r = repro.get(id);
		if (r === undefined || !r.reproduced) {
			return { ok: false, error: "WHYTREE_CAUSE_NOT_REPRODUCED", cause: id };
		}
		causes.push({ causeId: id, depth: depth.get(id) ?? 0, reproduced: true });
	}

	let root = input.symptom;
	if (causes.length > 0) root = deepest(causes);

	if (input.terminal.mirrorId === "") {
		return { ok: false, error: "WHYTREE_NO_MIRROR" };
	}
	if (input.terminal.reflectsRootCause !== root) {
		return { ok: false, error: "WHYTREE_TERMINAL_MISMATCH", cause: root };
	}

	return {
		ok: true,
		tree: {
			symptom: input.symptom,
			provenance: input.provenance,
			causes,
			rootCause: root,
			terminal: input.terminal,
		},
	};
}

/** deepest returns the deepest cause id (ties by id desc), mirroring whytree.deepest. */
function deepest(causes: readonly CauseNode[]): string {
	let best = causes[0];
	for (const c of causes.slice(1)) {
		if (
			c.depth > best.depth ||
			(c.depth === best.depth && c.causeId > best.causeId)
		)
			best = c;
	}
	return best.causeId;
}

/** traceDepths recomputes the BFS hop distance of each reachable cause (mirrors whytree.traceDepths). */
function traceDepths(
	symptom: string,
	edges: readonly Edge[],
): Map<string, number> {
	const adj = new Map<string, string[]>();
	for (const e of edges) {
		if (
			e.from.id === "" ||
			e.from.version === "" ||
			e.to.id === "" ||
			e.to.version === "" ||
			e.from.id === e.to.id
		) {
			continue;
		}
		const arr = adj.get(e.from.id);
		if (arr === undefined) adj.set(e.from.id, [e.to.id]);
		else arr.push(e.to.id);
	}
	const dist = new Map<string, number>([[symptom, 0]]);
	let frontier = [symptom];
	while (frontier.length > 0) {
		const next: string[] = [];
		for (const node of frontier) {
			for (const c of adj.get(node) ?? []) {
				if (dist.has(c)) continue;
				dist.set(c, (dist.get(node) ?? 0) + 1);
				next.push(c);
			}
		}
		frontier = next;
	}
	dist.delete(symptom);
	return dist;
}

/**
 * serializeBody renders the canonical kernel.link body of a WhyTree — the same shape the Go
 * SerializeBody produces (causes sorted nearest-first so the address is order-independent). The
 * /why-tree panel shows this to make the content-addressing concrete. Mirrors whytree.SerializeBody.
 */
export function serializeBody(t: WhyTree): string {
	const causes = [...t.causes].sort((a, b) =>
		a.depth !== b.depth
			? a.depth - b.depth
			: a.causeId < b.causeId
				? -1
				: a.causeId > b.causeId
					? 1
					: 0,
	);
	return JSON.stringify({
		kind: "link",
		link_kind: WHY_TREE_KIND,
		symptom: t.symptom,
		provenance: t.provenance,
		causes,
		root_cause: t.rootCause,
		terminal_mirror: t.terminal,
	});
}
