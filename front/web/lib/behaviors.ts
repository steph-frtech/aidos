/**
 * behaviors — the S79 front twin of back/kernel/behavior/library.go. It is the USER-FACING behavior
 * LIBRARY on top of S76: the seven project-scoped gestures the /behaviors Workbench route drives —
 * browse / search / tag / attach (preview + land) / soft-delete / publish / comment.
 *
 * It does NOT re-implement the catalogue or the expansion (the single-function law, §24.6): it
 * IMPORTS the ONE `propose` from lib/behavior-expander (which itself imports the ONE `expand`), and
 * adds ONLY the library plane S76 doesn't expose:
 *
 *   - the project-scoped library of LibEntry (record + published/deleted/comments) ;
 *   - browse (canonical order, soft-deleted hidden) ;
 *   - search — a DETERMINISTIC `rg`-like substring match over owner + tags + locale labels, NEVER an
 *     LLM (determinism-first, CLAUDE.md §6/§8) ;
 *   - tag / publish / soft-delete / comment ;
 *   - attach — PREVIEW the scoped policies+fixtures (the ONE `propose`) then LAND via an APPROVED
 *     (APPLIED) changeset (the wall: propose → approve, never a direct kernel write).
 *
 * DETERMINISM-FIRST: browse / search / tag / softDelete / publish / comment / previewAttach are PURE
 * — same input → byte-identical output. behaviors.test.ts pins it (Vitest + fast-check).
 */

import {
	type BehaviorRecord,
	type Kind,
	type Proposal,
	propose,
	recordId,
} from "./behavior-expander";

export type { BehaviorRecord, Kind, Proposal };
export { recordId };

/** the canonical catalogue order — one source (no fork). */
const CATALOGUE_ORDER: Kind[] = ["ownable", "soft-deletable", "auditable"];

/** A comment on a library entry — append-only (the COMMENT gesture). */
export interface Comment {
	author: string;
	body: string;
	at: string; // RFC3339; an argument, never a clock read
}

/** One entry in a project's behavior library: the S76 record + the library lifecycle. */
export interface LibEntry {
	record: BehaviorRecord;
	published: boolean;
	deleted: boolean;
	comments: Comment[];
}

/** A project's behavior library — project-scoped, keyed by recordId. */
export interface Library {
	projectId: string;
	entries: Record<string, LibEntry>;
}

export function newLibrary(projectId: string): Library {
	return { projectId, entries: {} };
}

function clone(l: Library): Library {
	return { projectId: l.projectId, entries: { ...l.entries } };
}

function dedupSortTags(tags: string[] | undefined): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const t of tags ?? []) {
		if (!seen.has(t)) {
			seen.add(t);
			out.push(t);
		}
	}
	out.sort();
	return out;
}

/** add — insert a record into the library (fresh: unpublished, live). Returns [library, id]. */
export function add(l: Library, r: BehaviorRecord): [Library, string] {
	const id = recordId(r);
	const out = clone(l);
	out.entries[id] = {
		record: r,
		published: false,
		deleted: false,
		comments: [],
	};
	return [out, id];
}

function catalogueRank(k: Kind): number {
	const i = CATALOGUE_ORDER.indexOf(k);
	return i < 0 ? CATALOGUE_ORDER.length : i;
}

function lessEntry(a: LibEntry, b: LibEntry): number {
	const ra = catalogueRank(a.record.kind);
	const rb = catalogueRank(b.record.kind);
	if (ra !== rb) return ra - rb;
	if (a.record.owner !== b.record.owner)
		return a.record.owner < b.record.owner ? -1 : 1;
	if (a.record.version !== b.record.version)
		return a.record.version - b.record.version;
	const ia = recordId(a.record);
	const ib = recordId(b.record);
	return ia < ib ? -1 : ia > ib ? 1 : 0;
}

/** browse — live entries in canonical order (soft-deleted hidden unless includeDeleted). PURE. */
export function browse(l: Library, includeDeleted = false): LibEntry[] {
	return Object.values(l.entries)
		.filter((e) => includeDeleted || !e.deleted)
		.sort(lessEntry);
}

/** searchableText — the case-folded haystack search matches against (deterministic). */
function searchableText(r: BehaviorRecord): string {
	const parts: string[] = [r.kind, r.owner, ...dedupSortTags(r.tags)];
	for (const loc of Object.keys(r.labels).sort()) {
		parts.push(loc, r.labels[loc]);
	}
	return parts.join("").toLowerCase();
}

/**
 * search — the DETERMINISTIC `rg`-like matcher (NEVER an LLM). Returns live entries whose searchable
 * text contains the query as a case-folded substring, in browse order. Empty query → all live. PURE.
 */
