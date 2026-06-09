/**
 * The learn twin — the Workbench /learn source (AIDOS S107, EPIC 12 / E12).
 *
 * The DECLARED projection of the Go package back/runtime/learn: the PURE, DETERMINISTIC
 * `/learn` LOOP-CLOSURE that turns an approved new mirror (the human's /goal outcome over an
 * incident, S106/S43) into a kernel HASH BUMP and a TARGETED red wave (the worklist):
 *
 *   - bumpHash — the deterministic content-address delta the approved mirror causes on its
 *     operation/policy target (before/after hash + moved). A no-op re-reflection does not move
 *     it (ROADMAP §S107 "le hash policy/operation change … mécaniquement").
 *   - targetedWave — seed the red wave the bump triggers (redwave.Impact, REUSED): mirror-first,
 *     the worklist. Empty when the bump did not move.
 *   - closeLoop — the full loop: incident → draft idea (provenance=incident, wrote-no-kernel) →
 *     bump → targeted wave → the wall verdict (always REALITY_CANNOT_DECLARE_TRUTH).
 *
 * THE WALL (CLAUDE.md §2): the loop NEVER writes truth and NEVER authors the approved mirror
 * (the human's /goal does). wroteKernel is always false; the direct Reality→Kernel edge is always
 * refused; nothing learns its own fitness. This twin returns a VALUE — the Go output is
 * AUTHORITATIVE on the wire.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): every function is PURE — no clock, no rng, no I/O, no LLM.
 * The reproducibility mirror lib/learn.test.ts (fast-check) pins same-input ⇒ same-output for the
 * bump AND the wave, and the wall-always-holds + never-writes-kernel invariants.
 */

export type TargetKind = "operation" | "policy";

/** The human-approved new mirror (the /goal outcome) the loop attaches to a target. */
export interface ApprovedMirror {
	mirrorId: string;
	/** the target ref the mirror reflects, "id@version". */
	reflectsId: string;
	reflectsVersion: string;
}

/** The operation/policy target the incident teaches a lesson about, at its current head. */
export interface Target {
	kind: TargetKind;
	id: string;
	version: string;
	/** the canonical JSON of the target's AST body BEFORE the reflection attaches. */
	specBody: Record<string, unknown>;
}

/** The deterministic content-address delta a learned mirror causes on its target. */
export interface Bump {
	targetId: string;
	before: string;
	after: string;
	moved: boolean;
}

export type WaveLayer = "mirror" | "projection" | "operation_action" | "button";

/** One element of the red wave (the worklist) — a target that is now red. */
export interface RedWorkItem {
	target: string;
	reason: "version_stale" | "failed_test" | "incident";
	layer: WaveLayer;
}

/** The ordered (mirror-first) red wave a bump triggers — the worklist. */
export interface RedWave {
	items: RedWorkItem[];
}

/** A target's link edge (S17), with its declared load-bearing flag + render layer. */
export interface Edge {
	/** the consuming `from` side ref, "id@version" (the layer that goes red). */
	fromId: string;
	fromVersion: string;
	/** the pinned `to` target ref. */
	toId: string;
	toVersion: string;
	loadBearing: boolean;
	layer: WaveLayer;
}

/** The wall refusal — reality never declares truth. */
export const WALL_CODE = "REALITY_CANNOT_DECLARE_TRUTH" as const;

/**
 * A deterministic content-address over an object body (key-sorted). It mirrors the Go
 * records.Hash(records.Canonicalize(body)); here a stable FNV-1a hex over the canonical JSON
 * keeps the twin self-consistent (the Go hash is authoritative on the wire). The invariant the
 * twin proves — before != after IFF the body changed — holds for any deterministic hash.
 */
