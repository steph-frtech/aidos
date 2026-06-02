/**
 * The red-wave (vague de rouge) impact projection — the Workbench /red-wave source (AIDOS step S22).
 *
 * KRD §42 (la vague de rouge IS EXACTLY the set of stale links after a bump — computed, never
 * hunted; it STARTS at the mirror then cascades to the projections api/db/types/operation/action/
 * button) · §98 (the ChangeSet example: a bump fires PostKernelChange: fire-red-wave --from-mirror →
 * mirrors red first, projections after) · §74 (the hooks.yaml line PostKernelChange: rehash &&
 * fire-red-wave --from-mirror) · §49.4 (RedWorkQueue/RedWorkItem: target, reason ∈ {version_stale,
 * failed_test, incident}, status open|claimed|blocked|resolved) · §112 (load-bearing vs cosmetic —
 * a cosmetic change does not propagate; ADR 0020) · ADR 0020 (this step's decisions).
 *
 * This module is the DECLARED projection of the Go package back/runtime/redwave — the same closure,
 * the same mirror-first ordering, the same load-bearing propagation rule, reusing the same staleness
 * check as back/kernel/links.Resolve — so the /red-wave panel orders + colours each wave item exactly
 * as the Go Impact / Enqueue compute them. One source, no drift.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock, no rng, no I/O —
 * so the same (bumped, edges, heads) always yields the same ordered wave. The reproducibility mirror
 * lib/red-wave.test.ts (fast-check) pins determinism, wave==set-of-stale-links, mirror-first order,
 * no-propagation-on-cosmetic, the |wave| enqueue count, and totality.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): /red-wave PROJECTS the queue/wave; it never
 * writes truth and never enqueues. Enqueuing is the harness-invoked PostKernelChange hook; applying a
 * change goes via propose → ChangeSet → approval, never from this screen.
 */

/** A PINNED layer reference: an id plus the concrete version it points at (id@version). */
export interface Ref {
	id: string;
	version: string;
}

/** The six KRD §41 link kinds (the closed set, mirrors back/kernel/links.Kind). */
export type LinkKind =
	| "projects_to"
	| "derives_from"
	| "contracts_with"
	| "triggers"
	| "binds"
	| "mirrors";

/** An S17 versioned link (kind + pinned from/to), mirrors links.Link. */
export interface Link {
	kind: LinkKind;
	from: Ref;
	to: Ref;
}

/** The staleness verdict of a link against heads (mirrors links.LinkStatus). */
export type LinkStatus = "green" | "stale" | "absent";

/** heads maps a target id to its current head version (mirrors links.Heads). */
export type Heads = Record<string, string>;

/** The render-grouping layer of a target (mirrors redwave.Layer). */
export type Layer = "mirror" | "projection" | "operation_action" | "button";

/** Why a RedWorkItem is red (the closed §49.4 set, mirrors redwave.Reason). */
export type Reason = "version_stale" | "failed_test" | "incident";

/** The lifecycle status of a RedWorkItem (the closed §49.4 set, mirrors redwave.Status). */
export type Status = "open" | "claimed" | "blocked" | "resolved";

/**
 * A propagating edge of the wave's input graph: an S17 link PLUS the DECLARED load-bearing flag
 * (the composes weight, S18/S19 §112; ADR 0020) and a render Layer hint. Mirrors redwave.Edge.
 */
export interface Edge {
	link: Link;
	loadBearing: boolean;
	layer: Layer;
}

/** One element of the wave (KRD §49.4), mirrors redwave.RedWorkItem. */
export interface RedWorkItem {
	target: string;
	reason: Reason;
	dependencies: string[];
	layer: Layer;
	waveId?: string;
}

/** The ordered set of RedWorkItems a bump triggers (KRD §42), mirrors redwave.RedWave. */
export interface RedWave {
	items: RedWorkItem[];
}

/**
 * resolve is the PURE staleness check (mirrors links.Resolve): absent when heads has no entry for
 * the target; green when pinned exactly to the head; stale otherwise. Total, deterministic, never
 * throws. Keys only on the pinned `to` ref.
 */
export function resolve(link: Link, heads: Heads): LinkStatus {
	const head = heads[link.to.id];
	if (head === undefined) return "absent";
	return head === link.to.version ? "green" : "stale";
}

/** The canonical mirror-first rank: mirror(0) < projection(1) < operation_action(2) < button(3). */
function layerRank(l: Layer): number {
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
 * impact computes the red wave a bump triggers (KRD §42; mirrors redwave.Impact). It is a total,
 * deterministic function of (bumped, edges, heads):
 *   - the wave is the transitive closure of edges whose target is already red AND resolve reports
 *     stale|absent AND the edge is LOAD-BEARING (a cosmetic edge never propagates, §112);
 *   - it walks OUTWARD from the bumped sources (mirror first);
 *   - it is ORDERED mirror-first, then by target id (byte-stable — determinism).
 * Pure: no clock, no rng, no I/O. Never throws.
 */
export function impact(
	bumped: readonly string[],
	edges: readonly Edge[],
	heads: Heads,
): RedWave {
	if (bumped.length === 0) return { items: [] };

	const red = new Set<string>(bumped);
	const items = new Map<
		string,
		{ target: string; reason: Reason; layer: Layer; deps: Set<string> }
	>();

	for (;;) {
		let grew = false;
		for (const e of edges) {
			if (resolve(e.link, heads) === "green") continue;
			if (!red.has(e.link.to.id)) continue;
			if (!e.loadBearing) continue;
			const from = e.link.from.id;
			let it = items.get(from);
			if (it === undefined) {
				it = {
					target: from,
					reason: "version_stale",
					layer: e.layer,
					deps: new Set(),
				};
				items.set(from, it);
			}
			it.deps.add(e.link.to.id);
			if (!red.has(from)) {
				red.add(from);
				grew = true;
			}
		}
		if (!grew) break;
	}

	const out: RedWorkItem[] = [...items.values()].map((it) => ({
		target: it.target,
		reason: it.reason,
		dependencies: [...it.deps].sort(),
		layer: it.layer,
	}));
	out.sort((a, b) => {
		const ra = layerRank(a.layer);
		const rb = layerRank(b.layer);
		if (ra !== rb) return ra - rb;
		return a.target < b.target ? -1 : a.target > b.target ? 1 : 0;
	});
	return { items: out };
}

/**
 * enqueue stamps every wave item with the waveId (the bump hash) and returns the rows VALUE — it
 * writes nothing (the wall). Returns exactly |wave| rows. Mirrors redwave.Enqueue.
 */
export function enqueue(w: RedWave, waveId: string): RedWorkItem[] {
	return w.items.map((it) => ({ ...it, waveId }));
}

/** isEmpty reports whether the wave carries no items (no bump ⇒ empty wave, §42). */
export function isEmpty(w: RedWave): boolean {
	return w.items.length === 0;
}
