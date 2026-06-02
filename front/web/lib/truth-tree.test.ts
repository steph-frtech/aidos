/**
 * Reproducibility mirror (∀) for the compositional-truth aggregate projection (lib/truth-tree.ts),
 * the TS twin of back/kernel/composes' rapid property test. fast-check is the frozen front
 * invariant slot (ADR 0003). It pins KRD §109–§112: the law holds at every node, monotone
 * reddening, cosmetic isolation below threshold, totality, and the typed cycle guard.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	activation,
	aggregate,
	type Composes,
	isCycleError,
	type Node,
	reopensOnChange,
	type Tree,
	type Verdict,
} from "./truth-tree";

// genDAG builds a random finite DAG over n nodes "n0".."n{n-1}": an edge i→j is only added with
// i < j (a topological pre-order ⇒ acyclic by construction). Each node draws own_mirror, each edge
// a weight, each node a threshold from the declared set.
const genDAG = fc
	.integer({ min: 1, max: 6 })
	.chain((n) =>
		fc.record({
			n: fc.constant(n),
			reds: fc.array(fc.boolean(), { minLength: n, maxLength: n }),
			thresholds: fc.array(fc.constantFrom(0, 1, 2), {
				minLength: n,
				maxLength: n,
			}),
			edgeFlags: fc.array(fc.boolean(), {
				minLength: (n * n) | 0,
				maxLength: (n * n) | 0,
			}),
			cosmeticFlags: fc.array(fc.boolean(), {
				minLength: (n * n) | 0,
				maxLength: (n * n) | 0,
			}),
		}),
	)
	.map(({ n, reds, thresholds, edgeFlags, cosmeticFlags }) => {
		const nodes: Record<string, Node> = {};
		const ids: string[] = [];
		for (let i = 0; i < n; i++) {
			const id = `n${i}`;
			ids.push(id);
			nodes[id] = {
				layerId: id,
				version: "v1",
				ownMirror: reds[i] ? "RED" : "GREEN",
				activationThreshold: thresholds[i],
			};
		}
		const edges: Composes[] = [];
		for (let i = 0; i < n; i++) {
			for (let j = i + 1; j < n; j++) {
				const k = i * n + j;
				if (edgeFlags[k]) {
					edges.push({
						parent: { id: ids[i], version: "v1" },
						child: { id: ids[j], version: "v1" },
						weight: cosmeticFlags[k] ? "cosmetic" : "load-bearing",
					});
				}
			}
		}
		return { tree: { nodes, edges } as Tree, ids };
	});

describe("truth-tree aggregate — the recursive law (KRD §109)", () => {
	it("Aggregate(L)==GREEN ⟺ own_mirror(L)==GREEN ∧ ∀ child: Aggregate(child)==GREEN", () => {
		fc.assert(
			fc.property(genDAG, ({ tree, ids }) => {
				for (const id of ids) {
					const res = aggregate(tree, id);
					let wantGreen = tree.nodes[id].ownMirror === "GREEN";
					for (const e of tree.edges) {
						if (e.parent.id !== id) continue;
						if (aggregate(tree, e.child.id).verdict !== "GREEN")
							wantGreen = false;
					}
					expect(res.verdict === "GREEN").toBe(wantGreen);
				}
			}),
		);
	});

	it("is total: every node aggregates to GREEN or RED (never a third), never throws on a DAG", () => {
		fc.assert(
			fc.property(genDAG, ({ tree, ids }) => {
				for (const id of ids) {
					const v: Verdict = aggregate(tree, id).verdict;
					expect(v === "GREEN" || v === "RED").toBe(true);
				}
			}),
		);
	});

	it("monotone reddening: flipping one GREEN node to RED never turns a RED ancestor GREEN", () => {
		fc.assert(
			fc.property(genDAG, ({ tree, ids }) => {
				const before: Record<string, Verdict> = {};
				for (const id of ids) before[id] = aggregate(tree, id).verdict;
				const flip = ids.find((id) => tree.nodes[id].ownMirror === "GREEN");
				if (flip === undefined) return;
				const flipped: Tree = {
					...tree,
					nodes: {
						...tree.nodes,
						[flip]: { ...tree.nodes[flip], ownMirror: "RED" },
					},
				};
				for (const id of ids) {
					const after = aggregate(flipped, id).verdict;
					if (before[id] === "RED") expect(after).toBe("RED");
				}
			}),
		);
	});
});

describe("truth-tree §112 weighted activation", () => {
	it("a cosmetic change contributes 0 and stays below a positive threshold (cosmetic isolation)", () => {
		fc.assert(
			fc.property(fc.constantFrom(1, 2), (thr) => {
				const tree: Tree = {
					nodes: {
						P: {
							layerId: "P",
							version: "v1",
							ownMirror: "GREEN",
							activationThreshold: thr,
						},
						K: {
							layerId: "K",
							version: "v1",
							ownMirror: "GREEN",
							activationThreshold: 0,
						},
						L: {
							layerId: "L",
							version: "v1",
							ownMirror: "GREEN",
							activationThreshold: 0,
						},
					},
					edges: [
						{
							parent: { id: "P", version: "v1" },
							child: { id: "K", version: "v1" },
							weight: "cosmetic",
						},
						{
							parent: { id: "P", version: "v1" },
							child: { id: "L", version: "v1" },
							weight: "load-bearing",
						},
					],
					changed: ["K"],
				};
				expect(activation(tree, "P")).toBe(0);
				expect(reopensOnChange(tree, "P")).toBe(false);
				expect(aggregate(tree, "P").verdict).toBe("GREEN");
				const loadChanged: Tree = { ...tree, changed: ["L"] };
				expect(activation(loadChanged, "P")).toBe(1);
				if (thr <= 1) expect(reopensOnChange(loadChanged, "P")).toBe(true);
			}),
		);
	});
});

describe("truth-tree cycle guard (KRD §82)", () => {
	it("a cycle throws a typed CycleError, never an infinite recursion", () => {
		const tree: Tree = {
			nodes: {
				a: {
					layerId: "a",
					version: "v1",
					ownMirror: "GREEN",
					activationThreshold: 1,
				},
				b: {
					layerId: "b",
					version: "v1",
					ownMirror: "GREEN",
					activationThreshold: 1,
				},
			},
			edges: [
				{
					parent: { id: "a", version: "v1" },
					child: { id: "b", version: "v1" },
					weight: "load-bearing",
				},
				{
					parent: { id: "b", version: "v1" },
					child: { id: "a", version: "v1" },
					weight: "load-bearing",
				},
			],
		};
		try {
			aggregate(tree, "a");
			expect.unreachable("a cycle must throw");
		} catch (e) {
			expect(isCycleError(e)).toBe(true);
		}
	});
});

describe("truth-tree fixture rows (the materialized journey)", () => {
	const base = (own: Record<string, Verdict>, changed: string[]): Tree => ({
		nodes: {
			P: {
				layerId: "P",
				version: "v1",
				ownMirror: own.P,
				activationThreshold: 1,
			},
			C1: {
				layerId: "C1",
				version: "v1",
				ownMirror: own.C1,
				activationThreshold: 0,
			},
			C2: {
				layerId: "C2",
				version: "v1",
				ownMirror: own.C2,
				activationThreshold: 0,
			},
		},
		edges: [
			{
				parent: { id: "P", version: "v1" },
				child: { id: "C1", version: "v1" },
				weight: "load-bearing",
			},
			{
				parent: { id: "P", version: "v1" },
				child: { id: "C2", version: "v1" },
				weight: "cosmetic",
			},
		],
		changed,
	});

	it("row 1 — all green ⇒ GREEN", () => {
		expect(
			aggregate(base({ P: "GREEN", C1: "GREEN", C2: "GREEN" }, []), "P")
				.verdict,
		).toBe("GREEN");
	});
	it("row 2 — a red load-bearing child reddens the parent + drill-down names C1 (THE done criterion)", () => {
		const res = aggregate(
			base({ P: "GREEN", C1: "RED", C2: "GREEN" }, ["C1"]),
			"P",
		);
		expect(res.verdict).toBe("RED");
		expect(res.drillDown.some((s) => s.layerId === "C1")).toBe(true);
	});
	it("row 3 — a red own mirror ⇒ RED even with all children green", () => {
		expect(
			aggregate(base({ P: "RED", C1: "GREEN", C2: "GREEN" }, []), "P").verdict,
		).toBe("RED");
	});
	it("row 4 — a cosmetic change below threshold leaves the parent GREEN", () => {
		expect(
			aggregate(base({ P: "GREEN", C1: "GREEN", C2: "GREEN" }, ["C2"]), "P")
				.verdict,
		).toBe("GREEN");
	});
});
