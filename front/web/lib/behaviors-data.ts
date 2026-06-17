/**
 * behaviors-data — the DETERMINISTIC demo fixture for the /behaviors panel (S79; ADR 0092 batch-2
 * kill-twins flip). It holds the canonical project-scoped behavior LIBRARY (the §24.6 owner-scoping
 * record + two more) and the twin `browse()`/`search()` of it as the demo `EntryView[]` the panel
 * falls back to when the gateway is unreachable (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before this flip /behaviors computed its
 * displayed library from the TS twin `lib/behaviors` directly (`seedLibrary()` + `search()` in
 * actions.ts) — the twin WAS the live source. The flip routes the SEARCH/BROWSE read through the Go
 * `aidos-behaviors` MCP server via the passerelle (`readVia(scope, "behaviors_search", …)`, the
 * dispatched below-the-line read); this fixture is KEPT only as the deterministic fallback. The
 * presence of this `-data.ts` sibling is also what makes the T5 cliquet (twin-as-live-fitness)
 * RECOGNISE `lib/behaviors` as a twin — the panel stays GREEN because `actions.ts` imports the
 * `readVia` frontier (the witness the twin sits behind `source:"demo"`).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the demo entries are the same PURE twin compute the Go
 * `behavior.Library.Search` reproduces — same records + query → byte-identical entries. The parity
 * mirror app/behaviors/live.test.ts pins the decoder shape == the Go listOutput/entryOutput contract.
 *
 * THE WALL (§2): the seed records + the projection are below-the-line VALUES; search is read-only.
 */

import {
	add,
	type BehaviorRecord,
	browse,
	DEMO_RECORD,
	type LibEntry,
	type Library,
	newLibrary,
	recordId,
	search,
} from "./behaviors";

/** The project the seeded library is scoped to (mirrors the Go `project_id`). */
export const SEED_PROJECT_ID = "proj-shop";

/**
 * seedRecords — the canonical demo records the project library is built from (the §24.6 owner-scoping
 * behaviour + two more). A single source so the gateway-arg projection AND the demo entries agree.
 * PURE.
 */
export function seedRecords(): BehaviorRecord[] {
	return [
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
	];
}

/** seedLibrary — the seeded project library the demo fallback acts on. PURE. */
export function seedLibrary(): Library {
	let lib = newLibrary(SEED_PROJECT_ID);
	for (const r of seedRecords()) {
		lib = add(lib, r)[0];
	}
	return lib;
}

/**
 * The flat per-entry view the panel renders — the same shape the live decoder produces from the Go
 * `entryOutput`. The single declaration of the row shape (the panel does not re-declare it).
 */
export interface EntryView {
	recordId: string;
	kind: string;
	owner: string;
	version: number;
	tags: string[];
	labelFr: string;
	published: boolean;
}

/** recordIdOf re-derives an entry's content id from its record (the library key). Deterministic. */
export function recordIdOf(e: LibEntry): string {
	return recordId(e.record);
}

/** toView projects a twin LibEntry into the flat EntryView (the demo path). PURE. */
export function toView(e: LibEntry): EntryView {
	return {
		recordId: recordId(e.record),
		kind: e.record.kind,
		owner: e.record.owner,
		version: e.record.version,
		tags: e.record.tags ?? [],
		labelFr: e.record.labels.fr ?? "",
		published: e.published,
	};
}

/**
 * recordInput is the Go `behaviorssrv.recordInput` wire shape: the materialised library state the
 * caller hands the stateless server (PURE — no DB). `tags` is omitted when empty (matches the Go
 * `omitempty`); `labels` is always present (FR required).
 */
export interface RecordInputArg {
	kind: string;
	owner: string;
	version: number;
	tags?: string[];
	labels: Record<string, string>;
}

/**
 * gatewaySearchArgs maps the seeded records + the query to the Go `behaviors_search` input shape
 * ({ project_id, records, query }). PURE — a deterministic projection, never an LLM. An empty query
 * is legal (the Go search returns all live entries, == browse).
 */
export function gatewaySearchArgs(query: string): Record<string, unknown> {
	return {
		project_id: SEED_PROJECT_ID,
		query,
		records: seedRecords().map(
			(r): RecordInputArg => ({
				kind: r.kind,
				owner: r.owner,
				version: r.version,
				...(r.tags && r.tags.length > 0 ? { tags: r.tags } : {}),
				labels: r.labels,
			}),
		),
	};
}

/**
 * demoSearch is the deterministic demo `EntryView[]` — the twin `search()`/`browse()` of the seeded
 * library, the fallback when the gateway is unreachable. An empty query yields all live entries
 * (browse order). PURE.
 */
export function demoSearch(query: string): EntryView[] {
	const lib = seedLibrary();
	const q = query.trim();
	const hits = q === "" ? browse(lib) : search(lib, q);
	return hits.map(toView);
}
