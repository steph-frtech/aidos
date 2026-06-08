"use server";

import {
	add,
	type BehaviorRecord,
	browse,
	DEMO_RECORD,
	type LandedAttachment,
	type LibEntry,
	type Library,
	landAttach,
	newLibrary,
	recordId,
	search,
} from "@/lib/behaviors";

/**
 * Server Actions for the /behaviors Workbench panel (S79 — « Librairie behaviors user-facing »).
 *
 * THE STEP (ROADMAP-app-builder S79): the project-scoped behavior LIBRARY — browse / search
 * (deterministic `rg`-like, NEVER an LLM) / tag / attach / soft-delete / publish / comment. Attaching
 * PREVIEWS the expansion (scoped policies+fixtures) by calling the ONE S76 Expand/Propose and LANDS
 * it via an APPROVED ChangeSet. It CONSUMES S76's single expander — it never re-implements it.
 *
 * THE WALL (§2/§7): every action WRITES NOTHING. Search/browse are read-only; attach previews a DRAFT
 * and lands an APPLIED changeset VALUE — the legal door (propose → approve), never a direct kernel
 * write. The matcher is PURE code (lib/behaviors), never an LLM (determinism-first, §6/§8).
 */

/** The seeded project library the panel acts on (the §24.6 owner-scoping behaviour + two more). */
function seedLibrary(): Library {
	let lib = newLibrary("proj-shop");
	[
		DEMO_RECORD,
		{
			kind: "soft-deletable",
			owner: "bob",
			version: 1,
			labels: { fr: "Archivable", en: "Soft-deletable" },
		} as BehaviorRecord,
		{
			kind: "auditable",
			owner: "carol",
			version: 2,
			tags: ["trace"],
			labels: { fr: "Audité", en: "Auditable" },
		} as BehaviorRecord,
	].forEach((r) => {
		lib = add(lib, r)[0];
	});
	return lib;
}

export interface EntryView {
	recordId: string;
	kind: string;
	owner: string;
	version: number;
	tags: string[];
	labelFr: string;
	published: boolean;
}

function toView(e: LibEntry): EntryView {
	return {
		recordId: recordIdOf(e),
		kind: e.record.kind,
		owner: e.record.owner,
		version: e.record.version,
		tags: e.record.tags ?? [],
		labelFr: e.record.labels.fr ?? "",
		published: e.published,
	};
}

// recordIdOf re-derives the entry's content id from its record (the library key). Deterministic.
function recordIdOf(e: LibEntry): string {
	return recordId(e.record);
}

export interface BrowseView {
	ok: boolean;
	entries: EntryView[];
	query: string;
}

/** searchAction — the deterministic search control (NEVER an LLM). Read-only. */
export async function searchAction(
	_prev: BrowseView,
	formData: FormData,
): Promise<BrowseView> {
	const query = String(formData.get("query") ?? "").trim();
	const lib = seedLibrary();
	const hits = query === "" ? browse(lib) : search(lib, query);
	return { ok: true, entries: hits.map(toView), query };
}

export interface AttachView {
	ok: boolean;
	error?: string;
	landed?: LandedAttachment;
}

/**
 * attachAction — the action-capable attach control (CLAUDE.md §7 ui-completeness): the user picks the
 * ownable behaviour + an entity, and the action PREVIEWS the scoped policies+fixtures (the ONE S76
 * Propose) and LANDS it via an APPROVED (APPLIED) changeset. It WRITES NOTHING beyond the changeset
 * VALUE (the wall). The approval timestamp is supplied (purity); a malformed record yields a verbatim
 * error.
 */
export async function attachAction(
	_prev: AttachView,
	formData: FormData,
): Promise<AttachView> {
	const entity = String(formData.get("entity") ?? "Order").trim();
	const approvedAt = String(
		formData.get("approvedAt") ?? "2026-06-08T12:00:00Z",
	).trim();
	const lib = seedLibrary();
	// the ownable record is the §24.6 owner-scoping behaviour — find its id deterministically.
	const ownable = browse(lib).find((e) => e.record.kind === "ownable");
	if (!ownable) return { ok: true, error: "ownable record not in the library" };
	const id = recordIdOf(ownable);
	const landed = landAttach(lib, id, entity, "phase-0", approvedAt);
	if (!landed.ok) return { ok: true, error: landed.error };
	return { ok: true, landed };
}
