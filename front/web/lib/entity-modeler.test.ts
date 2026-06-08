/**
 * Reproducibility mirror for the entity-modeler twin (S75) — the TS side of the S75
 * property mirror (back/kernel/entities/modeler/modeler_property_test.go), pinned with
 * Vitest + fast-check. Same input ⇒ same output (determinism); the schema hash is
 * INPUT-ORDER-INVARIANT and byte-equal to the Go modeler.SchemaHash; propose yields a
 * `proposed` (DRAFT) changeset and never applies (the wall); two editors' drafts merge
 * without overwrite. The Go output is AUTHORITATIVE — these tests assert the twin
 * reproduces it.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	DEMO_BAD_DRAFT,
	DEMO_DRAFT,
	type Draft,
	type EntityNode,
	mergeDrafts,
	propose,
	schemaHash,
	validate,
} from "./entity-modeler";

// The Go-computed hash of DEMO_DRAFT (back/kernel/entities/modeler) — the cross-language pin.
const GO_DEMO_HASH =
	"a91081e16f1c65b806a2b48e09dbf49911ddee1a0dea57dc78f7075b8791c743";

const idAttr = {
	name: "id",
	type: "string" as const,
	required: true,
	identifier: true,
};
function node(name: string): EntityNode {
	return { entity: { name, attributes: [idAttr] }, relations: [] };
}

describe("entity-modeler twin (S75)", () => {
	it("1. schema hash matches the Go modeler byte-for-byte (cross-language)", () => {
		expect(schemaHash(DEMO_DRAFT)).toBe(GO_DEMO_HASH);
	});

	it("2. schema hash is deterministic and INPUT-ORDER-INVARIANT", () => {
		fc.assert(
			fc.property(
				fc.shuffledSubarray([0, 1], { minLength: 2, maxLength: 2 }),
				(order) => {
					const reordered: Draft = {
						project: DEMO_DRAFT.project,
						nodes: order.map((i) => DEMO_DRAFT.nodes[i]),
					};
					expect(schemaHash(reordered)).toBe(schemaHash(DEMO_DRAFT));
				},
			),
		);
	});

	it("3. propose produces a `proposed` (DRAFT) changeset, never applied (the wall)", () => {
		const p = propose(DEMO_DRAFT, "phase-0");
		expect(p.ok).toBe(true);
		expect(p.changeset?.status).toBe("DRAFT");
		expect(p.changeset?.spec_delta.target).toBe("entity-schema@shop");
		expect(p.changeset?.mirror_delta).toBeDefined();
		expect(p.schema_hash).toBe(GO_DEMO_HASH);
	});

	it("4. an unknown relation target is refused (never guessed)", () => {
		const cause = validate(DEMO_BAD_DRAFT);
		expect(cause).not.toBeNull();
		const p = propose(DEMO_BAD_DRAFT, "phase-0");
		expect(p.ok).toBe(false);
		expect(p.block?.how_to_fix.length).toBeGreaterThan(0);
	});

	it("5. two editors' disjoint additions BOTH survive the merge (no overwrite)", () => {
		const base: Draft = { project: "p", nodes: [node("Root")] };
		const a: Draft = { project: "p", nodes: [node("Root"), node("Alpha")] };
		const b: Draft = { project: "p", nodes: [node("Root"), node("Beta")] };
		const out = mergeDrafts(base, a, b);
		const names = out.merged.nodes.map((n) => n.entity.name);
		expect(names).toContain("Root");
		expect(names).toContain("Alpha");
		expect(names).toContain("Beta");
		expect(out.added_by_a).toContain("Alpha");
		expect(out.added_by_b).toContain("Beta");
	});

	it("6. a divergent edit on the same node is SURFACED as a conflict (not overwritten)", () => {
		const base: Draft = { project: "p", nodes: [node("X")] };
		const a: Draft = {
			project: "p",
			nodes: [
				{
					entity: {
						name: "X",
						attributes: [idAttr, { name: "a", type: "string" }],
					},
					relations: [],
				},
			],
		};
		const b: Draft = {
			project: "p",
			nodes: [
				{
					entity: {
						name: "X",
						attributes: [idAttr, { name: "b", type: "string" }],
					},
					relations: [],
				},
			],
		};
		const out = mergeDrafts(base, a, b);
		expect(out.conflicts).toContain("X");
	});

	it("7. merge is idempotent — merge(d, d, d) keeps d's node set, no conflict", () => {
		fc.assert(
			fc.property(
				fc.array(fc.constantFrom("A", "B", "C", "D"), {
					minLength: 1,
					maxLength: 4,
				}),
				(raw) => {
					const uniq = [...new Set(raw)];
					const d: Draft = { project: "p", nodes: uniq.map(node) };
					const out = mergeDrafts(d, d, d);
					expect(out.conflicts).toHaveLength(0);
					expect(out.merged.nodes.map((n) => n.entity.name).sort()).toEqual(
						[...uniq].sort(),
					);
				},
			),
		);
	});
});
