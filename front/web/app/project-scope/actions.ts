"use server";

import {
	fkName,
	indexName,
	isScoped,
	qualified,
	SCOPED_TABLES,
	SYSTEM_GENESIS_NODE,
	scopedSelect,
	systemSeed,
} from "@/lib/projectScope";

/**
 * /project-scope Server Actions (S54). Every action is a PURE, DETERMINISTIC
 * projection over lib/projectScope (the TS twin of back/archive/projectscope) —
 * no DB, no clock, no LLM (determinism-first, CLAUDE.md §6). They render the S54
 * scope decisions so the panel is action-capable WITHOUT touching truth: the wall
 * is unchanged (project_id is a scope column, not a write door). The live MCP /
 * gateway path arrives at S58; until then these reads are computed from the
 * authoritative closed set, byte-identical to the Go.
 */

export interface ScopedTableView {
	schema: string;
	table: string;
	qualified: string;
	fkName: string;
	indexName: string;
	scopedSelect: string;
}

export interface SeedView {
	id: string;
	slug: string;
	name: string;
	ownerRef: string;
	createdAt: string;
	lifecycle: string;
	genesisNode: string;
}

export interface ScopeSnapshot {
	source: "live" | "demo";
	seed: SeedView;
	tables: ScopedTableView[];
}

/** snapshot returns the full S54 scope view (seed + every scoped table + its SQL). */
export async function snapshot(): Promise<ScopeSnapshot> {
	const seed = systemSeed();
	const tables: ScopedTableView[] = SCOPED_TABLES.map((s) => ({
		schema: s.schema,
		table: s.table,
		qualified: qualified(s),
		fkName: fkName(s),
		indexName: indexName(s),
		scopedSelect: scopedSelect(s.schema, s.table),
	}));
	return {
		// "demo" until S58 wires the live gateway; the values are still the
		// authoritative deterministic projection (not a stub).
		source: "demo",
		seed: { ...seed, genesisNode: SYSTEM_GENESIS_NODE },
		tables,
	};
}

export interface ScopedSelectResult {
	ok: boolean;
	sql?: string;
	error?: string;
}

/**
 * buildScopedSelect is the action-capable control behind the panel's "build
 * scoped read" button: given a (schema, table) it returns the deterministic
 * scoped read SQL, or an honest error for an off-set table (no fabricated scope).
 */
export async function buildScopedSelect(
	schema: string,
	table: string,
): Promise<ScopedSelectResult> {
	if (!isScoped(schema, table)) {
		return {
			ok: false,
			error: `projectscope: ${schema}.${table} is not a project-scoped table`,
		};
	}
	return { ok: true, sql: scopedSelect(schema, table) };
}
