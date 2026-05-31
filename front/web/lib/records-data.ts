import postgres from "postgres";
import {
	AUTHORITY_OF,
	compactBody,
	demoSnapshot,
	RECORD_KINDS,
	type RecordsSnapshot,
	type RecordTypeView,
	TABLE_OF,
} from "./records-types";

/**
 * Read-only projection of the KRDCore record schemas for the /records Workbench
 * panel. It reads the LIVE Postgres truth-store — the seven content-addressed,
 * append-only JSONB record tables created by the S02 migration
 * (back/migrations/kernel_records_baseline.sql) — when
 * POSTGRES_CONNECTION_STRING is reachable, and falls back to a deterministic
 * demo fixture (one empty-example head row per kind, mirroring
 * records.EmptyExampleSet — see lib/records-types.ts) when it is not, so the
 * panel and its Playwright e2e stay autonomous if no DB is up.
 *
 * This module is SERVER-ONLY: it imports the `postgres` client. The client-safe
 * types + pure helpers live in lib/records-types.ts (no node:* / postgres
 * import) so the client component can use them without dragging net/tls/fs into
 * the browser bundle.
 *
 * THE WALL (CLAUDE.md §2). These record tables are TRUTH, ABOVE the line. The
 * agent DB role has **SELECT only** on them — this module reads, it NEVER
 * writes. There is no write path here: a truth-write is reachable only through
 * the governed propose → ChangeSet → human-approval flow, built at S20
 * (changesets) / S27 (ideas). Until then the /records screen surfaces that
 * control as PRESENT but disabled (« à venir (S20) »); it never writes a
 * kernel/mirrors/ideas/changesets/dag row from the Workbench.
 */

export type {
	RecordKind,
	RecordRow,
	RecordsSnapshot,
	RecordTypeView,
} from "./records-types";
// Re-export the client-safe surface so existing importers keep working.
export {
	AUTHORITY_OF,
	RECORD_KINDS,
	shortHash,
	TABLE_OF,
} from "./records-types";

let sql: ReturnType<typeof postgres> | null = null;
function client(): ReturnType<typeof postgres> | null {
	const dsn = process.env.POSTGRES_CONNECTION_STRING;
	if (!dsn) return null;
	if (!sql) {
		sql = postgres(dsn, { max: 2, idle_timeout: 20, connect_timeout: 8 });
	}
	return sql;
}

/**
 * snapshot reads the live KRDCore record tables (SELECT only — the wall). For
 * each kind it counts the rows and lists the head rows (superseded_by IS NULL),
 * newest first, with a compact JSONB preview. On any failure (no DSN, DB
 * unreachable, schema absent) it returns the demo fixture so the panel is never
 * blank and the e2e stays autonomous.
 */
export async function snapshot(): Promise<RecordsSnapshot> {
	const c = client();
	if (!c) return demoSnapshot();
	try {
		const types: RecordTypeView[] = [];
		for (const kind of RECORD_KINDS) {
			const table = TABLE_OF[kind];
			// table is from the closed TABLE_OF map (never user input) — safe to
			// interpolate as an unsafe SQL fragment for the schema-qualified name.
			const countRows = await c<{ n: string }[]>`
				select count(*)::text as n from ${c.unsafe(table)}`;
			const count = Number(countRows[0]?.n ?? "0");

			const heads = await c<
				{
					id: string;
					version: string;
					superseded_by: string | null;
					created_at: Date;
					body: unknown;
				}[]
			>`
				select id, version, superseded_by, created_at, body
				from ${c.unsafe(table)}
				where superseded_by is null
				order by created_at desc, id
				limit 5`;

			types.push({
				kind,
				table,
				authority: AUTHORITY_OF[kind],
				count,
				heads: heads.map((r) => ({
					id: r.id,
					version: r.version,
					supersededBy: r.superseded_by ?? null,
					createdAt: new Date(r.created_at).toISOString(),
					bodyPreview: compactBody(r.body),
				})),
			});
		}
		return { types, source: "live" };
	} catch (err) {
		console.warn(
			"[/records] live read failed, using demo fixture:",
			(err as Error).message,
		);
		return demoSnapshot();
	}
}
