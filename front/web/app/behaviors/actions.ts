"use server";

import { browse, type LandedAttachment, landAttach } from "@/lib/behaviors";
import {
	demoSearch,
	type EntryView,
	gatewaySearchArgs,
	recordIdOf,
	seedLibrary,
} from "@/lib/behaviors-data";
import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { searchDecoder } from "./live";

/**
 * Server Actions for the /behaviors Workbench panel (S79 — « Librairie behaviors user-facing »).
 *
 * THE STEP (ROADMAP-app-builder S79): the project-scoped behavior LIBRARY — browse / search
 * (deterministic `rg`-like, NEVER an LLM) / tag / attach / soft-delete / publish / comment. Attaching
 * PREVIEWS the expansion (scoped policies+fixtures) by calling the ONE S76 Expand/Propose and LANDS
 * it via an APPROVED ChangeSet. It CONSUMES S76's single expander — it never re-implements it.
 *
 * ADR 0092 CUTOVER (the Go engine is the SINGLE live source). `searchAction` now reads the LIVE
 * library from the Go `aidos-behaviors` MCP server through the passerelle
 * (`readVia(scope, "behaviors_search", …)`, the dispatched below-the-line read), with the twin
 * `lib/behaviors.search()` preserved ONLY as the deterministic demo fallback (`source:"live"|"demo"`,
 * lib/behaviors-data). `attachAction` stays on the twin compute as the demo path (a local
 * preview/landing the front shows); the `readVia` frontier import keeps the T5 cliquet GREEN (the
 * twin sits behind the demo fallback, never as the live source).
 *
 * THE WALL (§2/§7): every action WRITES NOTHING. Search/browse are read-only (a below-the-line read);
 * attach previews a DRAFT and lands an APPLIED changeset VALUE — the legal door (propose → approve),
 * never a direct kernel write. The matcher is PURE code, never an LLM (determinism-first, §6/§8).
 */

export interface BrowseView {
	ok: boolean;
	entries: EntryView[];
	query: string;
	source: "live" | "demo";
}

/**
 * searchAction — the deterministic search control (NEVER an LLM). LIVE read through the passerelle
 * (the dispatched `behaviors_search` tool over the seeded library state); the twin demoSearch() is
 * the deterministic fallback (`source:"live"|"demo"`). Read-only.
 */
export async function searchAction(
	_prev: BrowseView,
	formData: FormData,
): Promise<BrowseView> {
	const query = String(formData.get("query") ?? "").trim();
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"behaviors_search",
		gatewaySearchArgs(query),
		searchDecoder,
		demoSearch(query),
	);
	return { ok: true, entries: data, query, source };
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
 * VALUE (the wall). The twin compute is the demo path (a local preview/comparison the screen shows).
 * The approval timestamp is supplied (purity); a malformed record yields a verbatim error.
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
