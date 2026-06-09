/**
 * Reproducibility mirror (∀) for the caused_by causal-edge projection lib/caused-by.ts (FK12).
 * cert_language=fast-check (the frozen front invariant slot, ADR 0003). It pins the same
 * invariants as the Go rapid mirror back/kernel/causedby/causedby_property_test.go — the twin must
 * not drift from the source:
 *
 *  1. validate accepts iff from/to pinned AND from.id != to.id.
 *  2. trace is DETERMINISTIC — same (symptom, edges) ⇒ byte-identical result.
 *  3. the chain never contains the symptom.
 *  4. on an acyclic graph the chain is EXACTLY the upward-reachable set.
 *  5. the chain is ordered (distance asc, id asc) and duplicate-free.
 *  6. a cycle reachable from the symptom ⇒ { ok:false, ERR_CYCLE }; acyclic ⇒ ok.
 *  7. serializeEdgeBody round-trips the edge fields (content-addressed body shape).
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Edge,
	ERR_CYCLE,
	type Ref,
	serializeEdgeBody,
	trace,
	validate,
} from "./caused-by";

const NODES = ["n0", "n1", "n2", "n3", "n4"] as const;
const VERS = ["v1", "v2", "v3"] as const;

const refArb: fc.Arbitrary<Ref> = fc.record({
	id: fc.constantFrom(...NODES),
	version: fc.constantFrom(...VERS),
});
const edgeArb: fc.Arbitrary<Edge> = fc.record({ from: refArb, to: refArb });
const edgesArb: fc.Arbitrary<Edge[]> = fc.array(edgeArb, { maxLength: 8 });
const symptomArb = fc.constantFrom(...NODES);

// oracle: the upward-reachable cause set (skipping self/invalid edges, as trace does).
function reachableSet(symptom: string, edges: Edge[]): Set<string> {
	const adj = new Map<string, string[]>();
	for (const e of edges) {
		if (validate(e) !== null) continue;
		(adj.get(e.from.id) ?? adj.set(e.from.id, []).get(e.from.id)!).push(
			e.to.id,
		);
	}
	const seen = new Set<string>([symptom]);
	const stack = [symptom];
	while (stack.length > 0) {
		const node = stack.pop()!;
		for (const c of adj.get(node) ?? []) {
			if (!seen.has(c)) {
				seen.add(c);
				stack.push(c);
			}
		}
	}
	seen.delete(symptom);
	return seen;
}

// oracle: cycle reachable from the symptom (white/grey/black DFS).
function hasCycleFrom(symptom: string, edges: Edge[]): boolean {
	const adj = new Map<string, string[]>();
	for (const e of edges) {
		if (validate(e) !== null) continue;
		(adj.get(e.from.id) ?? adj.set(e.from.id, []).get(e.from.id)!).push(
			e.to.id,
		);
	}
	const color = new Map<string, number>();
	const dfs = (node: string): boolean => {
		color.set(node, 1);
		for (const c of adj.get(node) ?? []) {
			const cc = color.get(c) ?? 0;
			if (cc === 1) return true;
			if (cc === 0 && dfs(c)) return true;
		}
		color.set(node, 2);
		return false;
	};
	return dfs(symptom);
}

describe("caused-by validate (invariant 1)", () => {
	it("accepts iff pinned and not a self-edge", () => {
		fc.assert(
			fc.property(edgeArb, (e) => {
				const ok = validate(e) === null;
				const want =
					e.from.id !== "" &&
					e.from.version !== "" &&
					e.to.id !== "" &&
					e.to.version !== "" &&
					e.from.id !== e.to.id;
				expect(ok).toBe(want);
			}),
		);
	});

	it("rejects a self-edge", () => {
		expect(
			validate({
				from: { id: "n0", version: "v1" },
				to: { id: "n0", version: "v2" },
			}),
		).toBe("SELF_CAUSE");
	});

	it("rejects an unpinned cause", () => {
		expect(
			validate({
				from: { id: "n0", version: "v1" },
				to: { id: "n1", version: "" },
			}),
		).toBe("UNPINNED_TO");
	});
});

describe("caused-by trace (invariants 2-6)", () => {
	it("is deterministic", () => {
		fc.assert(
			fc.property(symptomArb, edgesArb, (s, edges) => {
				expect(trace(s, edges)).toStrictEqual(trace(s, edges));
			}),
		);
	});

	it("on an acyclic graph: chain == reachable set, excludes symptom, no dups", () => {
		fc.assert(
			fc.property(symptomArb, edgesArb, (s, edges) => {
				if (hasCycleFrom(s, edges)) return;
				const r = trace(s, edges);
				expect(r.ok).toBe(true);
				if (!r.ok) return;
				const want = reachableSet(s, edges);
				expect(new Set(r.chain.causes)).toStrictEqual(want);
				expect(r.chain.causes).not.toContain(s);
				expect(new Set(r.chain.causes).size).toBe(r.chain.causes.length);
			}),
		);
	});

	it("refuses a cycle reachable from the symptom", () => {
		fc.assert(
			fc.property(symptomArb, edgesArb, (s, edges) => {
				const r = trace(s, edges);
				if (hasCycleFrom(s, edges)) {
					expect(r.ok).toBe(false);
					if (!r.ok) expect(r.error).toBe(ERR_CYCLE);
				} else {
					expect(r.ok).toBe(true);
				}
			}),
		);
	});
});

describe("caused-by fixture (the §17 worked example)", () => {
	const ref = (id: string): Ref => ({ id, version: "v1" });
	const example: Edge[] = [
		{ from: ref("checkout-accept"), to: ref("createOrder") },
		{ from: ref("createOrder"), to: ref("Order") },
		{ from: ref("createOrder"), to: ref("authzPolicy") },
		{ from: ref("Order"), to: ref("add_total_col") },
	];

	it("produces the ordered cause chain (nearest first, ties by id)", () => {
		const r = trace("checkout-accept", example);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.chain.causes).toStrictEqual([
				"createOrder",
				"Order",
				"authzPolicy",
				"add_total_col",
			]);
		}
	});

	it("a root cause has no further causes", () => {
		const r = trace("add_total_col", example);
		expect(r.ok && r.chain.causes.length === 0).toBe(true);
	});

	it("refuses the cyclic variant", () => {
		const cyclic: Edge[] = [
			{ from: ref("checkout-accept"), to: ref("createOrder") },
			{ from: ref("createOrder"), to: ref("Order") },
			{ from: ref("Order"), to: ref("createOrder") },
		];
		const r = trace("checkout-accept", cyclic);
		expect(r.ok).toBe(false);
	});
});

describe("caused-by serialize round-trip (invariant 7)", () => {
	it("emits the canonical kernel.link body carrying the caused_by kind", () => {
		const e: Edge = {
			from: { id: "a", version: "v1" },
			to: { id: "b", version: "v1" },
		};
		const body = JSON.parse(serializeEdgeBody(e));
		expect(body.kind).toBe("link");
		expect(body.link_kind).toBe("caused_by");
		expect(body.from).toStrictEqual(e.from);
		expect(body.to).toStrictEqual(e.to);
	});

	it("a changed cause version yields a different body", () => {
		const a = serializeEdgeBody({
			from: { id: "a", version: "v1" },
			to: { id: "b", version: "v1" },
		});
		const b = serializeEdgeBody({
			from: { id: "a", version: "v1" },
			to: { id: "b", version: "v2" },
		});
		expect(a).not.toBe(b);
	});
});
