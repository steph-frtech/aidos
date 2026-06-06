/**
 * lib/besoin-graph.test.ts — the front-plane reproducibility mirror of the EL03 BesoinGraph twin
 * (vitest + fast-check). Pins the SAME invariants as the Go property mirror
 * (back/runtime/besoin/graph_property_test.go): same answers → same graph_hash regardless of
 * insertion/key order, round-trip lossless, distinct projects disjoint, and NO version/mirror key
 * (the double absence — the wall). Determinism-first: same input → same output.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { allLevels, type Level } from "./besoin-grammar";
import {
	addEdge,
	addNode,
	canonicalize,
	hash,
	hasVersionOrMirrorKey,
	type LevelNode,
	type NodeStatus,
	newGraph,
	withOutgoingRef,
} from "./besoin-graph";

const LEVELS = allLevels();
const STATUSES: NodeStatus[] = ["empty", "drafting", "resolved"];

function mkNode(level: Level, status: NodeStatus, intent: string): LevelNode {
	return withOutgoingRef({
		level,
		body: { intent },
		provenance: { source: "human", detail: intent },
		status,
	});
}

// arbitrary: a non-empty subset of distinct levels, each with a status + intent.
const nodesArb = fc
	.uniqueArray(fc.constantFrom(...LEVELS), {
		minLength: 1,
		maxLength: LEVELS.length,
	})
	.chain((levels) =>
		fc.tuple(
			...levels.map((l) =>
				fc.record({
					level: fc.constant(l),
					status: fc.constantFrom(...STATUSES),
					intent: fc.string({ minLength: 1, maxLength: 12 }),
				}),
			),
		),
	)
	.map((specs) => specs.map((s) => mkNode(s.level, s.status, s.intent)));

function build(
	project: string,
	nodes: LevelNode[],
): ReturnType<typeof newGraph> {
	let g = newGraph(project);
	for (const n of nodes) {
		const r = addNode(g, n);
		if (!r.ok) throw new Error(`addNode failed: ${r.error}`);
		g = r.graph;
	}
	return g;
}

describe("besoin-graph twin (EL03)", () => {
	it("graph_hash is insertion-order-independent", () => {
		fc.assert(
			fc.property(nodesArb, (nodes) => {
				const a = build("proj", nodes);
				const b = build("proj", [...nodes].reverse());
				expect(hash(a)).toBe(hash(b));
			}),
		);
	});

	it("graph_hash is key-order-independent in node bodies", () => {
		const mk = (body: unknown) => {
			const r = addNode(newGraph("p"), {
				level: "product",
				body,
				provenance: { source: "human", detail: "x" },
				status: "resolved",
			});
			if (!r.ok) throw new Error("addNode");
			return r.graph;
		};
		const a = mk({ intent: "x", scenarios: ["a", "b"] });
		const b = mk({ scenarios: ["a", "b"], intent: "x" });
		expect(hash(a)).toBe(hash(b));
	});

	it("round-trip canonicalize is hash-stable", () => {
		fc.assert(
			fc.property(nodesArb, (nodes) => {
				const g = build("rt", nodes);
				const c1 = canonicalize(g);
				const parsed = JSON.parse(c1);
				// Re-encoding the parsed canonical body yields identical bytes.
				expect(canonicalize(reconstruct(parsed, g.project))).toBe(c1);
			}),
		);
	});

	it("distinct projects are disjoint (different graph_hash)", () => {
		fc.assert(
			fc.property(nodesArb, (nodes) => {
				expect(hash(build("project-A", nodes))).not.toBe(
					hash(build("project-B", nodes)),
				);
			}),
		);
	});

	it("same answers + same project → same graph_hash", () => {
		fc.assert(
			fc.property(nodesArb, (nodes) => {
				expect(hash(build("same", nodes))).toBe(hash(build("same", nodes)));
			}),
		);
	});

	it("canonical body never carries a version or mirror key (the double absence)", () => {
		fc.assert(
			fc.property(nodesArb, (nodes) => {
				expect(hasVersionOrMirrorKey(build("p", nodes))).toBe(false);
				expect(canonicalize(build("p", nodes))).not.toContain('"version"');
				expect(canonicalize(build("p", nodes))).not.toContain('"mirror"');
			}),
		);
	});

	it("addNode is non-destructive and refuses duplicate/unknown level/status", () => {
		const g0 = newGraph("p");
		const r1 = addNode(g0, mkNode("product", "resolved", "i"));
		expect(r1.ok).toBe(true);
		if (!r1.ok) return;
		expect(g0.nodes.length).toBe(0); // receiver untouched
		expect(r1.graph.nodes.length).toBe(1);
		expect(addNode(r1.graph, mkNode("product", "empty", "j")).ok).toBe(false); // duplicate
		expect(addNode(r1.graph, mkNode("saga" as Level, "empty", "k")).ok).toBe(
			false,
		); // out of grammar
		expect(
			addNode(r1.graph, {
				level: "entity",
				provenance: { source: "human", detail: "" },
				status: "done" as NodeStatus,
			}).ok,
		).toBe(false); // unknown status
	});

	it("edges are guarded + de-duplicated (re-add does not change the hash)", () => {
		const r1 = addEdge(newGraph("p"), {
			from: "product",
			to: "journey",
			kind: "constrains",
		});
		expect(r1.ok).toBe(true);
		if (!r1.ok) return;
		const r2 = addEdge(r1.graph, {
			from: "product",
			to: "journey",
			kind: "constrains",
		});
		expect(r2.ok).toBe(true);
		if (!r2.ok) return;
		expect(hash(r1.graph)).toBe(hash(r2.graph));
		expect(
			addEdge(newGraph("p"), {
				from: "product",
				to: "journey",
				kind: "becomes" as never,
			}).ok,
		).toBe(false);
	});

	it("graph_hash is a 64-char sha256 hex", () => {
		const g = build("p", [mkNode("product", "resolved", "go")]);
		expect(hash(g)).toMatch(/^[0-9a-f]{64}$/);
	});
});

// reconstruct rebuilds a BesoinGraph from a parsed canonical body for the round-trip test.
function reconstruct(
	parsed: unknown,
	project: string,
): ReturnType<typeof newGraph> {
	const o = parsed as { nodes?: unknown[]; edges?: unknown[] };
	const nodes = (o.nodes ?? []).map((raw) => {
		const n = raw as {
			level: Level;
			body?: unknown;
			refs?: { field: string; to: Level }[];
			provenance: { source: string; detail: string };
			status: NodeStatus;
			open_questions?: string[];
		};
		return {
			level: n.level,
			body: n.body,
			refs: n.refs,
			provenance: n.provenance,
			status: n.status,
			openQuestions: n.open_questions,
		} as LevelNode;
	});
	return { project, nodes, edges: [] };
}
