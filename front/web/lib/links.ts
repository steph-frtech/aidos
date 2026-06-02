/**
 * The versioned-links projection — the Workbench /link-graph source (AIDOS step S17).
 *
 * KRD §41 (the six versioned link types): a link points at a VERSION (id@version), NEVER a
 * bare identity — that is the whole point. The six kinds are a CLOSED set: projects_to,
 * derives_from, contracts_with, triggers, binds, mirrors. When the target's head moves, the
 * consumer's pinned version no longer matches — the link is STALE (red); when the target has
 * no head at all, the link is ABSENT (red), dangling loudly (KRD §42, the red wave).
 *
 * This module is the DECLARED projection of the Go package back/kernel/links — the same §41
 * shape, the same staleness rule — so the /link-graph panel colours each edge exactly as the
 * Go Resolve resolves it. One source, no drift.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock, no rng, no
 * I/O — so the same (link, heads) always yields the same status. The reproducibility mirror
 * lib/links.test.ts (fast-check) pins green⇔head, missing-head⇒absent, totality, determinism,
 * the closed-kind/pinned validation, and never-throws.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): /link-graph renders the resolved status over the
 * link rows; it never writes truth (the wall). Truth-writes (a new kernel.link row) go via
 * propose → ChangeSet → approval, never from this screen.
 */

/** The six KRD §41 versioned link kinds (the closed set). */
export const LINK_KINDS = [
	"projects_to",
	"derives_from",
	"contracts_with",
	"triggers",
	"binds",
	"mirrors",
] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** A PINNED layer reference: an id plus the concrete version it points at (id@version). */
export interface Ref {
	id: string;
	version: string;
}

/** The KRD §41 versioned link: a kind plus a consuming `from` ref and a pinned `to` target. */
export interface Link {
	kind: string;
	from: Ref;
	to: Ref;
}

/** Resolve's verdict — green (healthy), or stale/absent (both RED). */
export type LinkStatus = "green" | "stale" | "absent";

/** heads maps a targetId to its current head version (mirrors links.Heads). */
export type Heads = Record<string, string>;

/** isKnownKind — one of the six KRD §41 kinds (mirrors links.IsKnownKind). */
export function isKnownKind(k: string): k is LinkKind {
	return (LINK_KINDS as readonly string[]).includes(k);
}

/** isPinned — both id and version are non-empty (a bare identity is not a valid target). */
export function isPinned(r: Ref): boolean {
	return r.id !== "" && r.version !== "";
}

/** refString — the canonical "id@version" form (mirrors links.Ref.String). */
export function refString(r: Ref): string {
	return `${r.id}@${r.version}`;
}

/**
 * validate — the pure shape guard (mirrors links.Validate): kind in the six-set; from and to
 * are pinned id@version refs (an unpinned `to` is itself a monster). Returns a non-empty error
 * string when invalid, or "" when valid.
 */
export function validate(l: Link): string {
	if (!isKnownKind(l.kind)) return `unknown link kind: ${l.kind}`;
	if (!isPinned(l.from))
		return `from is not a pinned id@version ref: ${refString(l.from)}`;
	if (!isPinned(l.to))
		return `to is not pinned (id@version required): ${refString(l.to)}`;
	return "";
}

/**
 * resolve — the pure staleness check, mirroring links.Resolve (KRD §41–§42):
 *   - absent (red) — heads has NO entry for the target id (the version is gone): THE done case;
 *   - green — the target exists AND the link is pinned exactly to its head;
 *   - stale (red) — the target exists but the link is pinned to a NON-head version.
 * Total + deterministic; keys only on the pinned `to` ref.
 */
export function resolve(l: Link, heads: Heads): LinkStatus {
	const present = Object.hasOwn(heads, l.to.id);
	if (!present) return "absent";
	if (heads[l.to.id] === l.to.version) return "green";
	return "stale";
}