export function search(l: Library, query: string): LibEntry[] {
	const q = query.trim().toLowerCase();
	const live = browse(l, false);
	if (q === "") return live;
	return live.filter((e) => searchableText(e.record).includes(q));
}

/** tag — add a tag; the record is its tags so the entry re-keys. Returns [library, newId]. PURE. */
export function tag(
	l: Library,
	id: string,
	t: string,
): [Library, string] | { error: string } {
	const e = l.entries[id];
	if (!e) return { error: ERR_NOT_IN_LIBRARY };
	const nr: BehaviorRecord = {
		...e.record,
		tags: dedupSortTags([...(e.record.tags ?? []), t]),
	};
	const newId = recordId(nr);
	const out = clone(l);
	delete out.entries[id];
	out.entries[newId] = { ...e, record: nr };
	return [out, newId];
}

export function publish(l: Library, id: string): Library | { error: string } {
	const e = l.entries[id];
	if (!e) return { error: ERR_NOT_IN_LIBRARY };
	const out = clone(l);
	out.entries[id] = { ...e, published: true };
	return out;
}

export function softDelete(
	l: Library,
	id: string,
): Library | { error: string } {
	const e = l.entries[id];
	if (!e) return { error: ERR_NOT_IN_LIBRARY };
	const out = clone(l);
	out.entries[id] = { ...e, deleted: true };
	return out;
}

export function comment(
	l: Library,
	id: string,
	author: string,
	body: string,
	at: string,
): Library | { error: string } {
	const e = l.entries[id];
	if (!e) return { error: ERR_NOT_IN_LIBRARY };
	const out = clone(l);
	out.entries[id] = { ...e, comments: [...e.comments, { author, body, at }] };
	return out;
}

/** An APPLIED changeset view — the landing of an approved attachment. */
export interface AppliedChangeSet {
	label: string;
	status: "APPLIED";
	parent_phase: string;
	spec_delta: { kind: string; target: string; body: string };
	mirror_delta: { kind: string; target: string };
	applied_at: string;
}

export interface LandedAttachment {
	ok: boolean;
	error?: string;
	preview?: Proposal;
	applied?: AppliedChangeSet;
}

/**
 * previewAttach — run the ONE S76 `propose` for a library record attached to an entity. Returns the
 * dry-run Proposal (the preview: scoped policies+fixtures + the DRAFT changeset). WRITES NOTHING.
 */
export function previewAttach(
	l: Library,
	id: string,
	entity: string,
	parentPhase: string,
	existing?: Parameters<typeof propose>[3],
): Proposal {
	const e = l.entries[id];
	if (!e) return { ok: false, error: ERR_NOT_IN_LIBRARY };
	return propose(e.record, entity, parentPhase, existing);
}

/**
 * landAttach — preview the attachment AND land it via an APPROVED (APPLIED) changeset. Gated by
 * completeness (a spec_delta needs its mirror_delta — `propose` always emits both). `approvedAt` is
 * an argument (purity). It NEVER writes the kernel directly: the landing is the APPLIED changeset
 * VALUE, the legal door (propose → approve).
 */
export function landAttach(
	l: Library,
	id: string,
	entity: string,
	parentPhase: string,
	approvedAt: string,
	existing?: Parameters<typeof propose>[3],
): LandedAttachment {
	const prev = previewAttach(l, id, entity, parentPhase, existing);
	if (!prev.ok || !prev.changeset)
		return { ok: false, error: prev.error ?? "preview failed" };
	// completeness gate: a spec_delta requires its mirror_delta (propose emits both).
	if (prev.changeset.spec_delta && !prev.changeset.mirror_delta)
		return { ok: false, error: "INCOMPLETE_CHANGESET" };
	const applied: AppliedChangeSet = {
		label: prev.changeset.label,
		status: "APPLIED",
		parent_phase: prev.changeset.parent_phase,
		spec_delta: prev.changeset.spec_delta,
		mirror_delta: prev.changeset.mirror_delta,
		applied_at: approvedAt,
	};
	return { ok: true, preview: prev, applied };
}

export const ERR_NOT_IN_LIBRARY =
	"behavior: record id is not in the project library";

/** A canonical demo library — the §24.6 owner-scoping behaviour, project-scoped. */
export const DEMO_RECORD: BehaviorRecord = {
	kind: "ownable",
	owner: "alice",
	version: 1,
	tags: ["scoping", "security"],
	labels: { fr: "Possédé par un propriétaire", en: "Owner-scoped" },
};
