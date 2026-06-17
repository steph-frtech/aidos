/**
 * lib/learn-data — the DETERMINISTIC DEMO FALLBACK for the /learn panel (S107, EPIC 12 / E12;
 * ADR 0092 S59 cutover).
 *
 * Since S59 the LIVE /learn loop-closure is the Go engine's (back/mcp/learn/learnsrv, dispatched
 * through the passerelle — the AUTHORITATIVE source on the wire). This module is the
 * `source:"demo"` fallback the panel shows when the gateway is unreachable / a payload is malformed
 * (`readVia` falls back to it deterministically, never a broken-live). It carries:
 *
 *   - the §S107 canonical out-of-stock INPUT fixtures (incident, approved mirror, target, edges,
 *     heads) the demo loop runs over;
 *   - the PURE loop computation (bumpHash · targetedWave · closeLoop) the Go engine reproduces —
 *     kept here ONLY as the demo fallback (it is no longer the live path), and reused by the
 *     reality-evolution cockpit twin (lib/reality-evolution) for its own demo composition;
 *   - the derived `DEMO_OUTCOME` — the demo loop-closure value the panel renders when source:"demo".
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): every function here is PURE — no clock, no rng, no I/O, no
 * LLM. THE WALL (§2): the loop NEVER writes truth and NEVER authors the approved mirror (the human's
 * /goal does); `wroteKernel` is always false; the direct Reality→Kernel edge is always refused.
 *
 * The Go output is AUTHORITATIVE on the wire — this twin compute keeps the demo self-consistent with
 * the same algorithm (a deterministic content-address delta + a mirror-first targeted wave); a
 * different stable hash would still satisfy the invariant the loop proves (before != after IFF the
 * body changed).
 */

import type {
	ApprovedMirror,
	Bump,
	Edge,
	Outcome,
	RedWave,
	RedWorkItem,
	Target,
	WaveLayer,
} from "./learn";
import { WALL_CODE } from "./learn";

/**
 * A deterministic content-address over an object body (key-sorted). It mirrors the Go
 * records.Hash(records.Canonicalize(body)); here a stable FNV-1a hex over the canonical JSON keeps
 * the demo self-consistent (the Go hash is authoritative on the wire). The invariant the loop
 * proves — before != after IFF the body changed — holds for any deterministic hash.
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

/**
 * closeLoop runs the full /learn loop deterministically: it asserts the incident's draft idea
 * carries provenance=incident, computes the bump, seeds the targeted wave, and re-asserts the wall
 * (always a refusal; wroteKernel always false). Mirrors learn.Close; the Go outcome is authoritative
 * on the wire — this is the demo fallback's composition.
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

/**
 * DEMO_OUTCOME — the demo loop-closure value the panel renders under `source:"demo"`: the §S107
 * canonical out-of-stock loop closed over the approved mirror (the createOrder hash bumps, a
 * mirror-first targeted red wave becomes the worklist). It is the deterministic twin composition the
 * Go engine reproduces on the wire — derived once, frozen, identical every render.
 */
export const DEMO_OUTCOME: Outcome = closeLoop(
	DEMO_INCIDENT_REF,
	DEMO_MIRROR,
	DEMO_TARGET,
	DEMO_EDGES,
	DEMO_HEADS,
);

// ── the gateway-arg projection: the front fixtures → the Go learn `close_loop` input schema ──
// (kept here, beside the fixtures, like arch-fitness's gatewayGraphArgs in lib/arch-fitness-data).

/** The Go link kind a front wave layer implies (a mirror edge `mirrors`, else `projects_to`). */
function linkKindOf(layer: WaveLayer): string {
	return layer === "mirror" ? "mirrors" : "projects_to";
}

/** edgeArgs projects one front Edge → the Go redwave.Edge input shape (link + load_bearing + layer). */
function edgeArgs(e: Edge): Record<string, unknown> {
	return {
		link: {
			kind: linkKindOf(e.layer),
			from: { id: e.fromId, version: e.fromVersion },
			to: { id: e.toId, version: e.toVersion },
		},
		load_bearing: e.loadBearing,
		layer: e.layer,
	};
}

/**
 * gatewayCloseArgs projects the §S107 demo inputs to the Go learn `close_loop` input schema
 * (closeInput: incident · mirror · target · edges · heads), snake_cased. The `target.spec_body` is
 * an OBJECT (the S59 dispatch-safe targetIn — NOT a byte-array RawMessage). PURE — same inputs ⇒
 * same args (the parity mirror exercises the round-trip on the same fixtures). It carries no truth:
 * close_loop is a below-the-line READ (WroteKernel always false).
 */
export function gatewayCloseArgs(
	incidentRef: string,
	mirror: ApprovedMirror,
	target: Target,
	edges: Edge[],
	heads: Record<string, string>,
): Record<string, unknown> {
	return {
		incident: {
			ref: incidentRef,
			signal: {
				operation: "createOrder",
				error: "out_of_stock_during_checkout",
				recurrence: 1,
			},
			cause_sketch: "stock dropped to 0 between reserve and charge",
			taint: [],
			linked_branches: [],
		},
		mirror: {
			mirror_id: mirror.mirrorId,
			reflects: { id: mirror.reflectsId, version: mirror.reflectsVersion },
		},
		target: {
			kind: target.kind,
			id: target.id,
			version: target.version,
			spec_body: target.specBody,
		},
		edges: edges.map(edgeArgs),
		heads,
	};
}
