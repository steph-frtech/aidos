/**
 * The stable-phase (phase stable) coherent-cut decision — the Workbench /phase-stable source
 * (AIDOS step S23).
 *
 * KRD §43 (a stable phase is a COHERENT CUT in the version DAG: one version per constraint such
 * that EVERY link resolves AND EVERY sensor is green at once — the kernel's LOCKFILE; "is this a
 * stable phase?" = "all links resolved + all green?"; the EMPTY cut is vacuously STABLE; ANY single
 * red mirror flips it to UNSTABLE) · §44 (a stable phase is a DAG NODE) · §41–§42 (the six
 * versioned links + resolve → green/stale/absent, owned by S17, CONSUMED here, not redefined).
 *
 * This module is the DECLARED projection of the Go package back/archive/phases — the same
 * decision, the same reasons ordering, reusing the same staleness check as back/kernel/links.Resolve
 * — so the /phase-stable panel computes the verdict EXACTLY as the Go IsStable / `aidos stable`
 * compute it. One source, no drift.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock, no rng, no I/O —
 * so the same (cut, heads, links, sensors) always yields the same (stable, reasons). The
 * reproducibility mirror lib/phase-stable.test.ts (fast-check) pins determinism, empty⇒stable,
 * any-red⇒unstable, stable⇔all-green, and reasons⇔¬stable.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): /phase-stable PROJECTS the verdict; it never
 * writes truth and records no node. Recording a phase node into dag.stable_phase goes via the
 * `aidos` writer role inside a ChangeSet, never from this screen.
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

/** One sensor's certification result over the cut (S07 shape, mirrors phases.SensorStatus). */
export interface SensorStatus {
	id: string;
	pass: boolean;
}

/** The cut: one version per constraint (constraintId → version), mirrors phases.Cut. */
export type Cut = Record<string, string>;

/** The KRD §43 coherent-cut artifact, mirrors phases.StablePhase. */
export interface StablePhase {
	cut: Cut;
	sensorStatus: SensorStatus[];
	stable: boolean;
	reasons: string[];
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

/** The canonical reason string for a non-green link: "from->to (status)" (mirrors phases.reasonForLink). */
function reasonForLink(link: Link, status: LinkStatus): string {
	return `${link.from.id}@${link.from.version}->${link.to.id}@${link.to.version} (${status})`;
}

/**
 * isStable is the PURE coherent-cut decision (KRD §43; mirrors phases.IsStable). It is a total,
 * deterministic function of (cut, heads, links, sensors):
 *   - it REUSES resolve to test EVERY link resolves green (a stale|absent link is a red mirror,
 *     named "from->to (stale|absent)");
 *   - it tests EVERY sensor is green (a red sensor is named by its id);
 *   - stable === true IFF both hold. The EMPTY cut is vacuously STABLE (reasons empty) — the base
 *     case. ANY single red mirror flips stable to false.
 * reasons is sorted so the verdict is byte-stable; reasons is empty IFF stable (both ways).
 * Pure: no clock, no rng, no I/O. Never throws.
 */
export function isStable(
	cut: Cut,
	heads: Heads,
	ls: readonly Link[],
	sensors: readonly SensorStatus[],
): StablePhase {
	const reasons: string[] = [];

	for (const s of sensors) {
		if (!s.pass) reasons.push(s.id);
	}
	for (const l of ls) {
		const status = resolve(l, heads);
		if (status !== "green") reasons.push(reasonForLink(l, status));
	}
	reasons.sort();

	return {
		cut,
		sensorStatus: [...sensors],
		stable: reasons.length === 0,
		reasons,
	};
}

/** The render status of one link in the cut (for colouring the panel). */
export interface LinkView {
	link: Link;
	status: LinkStatus;
}

/** linkViews colours each link by its resolved status — green = resolves, red = stale/absent. */
export function linkViews(ls: readonly Link[], heads: Heads): LinkView[] {
	return ls.map((link) => ({ link, status: resolve(link, heads) }));
}
