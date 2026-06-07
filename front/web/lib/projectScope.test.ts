import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	fkName,
	indexName,
	isScoped,
	qualified,
	SCOPED_TABLES,
	SYSTEM_GENESIS_NODE,
	scopedSelect,
	systemSeed,
} from "./projectScope";

/**
 * projectScope.test.ts — the Vitest + fast-check twin proving the front S54 scope
 * twin matches the Go authority (back/archive/projectscope) byte-for-byte:
 *  - the seed __system__ id equals the hash the Go migration PINS;
 *  - scopedSelect ALWAYS carries `WHERE project_id = $1` and refuses off-set tables;
 *  - it is pure (same input → same SQL);
 *  - the closed scoped-table set is exactly the nine Go tables.
 */

// The Go-computed (records.Hash) content address of the __system__ seed, pinned in
// back/migrations/project_scope_baseline.sql. The twin MUST match it.
const GO_SEED_ID =
	"1a4332ab3616ddfb699b668ae4a4078593231e5f996e6b8f1fd1e44b6a4c5004";

describe("S54 project-scope twin", () => {
	it("the __system__ seed is content-addressed to the Go-pinned id", () => {
		const seed = systemSeed();
		expect(seed.id).toBe(GO_SEED_ID);
		expect(seed.slug).toBe("__system__");
		expect(seed.ownerRef).toBe("__aidos__");
		expect(seed.lifecycle).toBe("active");
		expect(seed.genesisNode).toBe(SYSTEM_GENESIS_NODE);
		// Re-deriving is stable (no clock).
		expect(systemSeed().id).toBe(seed.id);
	});

	it("scopes exactly the nine truth+derived tables in CLAUDE.md §1 order", () => {
		expect(SCOPED_TABLES.map(qualified)).toEqual([
			"kernel.truth",
			"kernel.layer",
			"kernel.link",
			"mirrors.mirror",
			"ideas.idea",
			"changesets.changeset",
			"dag.phase",
			"brain.memory_item",
			"context.context_graph_decision",
		]);
	});

	it("derives deterministic FK + index names per table", () => {
		const t = { schema: "kernel", table: "truth" };
		expect(fkName(t)).toBe("kernel_truth_project_fk");
		expect(indexName(t)).toBe("kernel_truth_project_idx");
	});

	it("scopedSelect always carries WHERE project_id = $1 and binds exactly $1", () => {
		for (const s of SCOPED_TABLES) {
			const sql = scopedSelect(s.schema, s.table);
			expect(sql).toContain("WHERE project_id = $1");
			expect(sql).toContain(qualified(s));
			expect((sql.match(/\$/g) ?? []).length).toBe(1);
		}
	});

	it("scopedSelect is pure (same input → same SQL)", () => {
		for (const s of SCOPED_TABLES) {
			expect(scopedSelect(s.schema, s.table)).toBe(
				scopedSelect(s.schema, s.table),
			);
		}
	});

	it("refuses an off-set table rather than emitting an unscoped query", () => {
		fc.assert(
			fc.property(
				fc.stringMatching(/^[a-z]{1,8}$/),
				fc.stringMatching(/^[a-z]{1,8}$/),
				(schema, table) => {
					fc.pre(!isScoped(schema, table));
					expect(() => scopedSelect(schema, table)).toThrow();
				},
			),
		);
	});
});
