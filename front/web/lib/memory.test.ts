import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Backend,
	KINDS,
	type Kind,
	type MemoryItem,
	recall,
} from "./memory";
import { EXAMPLE_QUERY, SEED_MEMORIES } from "./memory-data";

// Reproducibility mirror (twin of back/archive/brain/memory rapid property): the TS recall core
// obeys the SAME Store contract as the Go engine. fast-check pins the invariants.

const KIND_ARB = fc.constantFrom<Kind>(...KINDS);
const itemArb = fc.record({
	id: fc.string({ minLength: 1, maxLength: 8 }),
	kind: KIND_ARB,
	content: fc.string({ minLength: 1, maxLength: 40 }),
	provenance: fc.string({ maxLength: 12 }),
	validityScope: fc.constant(""),
	expiresAt: fc.constant(""),
	confidence: fc.float({ min: 0, max: 1, noNaN: true }),
	taint: fc.constant([] as MemoryItem["taint"]),
	branch: fc.constantFrom("main", "branch-x", "branch-y"),
});

describe("memory recall — the Store contract twin", () => {
	it("returns at most k hits, ordered by score descending", () => {
		fc.assert(
			fc.property(
				fc.array(itemArb, { minLength: 1, maxLength: 12 }),
				fc.integer({ min: 0, max: 10 }),
				(items, k) => {
					const hits = recall("mock", items, { queryText: "cart basket", k });
					expect(hits.length).toBeLessThanOrEqual(k);
					for (let i = 1; i < hits.length; i++) {
						expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
					}
				},
			),
		);
	});

	it("honours the kind and branch filters", () => {
		fc.assert(
			fc.property(
				fc.array(itemArb, { minLength: 1, maxLength: 12 }),
				KIND_ARB,
				fc.constantFrom("main", "branch-x"),
				(items, kind, branch) => {
					const hits = recall("mock", items, {
						queryText: "cart",
						kind,
						branch,
						k: 20,
					});
					for (const h of hits) {
						expect(h.item.kind).toBe(kind);
						expect(h.item.branch).toBe(branch);
					}
				},
			),
		);
	});

	it("is deterministic — same query yields the same ordering", () => {
		fc.assert(
			fc.property(
				fc.array(itemArb, { minLength: 1, maxLength: 12 }),
				(items) => {
					const a = recall("mock", items, { queryText: "cart basket", k: 5 });
					const b = recall("mock", items, { queryText: "cart basket", k: 5 });
					expect(a.map((h) => h.item.id)).toEqual(b.map((h) => h.item.id));
				},
			),
		);
	});
});

describe("memory recall — the worked example + backend interchangeability", () => {
	it("ranks the semantic cart term first for 'shopping cart'", () => {
		const hits = recall("mock", SEED_MEMORIES, {
			queryText: EXAMPLE_QUERY,
			k: 2,
		});
		expect(hits.length).toBe(2);
		expect(hits[0].item.kind).toBe("semantic");
	});

	it("returns the SAME top hit across both backends (the injection seam)", () => {
		const backends: Backend[] = ["mock", "real"];
		const tops = backends.map(
			(b) =>
				recall(b, SEED_MEMORIES, { queryText: EXAMPLE_QUERY, k: 1 })[0].item.id,
		);
		expect(tops[0]).toBe(tops[1]);
	});

	it("the branch filter excludes the branch-x semantic row", () => {
		const hits = recall("mock", SEED_MEMORIES, {
			queryText: "shopping cart",
			kind: "semantic",
			branch: "main",
			k: 5,
		});
		expect(
			hits.every((h) => h.item.branch === "main" && h.item.kind === "semantic"),
		).toBe(true);
		expect(hits.some((h) => h.item.id === "se-cart-branchx")).toBe(false);
	});
});
