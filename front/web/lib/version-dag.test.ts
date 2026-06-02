import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	ancestors,
	branch,
	checkoutAncestor,
	type Dag,
	heads,
	isReachable,
	type MoveResult,
	node,
	rebranch,
} from "./version-dag";

/**
 * Reproducibility / invariant mirror for lib/version-dag.ts (fast-check) — the front-end twin of the
 * Go rapid property mirror (back/archive/dag). For ANY branch/checkout/rebranch sequence:
 *   - the DAG only GROWS (node/edge counts non-decreasing — append-only, §120);
 *   - the structure stays a DAG (no cycle);
 *   - every prior node stays present (nothing is destroyed);
 *   - checkout is a head-flag move (no node/edge added or removed);
 *   - rebranch parents the new node on the ancestor;
 *   - the DAG always has at least one head, may have several (§125).
 */

const seed: Dag = {
	nodes: [
		{ id: "v0", parentIds: [], head: true, stratum: "above", label: "root" },
	],
	edges: [],
};

describe("version-dag movement functions (§120–§125)", () => {
	it("the canonical §120 fixture: branch, checkout-ancestor, rebranch — append-only", () => {
		// v0 -> branch v1 -> branch v2 ; branch w1 off v1 ; checkout v1 ; rebranch v2a off v1.
		const b1 = branch(seed, "v0", "main-line", "cs-v0-v1");
		const v1 = b1.newNode as string;
		const b2 = branch(b1.dag, v1, "line-2", "cs-v1-v2");
		const v2 = b2.newNode as string;
		const b3 = branch(b2.dag, v1, "tva-eu-variant", "cs-v1-w1");
		// two parallel heads off v1 (§125): v2 and w1.
		expect(heads(b3.dag).length).toBe(2);

		const nodesBefore = b3.dag.nodes.length;
		const co = checkoutAncestor(b3.dag, v1);
		expect(co.event).toBe("HeadMoved");
		expect(node(co.dag, v1)?.head).toBe(true);
		expect(node(co.dag, v2)).not.toBeNull(); // abandoned line stays
		expect(co.dag.nodes.length).toBe(nodesBefore); // head-flag move only

		const rb = rebranch(co.dag, v1, "v2a-line", "cs-v1-v2a");
		expect(rb.event).toBe("Rebranched");
		expect(node(rb.dag, v2)).not.toBeNull(); // THE done case: abandoned line never destroyed
		expect(isReachable(rb.dag, "v0", rb.newNode as string)).toBe(true);
	});

	it("only grows, stays a DAG, never deletes, always has a head", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({ op: fc.integer({ min: 0, max: 2 }), pick: fc.nat() }),
					{
						maxLength: 14,
					},
				),
				(cmds) => {
					let d = seed;
					for (const c of cmds) {
						const ids = d.nodes.map((n) => n.id);
						const target = ids[c.pick % ids.length];
						const before = { n: d.nodes.length, e: d.edges.length };
						const cs = `cs-${c.pick}`;
						const r: MoveResult =
							c.op === 0
								? branch(d, target, "b", cs)
								: c.op === 1
									? checkoutAncestor(d, target)
									: rebranch(d, target, "r", cs);
						if (r.blocked) continue;
						// only grows.
						expect(r.dag.nodes.length).toBeGreaterThanOrEqual(before.n);
						expect(r.dag.edges.length).toBeGreaterThanOrEqual(before.e);
						// every prior node present.
						for (const id of ids) expect(node(r.dag, id)).not.toBeNull();
						// no cycle.
						for (const id of r.dag.nodes.map((n) => n.id)) {
							expect(isReachable(r.dag, id, id)).toBe(false);
						}
						// at least one head.
						expect(heads(r.dag).length).toBeGreaterThanOrEqual(1);
						d = r.dag;
					}
					return true;
				},
			),
			{ numRuns: 200 },
		);
	});

	it("checkout is a pure head-flag move (no node/edge added or removed)", () => {
		const b1 = branch(seed, "v0", "a", "c1");
		const b2 = branch(b1.dag, b1.newNode as string, "b", "c2");
		const before = { n: b2.dag.nodes.length, e: b2.dag.edges.length };
		const co = checkoutAncestor(b2.dag, "v0");
		expect(co.dag.nodes.length).toBe(before.n);
		expect(co.dag.edges.length).toBe(before.e);
		expect(node(co.dag, "v0")?.head).toBe(true);
	});

	it("rebranch parents the new node on the ancestor", () => {
		const b1 = branch(seed, "v0", "a", "c1");
		const rb = rebranch(b1.dag, "v0", "r", "c2");
		expect(node(rb.dag, rb.newNode as string)?.parentIds).toContain("v0");
		expect(ancestors(rb.dag, rb.newNode as string)).toContain("v0");
	});
});
