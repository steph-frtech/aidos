/**
 * lib/besoin-capitalisation.ts — the TYPESCRIPT TWIN of EL18 capitalisation
 * (back/runtime/besoin/capitalisation.go). The Go function is the AUTHORITY; this twin lets the
 * /compound-besoin-capitalisation Workbench panel compute the reusable anchor + the CE05 reuse
 * preview BYTE-EQUIVALENTLY, without a backend round-trip.
 *
 * THE RULE (ROADMAP EL18):
 *   - At a FULLY-RESOLVED BesoinGraph, capitalise the need: its reusable anchor (graph_hash +
 *     canonicalised (level, normalized-intent-hash) keys) + the candidate besoin-behaviour, STRICTLY
 *     via the wall (firewall.ViaIdea), NEVER ToKernel, NEVER fitness. wroteKernel ALWAYS false.
 *   - The capitalised idea's provenance reconstructs to the graph_hash (carried in the free-text
 *     memory provenance "besoin:<graph_hash>"); parseGraphHash recovers it.
 *   - Cross-app reuse is name-match on CANONICALISED keys: a SECOND similar need (differing only in
 *     casing/spacing/punctuation) replays ≥1 unit (ReplayCost); a dissimilar need fabricates NO
 *     reuse (the anti-false-positive frontier).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the anchor extraction, the key normalisation, and the reuse
 * routing are PURE functions — never an LLM re-judging the anchor. The reproducibility mirror
 * (besoin-capitalisation.test.ts) pins same-input → same-output.
 */

import { createHash } from "node:crypto";
import { type Level, levels } from "./besoin-grammar";
import { type BesoinGraph, hash as graphHash } from "./besoin-graph";
import { isNoEmit } from "./besoin-proposes";

// DECLARED token costs (above the line, never learned — mirror compound/reuse.go).
export const DERIVE_COST = 80;
export const REPLAY_COST = 20;

const GRAPH_HASH_TAG = "besoin:";

// AnchorUnit is one canonicalised reusable unit of a resolved need.
export interface AnchorUnit {
	level: Level;
	key: string;
	intent: string;
}

// BesoinAnchor is the reusable anchor of a resolved BesoinGraph.
export interface BesoinAnchor {
	graphHash: string;
	units: AnchorUnit[];
	branch: string;
}

// ReusePlan is the CE05 reuse preview of a second need routed against an anchor.
export interface ReusePlan {
	goal: string;
	sourceGoal: string;
	reusedProcedural: number;
	derivedFresh: number;
	effortBefore: number;
	effortAfter: number;
	savedTokens: number;
	reductionFrac: number;
	wroteKernel: false;
}

// normalizeIntent lowercases, collapses whitespace, and trims trailing punctuation — the explicit
// cross-app normalisation (byte-equivalent to normalizeIntent in capitalisation.go). Pure, total.
export function normalizeIntent(intent: string): string {
	let s = intent.trim().toLowerCase();
	s = s.split(/\s+/).filter(Boolean).join(" ");
	// Trim trailing sentence punctuation (declared set: . ! ? ; : , and space).
	s = s.replace(/[.!?;:, ]+$/u, "");
	return s;
}

// canonicalIntentKey builds the canonical reuse key `level::<sha256(level\x00normalized)>` —
// byte-equivalent to CanonicalIntentKey in Go (records.Hash([]byte(level + "\x00" + norm))). Pure.
export function canonicalIntentKey(level: Level, intent: string): string {
	const norm = normalizeIntent(intent);
	const h = createHash("sha256").update(`${level}\u0000${norm}`).digest("hex");
	return `${level}::${h}`;
}

// CapNode is the node shape the twin reads (level, status, the verbatim utterance).
export interface CapNode {
	level: Level;
	status: "empty" | "drafting" | "resolved";
	utterance: string;
}

// isFullyResolved reports whether EVERY present SOURCE rung is resolved AND ≥1 mapping rung exists —
// the EL18 "green" gate (only a fully-resolved need capitalises). Pure, total.
export function isFullyResolved(nodes: CapNode[]): boolean {
	const byLevel = new Map<string, CapNode>();
	for (const n of nodes) byLevel.set(n.level, n);
	let mapping = 0;
	for (const lvl of levels()) {
		const n = byLevel.get(lvl);
		if (!n) continue;
		if (n.status !== "resolved") return false;
		if (!isNoEmit(lvl)) mapping++;
	}
	return mapping > 0;
}

// anchor extracts the reusable BesoinAnchor from a resolved graph: one AnchorUnit per RESOLVED
// MAPPING SOURCE rung (NoEmit rungs seed anchors but carry no replayable idea-intent). §23 order. Pure.
export function anchor(
	g: BesoinGraph,
	nodes: CapNode[],
	branch: string,
): BesoinAnchor {
	const byLevel = new Map<string, CapNode>();
	for (const n of nodes) byLevel.set(n.level, n);
	const units: AnchorUnit[] = [];
	for (const lvl of levels()) {
		const n = byLevel.get(lvl);
		if (n?.status !== "resolved") continue;
		if (isNoEmit(lvl)) continue;
		units.push({
			level: lvl,
			key: canonicalIntentKey(lvl, n.utterance),
			intent: n.utterance,
		});
	}
	return { graphHash: graphHash(g), units, branch };
}

// parseGraphHash recovers the graph_hash an EL18 memory provenance carries ("besoin:<graph_hash>").
// Returns null when not a besoin provenance. Pure, total (byte-equivalent to ParseGraphHash in Go).
export function parseGraphHash(provenance: string): string | null {
	if (!provenance.startsWith(GRAPH_HASH_TAG)) return null;
	const gh = provenance.slice(GRAPH_HASH_TAG.length);
	return gh === "" ? null : gh;
}

// reuseFor routes a SECOND resolved need's units against this anchor (CE05 name-match on canonical
// keys). A similar need replays ≥1 unit (ReplayCost); a dissimilar need fabricates NO reuse. It
// WRITES NO truth (wroteKernel always false). Pure, total.
export function reuseFor(a: BesoinAnchor, next: BesoinAnchor): ReusePlan {
	const corpus = new Set(a.units.map((u) => u.key));
	let reused = 0;
	let effortAfter = 0;
	for (const u of next.units) {
		if (corpus.has(u.key)) {
			reused++;
			effortAfter += REPLAY_COST;
		} else {
			effortAfter += DERIVE_COST;
		}
	}
	const effortBefore = DERIVE_COST * next.units.length;
	const saved = effortBefore - effortAfter;
	return {
		goal: next.graphHash,
		sourceGoal: a.graphHash,
		reusedProcedural: reused,
		derivedFresh: next.units.length - reused,
		effortBefore,
		effortAfter,
		savedTokens: saved,
		reductionFrac: effortBefore > 0 ? saved / effortBefore : 0,
		wroteKernel: false,
	};
}