function contentHash(body: unknown): string {
	const canonical = canonicalJSON(body);
	let h = 0x811c9dc5;
	for (let i = 0; i < canonical.length; i++) {
		h ^= canonical.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

/** canonicalJSON serialises with object keys sorted recursively (the records.Canonicalize twin). */
function canonicalJSON(v: unknown): string {
	if (v === null || typeof v !== "object") return JSON.stringify(v);
	if (Array.isArray(v)) return `[${v.map(canonicalJSON).join(",")}]`;
	const obj = v as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	return `{${keys
		.map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`)
		.join(",")}}`;
}

/**
 * reflectionAttached returns the target body WITH the approved mirror's reflection merged into a
 * stable, sorted, deduped `_reflections` set (additive, append-only — the Go reflectionAttached
 * twin). A re-reflection of an already-attached mirror yields the same body (no move).
 */
function reflectionAttached(
	body: Record<string, unknown>,
	mirrorId: string,
): Record<string, unknown> {
	const prior = Array.isArray(body._reflections)
		? (body._reflections as unknown[]).filter(
				(x): x is string => typeof x === "string",
			)
		: [];
	const set = new Set(prior);
	set.add(mirrorId);
	return { ...body, _reflections: Array.from(set).sort() };
}

/**
 * bumpHash computes the deterministic content-address delta the approved mirror causes on the
 * target (ROADMAP §S107). after != before IFF the reflection actually changes the canonical body.
 * Throws on a reflect-mismatch (a learned mirror must reflect the very target it bumps) or an empty
 * mirror id.
 */
export function bumpHash(target: Target, mirror: ApprovedMirror): Bump {
	if (mirror.mirrorId === "")
		throw new Error(
			"learn: approved mirror has no mirror_id (not frozen at /goal)",
		);
	if (
		mirror.reflectsId !== target.id ||
		mirror.reflectsVersion !== target.version
	)
		throw new Error(
			"learn: approved mirror does not reflect the bumped target",
		);
	const before = contentHash(target.specBody);
	const after = contentHash(
		reflectionAttached(target.specBody, mirror.mirrorId),
	);
	return { targetId: target.id, before, after, moved: after !== before };
}

/** layerRank gives the canonical mirror-first ordering rank (the redwave.layerRank twin). */
function layerRank(l: WaveLayer): number {
	switch (l) {
		case "mirror":
			return 0;
		case "projection":
			return 1;
		case "operation_action":
			return 2;
		case "button":
			return 3;
		default:
			return 4;
	}
}

/**
 * targetedWave seeds the red wave the bump triggers (ROADMAP §S107 "un red wave ciblé devient la
 * worklist"). When the bump MOVED, every edge whose `to` is the bumped target and whose pinned
 * version is no longer the head resolves stale → its `from` goes red; the wave is ordered
 * mirror-first. A bump that did not move (a no-op re-reflection) seeds an EMPTY wave. This mirrors
 * redwave.Impact; the Go wave is authoritative on the wire.
 */
export function targetedWave(
	bump: Bump,
	edges: Edge[],
	heads: Record<string, string>,
): RedWave {
	if (!bump.moved) return { items: [] };
	const items: RedWorkItem[] = [];
	for (const e of edges) {
		if (e.toId !== bump.targetId) continue;
		const head = heads[e.toId];
		// stale iff the edge is pinned to a non-head version (the bump moved the head).
		const stale = head !== undefined && head !== e.toVersion;
		if (!stale) continue;
		// a cosmetic edge does not propagate beyond itself — but the directly-stale edge IS red.
		items.push({
			target: `${e.fromId}@${e.fromVersion}`,
			reason: "version_stale",
			layer: e.layer,
		});
	}
	items.sort((a, b) => {
		const r = layerRank(a.layer) - layerRank(b.layer);
		return r !== 0 ? r : a.target.localeCompare(b.target);
	});
	return { items };
}

/** The full /learn loop outcome — the value the panel renders. */
export interface Outcome {
	provenanceSource: "incident";
	provenanceDetail: string;
	bump: Bump;
	wave: RedWave;
	wallCode: typeof WALL_CODE;
	wroteKernel: false;
}

/**
 * closeLoop runs the full /learn loop deterministically: it asserts the incident's draft idea
 * carries provenance=incident, computes the bump, seeds the targeted wave, and re-asserts the wall
 * (always a refusal; wroteKernel always false). Mirrors learn.Close; the Go outcome is authoritative.
 */
export function closeLoop(
	incidentRef: string,
	mirror: ApprovedMirror,
	target: Target,
	edges: Edge[],
	heads: Record<string, string>,
): Outcome {
	const bump = bumpHash(target, mirror);
	const wave = targetedWave(bump, edges, heads);
	return {
		provenanceSource: "incident",
		provenanceDetail: incidentRef,
		bump,
		wave,
		wallCode: WALL_CODE,
		wroteKernel: false,
	};
}

// ── demo fixtures (the §S107 canonical out-of-stock loop the panel boots with) ──

/** The createOrder operation target at head v1 (the §S107 example). */
export const DEMO_TARGET: Target = {
	kind: "operation",
	id: "op-createOrder",
	version: "v1",
	specBody: {
		kind: "operation",
		name: "createOrder",
		steps: ["reserve", "charge"],
	},
};

/** The human-approved new mirror (the /goal outcome): out-of-stock-during-checkout. */
export const DEMO_MIRROR: ApprovedMirror = {
	mirrorId: "mir-out-of-stock-during-checkout",
	reflectsId: "op-createOrder",
	reflectsVersion: "v1",
};

/** The createOrder edges: its mirror reflection (mirror-first) + a projection, pinned to v1. */
export const DEMO_EDGES: Edge[] = [
	{
		fromId: "mir-out-of-stock-during-checkout",
		fromVersion: "v1",
		toId: "op-createOrder",
		toVersion: "v1",
		loadBearing: true,
		layer: "mirror",
	},
	{
		fromId: "handler-createOrder",
		fromVersion: "v1",
		toId: "op-createOrder",
		toVersion: "v1",
		loadBearing: true,
		layer: "projection",
	},
];

/** heads AFTER the bump: createOrder advanced to v2 (its edges now resolve stale). */
export const DEMO_HEADS: Record<string, string> = { "op-createOrder": "v2" };

export const DEMO_INCIDENT_REF = "#1042";
