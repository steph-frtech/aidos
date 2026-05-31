/**
 * Client-safe types + pure helpers for the /records Workbench panel. This module
 * imports NOTHING server-only (no `postgres`, no node:* APIs) so it can be pulled
 * into the client component (RecordsPanel) without dragging net/tls/fs into the
 * browser bundle. The live read path (the `postgres` client + snapshot()) lives
 * in lib/records-data.ts, which re-exports these.
 *
 * THE WALL (CLAUDE.md §2): these record kinds are TRUTH, ABOVE the line. Nothing
 * here writes; the screen only reads.
 */

/** Kind enumerates the seven KRDCore record kinds (matches records.Kinds()). */
export type RecordKind =
	| "idea"
	| "truth"
	| "mirror"
	| "layer"
	| "link"
	| "changeset"
	| "phase";

/** RECORD_KINDS lists the seven kinds in canonical order (records.Kinds()). */
export const RECORD_KINDS: RecordKind[] = [
	"idea",
	"truth",
	"mirror",
	"layer",
	"link",
	"changeset",
	"phase",
];

/**
 * TABLE_OF maps each kind to its `<schema>.<table>` — the canonical placement
 * from the S02 migration. Used for the read SELECTs and the screen label.
 */
export const TABLE_OF: Record<RecordKind, string> = {
	idea: "ideas.idea",
	truth: "kernel.truth",
	mirror: "mirrors.mirror",
	layer: "kernel.layer",
	link: "kernel.link",
	changeset: "changesets.changeset",
	phase: "dag.phase",
};

/**
 * AUTHORITY_OF maps each kind to its waterline placement (records.DefaultAuthority).
 * "above" = human-anchored truth out of AI reach (the propose-ChangeSet control is
 * gated); "below" = a candidate below the freeze (Idea). Declared, not learned.
 */
export const AUTHORITY_OF: Record<RecordKind, "above" | "below"> = {
	idea: "below",
	truth: "above",
	mirror: "above",
	layer: "above",
	link: "above",
	changeset: "above",
	phase: "above",
};

/** A single head row of a record table, with a compact JSONB preview. */
export interface RecordRow {
	id: string;
	version: string;
	supersededBy: string | null;
	createdAt: string;
	/** Canonical JSONB body, compacted to a single line for the table preview. */
	bodyPreview: string;
}

/** One card per kind: its table, count, authority badge, and head rows. */
export interface RecordTypeView {
	kind: RecordKind;
	table: string;
	authority: "above" | "below";
	count: number;
	heads: RecordRow[];
}

export interface RecordsSnapshot {
	types: RecordTypeView[];
	source: "live" | "demo";
}

/** shortHash trims a hex digest for display (matches lib/store-data.shortHash). */
export function shortHash(h: string): string {
	return h.slice(0, 12);
}

/**
 * compactBody renders a JSONB body as a single-line preview. Postgres returns
 * jsonb as a parsed object via the `postgres` client; the demo fixture passes a
 * string or object. Either way we collapse to canonical-ish one-line JSON,
 * truncated.
 */
export function compactBody(body: unknown, max = 120): string {
	let s: string;
	if (typeof body === "string") {
		try {
			s = JSON.stringify(JSON.parse(body));
		} catch {
			s = body;
		}
	} else {
		s = JSON.stringify(body ?? {});
	}
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * EXAMPLE_BODY is the canonical empty-example body per kind, mirroring
 * records.EmptyExampleBody (Go). Used by the demo fallback so the panel shows the
 * real record shapes even with no Postgres.
 */
export const EXAMPLE_BODY: Record<RecordKind, Record<string, unknown>> = {
	idea: {
		kind: "idea",
		proposes: "",
		intent: "",
		provenance: "",
		status: "draft",
	},
	truth: {
		kind: "truth",
		statement: "",
		truth_kind: "",
		scope: "",
		verifiability: "",
		authority: "",
	},
	mirror: {
		kind: "mirror",
		reflects: "",
		test_kind: "",
		cert_language: "",
		formal_cap: null,
		authority: "",
		liveness: "",
	},
	layer: {
		kind: "layer",
		truth_artifact: "",
		owner: "",
		authority: "",
		role: "",
		sensor: "",
		zone: "",
		links: [],
		rigor: "",
		generator: null,
	},
	link: { kind: "link", link_kind: "", from: "", to: "" },
	changeset: { kind: "changeset", message: "", status: "DRAFT", members: [] },
	phase: { kind: "phase", selection: [], green: false },
};

/**
 * demoSnapshot is the deterministic fallback dataset (no live DB required). One
 * empty-example head row per kind mirrors records.EmptyExampleBody so the panel
 * shows the canonical record shapes even with no Postgres. The ids are literal
 * "demo-<kind>" placeholders (NOT real content hashes) — the demo badge makes
 * that explicit; nothing here is written anywhere.
 */
export function demoSnapshot(): RecordsSnapshot {
	const types: RecordTypeView[] = RECORD_KINDS.map((kind) => ({
		kind,
		table: TABLE_OF[kind],
		authority: AUTHORITY_OF[kind],
		count: 1,
		heads: [
			{
				id: `demo-${kind}`,
				version: `demo-${kind}`,
				supersededBy: null,
				createdAt: "2026-05-30T00:00:00Z",
				bodyPreview: compactBody(EXAMPLE_BODY[kind]),
			},
		],
	}));

	return { types, source: "demo" };
}
