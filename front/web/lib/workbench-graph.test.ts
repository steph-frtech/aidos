/**
 * Vitest mirror of the Workbench full-graph projection (AIDOS step S44, front N4 slot).
 * It proves the SAME contract as the Go fixture/property mirror: deep-nav walk covers the
 * eight kinds, every edge resolves to a node (no invented adjacency), the legend mirrors
 * exactly the colors used, the graph_hash is content-addressed & deterministic, and a
 * dangling/unknown ref ⇒ a BlockReason, never a throw.
 */

import { describe, expect, it } from "vitest";
import { buildGraph, type Head, type NodeKind } from "./workbench-graph";
import { EXAMPLE_HEAD } from "./workbench-graph-data";

function ok(head: Head) {
	const r = buildGraph(head);
	if (!r.ok) throw new Error(`unexpected block: ${r.block.explanation}`);
	return r.graph;
}

describe("buildGraph — the Workbench full graph", () => {
	it("covers all eight node kinds (the deep-nav walk)", () => {
		const g = ok(EXAMPLE_HEAD);
		const kinds = new Set<NodeKind>(g.nodes.map((n) => n.kind));
		for (const k of [
			"button",
			"view",
			"action",
			"operation",
			"entity",
			"mirror",
			"scope",
			"incident",
		] as NodeKind[]) {
			expect(kinds.has(k)).toBe(true);
		}
	});

	it("walks the full edge path button→…→incident", () => {
		const g = ok(EXAMPLE_HEAD);
		const rels = new Set(g.edges.map((e) => e.relation));
		for (const r of [
			"in_view",
			"triggers",
			"invoke",
			"reads_writes",
			"mirrors",
			"scopes",
			"incidents",
		]) {
			expect(rels.has(r)).toBe(true);
		}
	});

	it("every edge resolves to an existing node — no invented adjacency", () => {
		const g = ok(EXAMPLE_HEAD);
		const ids = new Set(g.nodes.map((n) => n.id));
		for (const e of g.edges) {
			expect(ids.has(e.from)).toBe(true);
			expect(ids.has(e.to)).toBe(true);
		}
	});

	it("every node.route is a known Workbench route", () => {
		const g = ok(EXAMPLE_HEAD);
		const valid = new Set([
			"/web-preview",
			"/control",
			"/operation",
			"/entity-map",
			"/mirrors",
			"/scopes",
			"/red-wave",
		]);
		for (const n of g.nodes) expect(valid.has(n.route)).toBe(true);
	});

	it("legend enumerates exactly the colors used — no orphan, no missing", () => {
		const g = ok(EXAMPLE_HEAD);
		const legend = new Set(g.legend.map((l) => `${l.dimension}|${l.value}`));
		const used = new Set<string>();
		for (const n of g.nodes) {
			for (const [d, v] of [
				["truth_type", n.truthType],
				["liveness", n.liveness],
				["red_wave", n.redWaveState],
			]) {
				if (v === "") continue;
				used.add(`${d}|${v}`);
				expect(legend.has(`${d}|${v}`)).toBe(true);
			}
		}
		for (const k of legend) expect(used.has(k)).toBe(true);
	});

	it("graph_hash is non-empty and deterministic (snapshot stability)", () => {
		const a = ok(EXAMPLE_HEAD);
		const b = ok(EXAMPLE_HEAD);
		expect(a.graphHash).not.toBe("");
		expect(a.graphHash).toBe(b.graphHash);
	});

	it("a dangling edge endpoint yields a BlockReason, never a throw", () => {
		const head: Head = {
			...EXAMPLE_HEAD,
			edges: [
				...EXAMPLE_HEAD.edges,
				{ from: "saveOrder", to: "ghost", relation: "invoke" },
			],
		};
		const r = buildGraph(head);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.block.code).toBe("MISSING_MIRROR");
			expect(r.block.howToFix.length).toBeGreaterThan(0);
		}
	});

	it("an unknown node route yields a BlockReason", () => {
		const head: Head = {
			...EXAMPLE_HEAD,
			nodes: EXAMPLE_HEAD.nodes.map((n, i) =>
				i === 0 ? { ...n, route: "/nope" as never } : n,
			),
		};
		const r = buildGraph(head);
		expect(r.ok).toBe(false);
	});
});
