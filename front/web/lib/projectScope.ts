import { contentAddress } from "./project";

/**
 * projectScope.ts — the deterministic TS twin of back/archive/projectscope (S54).
 *
 * S54 threads a `project_id` FK through every truth + derived table
 * (kernel·mirrors·ideas·changesets·dag·brain·context) and backfills the pre-S54
 * singleton graph (the Order demo) into the reserved seed project __system__.
 *
 * This module mirrors the Go authority BYTE-FOR-BYTE:
 *  - SCOPED_TABLES is the same CLOSED, ordered set;
 *  - scopedSelect builds the same parameterised scoped read SQL (always
 *    `WHERE project_id = $1`), so a query scoped to project A can never return a
 *    project B row;
 *  - systemSeed() produces the SAME content-addressed __system__ id the Go pins in
 *    the migration (reusing project.ts canonicalBody+sha256Hex — the S01/S02
 *    content-address scheme).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6): pure functions, same input → same output
 * (pinned by the Vitest+fast-check twin lib/projectScope.test.ts). The Go package
 * is authoritative; this twin must match it. THE WALL: project_id is a scope
 * column, not a write door — nothing here writes truth.
 */

export interface ScopedTable {
	schema: string;
	table: string;
}

/** SCOPED_TABLES mirrors Go projectscope.ScopedTables() (CLAUDE.md §1 order). */
export const SCOPED_TABLES: ScopedTable[] = [
	{ schema: "kernel", table: "truth" },
	{ schema: "kernel", table: "layer" },
	{ schema: "kernel", table: "link" },
	{ schema: "mirrors", table: "mirror" },
	{ schema: "ideas", table: "idea" },
	{ schema: "changesets", table: "changeset" },
	{ schema: "dag", table: "phase" },
	{ schema: "brain", table: "memory_item" },
	{ schema: "context", table: "context_graph_decision" },
];

/** qualified mirrors Go ScopedTable.Qualified() — "schema.table". */
export function qualified(s: ScopedTable): string {
	return `${s.schema}.${s.table}`;
}

/** fkName mirrors Go ScopedTable.FKName(). */
export function fkName(s: ScopedTable): string {
	return `${s.schema}_${s.table}_project_fk`;
}

/** indexName mirrors Go ScopedTable.IndexName(). */
export function indexName(s: ScopedTable): string {
	return `${s.schema}_${s.table}_project_idx`;
}

/** isScoped mirrors Go projectscope.IsScoped — is (schema, table) in the closed set? */
export function isScoped(schema: string, table: string): boolean {
	return SCOPED_TABLES.some((s) => s.schema === schema && s.table === table);
}

/**
 * scopedSelect mirrors Go projectscope.ScopedSelect: the deterministic,
 * parameterised, project-scoped read SQL — always `WHERE project_id = $1` so a
 * scoped read can never leak another project's row. Throws on an off-set table
 * (no fabricated scope), exactly like the Go error.
 */
export function scopedSelect(schema: string, table: string): string {
	if (!isScoped(schema, table)) {
		throw new Error(
			`projectscope: ${schema}.${table} is not a project-scoped table`,
		);
	}
	return `SELECT * FROM ${schema}.${table} WHERE project_id = $1`;
}

/** The reserved seed identity (mirrors Go SystemSlug / SystemOwner). */
export const SYSTEM_SLUG = "__system__";
export const SYSTEM_OWNER = "__aidos__";
const SYSTEM_NAME = "AIDOS System (Order demo)";
const SYSTEM_CREATED_AT = "1970-01-01T00:00:00Z";
export const SYSTEM_GENESIS_NODE = `${SYSTEM_SLUG}-genesis`;

export interface SeedProject {
	id: string;
	slug: string;
	name: string;
	ownerRef: string;
	createdAt: string;
	lifecycle: "active";
	genesisNode: string;
}

/**
 * systemSeed mirrors Go projectscope.SystemSeed(): the content-addressed
 * __system__ seed project, id == sha256Hex(canonicalBody(...)) using the SAME
 * S53 content-address scheme (project.ts). The id MUST equal the hash the Go
 * migration pins (asserted in the twin against the Go-computed value).
 */
export function systemSeed(): SeedProject {
	const fields = {
		slug: SYSTEM_SLUG,
		name: SYSTEM_NAME,
		ownerRef: SYSTEM_OWNER,
		createdAt: SYSTEM_CREATED_AT,
		lifecycle: "active" as const,
	};
	const id = contentAddress(fields);
	return { id, ...fields, genesisNode: SYSTEM_GENESIS_NODE };
}
