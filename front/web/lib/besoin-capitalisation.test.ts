/**
 * besoin-capitalisation.test.ts — the reproducibility mirror of the EL18 TS twin (vitest +
 * fast-check). Pins: (1) cosmetic variants canonicalise to the SAME key, genuinely different intents
 * differ; (2) the anchor excludes NoEmit rungs; (3) a fully-resolved gate; (4) reuse under canonical
 * names replays ≥1 unit while a dissimilar need fabricates NO reuse (anti-false-positive); (5)
 * wroteKernel always false; (6) provenance reconstructs to the graph_hash.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	anchor,
	type CapNode,
	canonicalIntentKey,
	isFullyResolved,
	normalizeIntent,
	parseGraphHash,
	reuseFor,
} from "./besoin-capitalisation";
import { addNode, type BesoinGraph, newGraph } from "./besoin-graph";

function resolved(level: string): CapNode {
	return {
		level: level as CapNode["level"],
		status: "resolved",
		utterance: "x",
	};
}

function mustAdd(g: BesoinGraph, level: string, detail: string): BesoinGraph {
	const r = addNode(g, {
		level: level as CapNode["level"],
		status: "resolved",
		provenance: { source: "human", detail },
	});
	if (!r.ok) throw new Error(`addNode ${level}: ${r.error}`);
	return r.graph;
}

function buildGraph(
	project: string,
	productIntent: string,
	entityIntent: string,
): { g: BesoinGraph; nodes: CapNode[] } {
	let g = newGraph(project);
	g = mustAdd(g, "product", productIntent);
	g = mustAdd(g, "entity", entityIntent);
	const nodes: CapNode[] = [
		{ level: "product", status: "resolved", utterance: productIntent },
		{ level: "entity", status: "resolved", utterance: entityIntent },
	];
	return { g, nodes };
}

describe("canonicalIntentKey", () => {
	it("collapses casing / whitespace / trailing punctuation to the same key", () => {
		expect(canonicalIntentKey("product", "Manage Tasks.")).toBe(
			canonicalIntentKey("product", "  manage   tasks  "),
		);
	});
	it("distinguishes genuinely different intents and levels", () => {
		expect(canonicalIntentKey("product", "manage tasks")).not.toBe(
			canonicalIntentKey("product", "schedule meetings"),
		);
		expect(canonicalIntentKey("product", "manage tasks")).not.toBe(
			canonicalIntentKey("entity", "manage tasks"),
		);
	});
	it("normalizeIntent is idempotent (property)", () => {
		fc.assert(
			fc.property(fc.string(), (s) => {
				expect(normalizeIntent(normalizeIntent(s))).toBe(normalizeIntent(s));
			}),
		);
	});
});

describe("anchor", () => {
	it("excludes NoEmit rungs and keeps one unit per mapping rung", () => {
		const { g } = buildGraph("p", "manage tasks", "a Task");
		const nodes: CapNode[] = [
			{ level: "product", status: "resolved", utterance: "manage tasks" },
			{
				level: "journey",
				status: "resolved",
				utterance: "Given a user When add Then appears",
			},
			{ level: "entity", status: "resolved", utterance: "a Task" },
		];
		const a = anchor(g, nodes, "main");
		expect(a.units.map((u) => u.level)).toEqual(["product", "entity"]);
	});
});

describe("isFullyResolved (the green gate)", () => {
	it("is false when any source rung is unresolved", () => {
		const nodes: CapNode[] = [
			{ level: "product", status: "resolved", utterance: "manage tasks" },
			{ level: "entity", status: "drafting", utterance: "a Task (wip)" },
		];
		expect(isFullyResolved(nodes)).toBe(false);
	});
	it("is true when every present source rung is resolved with ≥1 mapping rung", () => {
		expect(isFullyResolved([resolved("product"), resolved("entity")])).toBe(
			true,
		);
	});
});

describe("reuseFor (CE05 cross-app reuse)", () => {
	it("a similar need under canonical names replays ≥1 unit", () => {
		const first = buildGraph("app1", "Manage tasks.", "A Task entity");
		const a = anchor(first.g, first.nodes, "main");
		const similar = buildGraph("app2", "  manage   tasks  ", "a task entity!");
		const plan = reuseFor(a, anchor(similar.g, similar.nodes, "main"));
		expect(plan.reusedProcedural).toBeGreaterThanOrEqual(1);
		expect(plan.savedTokens).toBeGreaterThan(0);
		expect(plan.effortAfter).toBeLessThan(plan.effortBefore);
		expect(plan.wroteKernel).toBe(false);
	});
	it("a dissimilar need fabricates NO reuse (anti-false-positive)", () => {
		const first = buildGraph("app1", "manage tasks", "a Task");
		const a = anchor(first.g, first.nodes, "main");
		const dissimilar = buildGraph("app3", "schedule meetings", "a Calendar");
		const plan = reuseFor(a, anchor(dissimilar.g, dissimilar.nodes, "main"));
		expect(plan.reusedProcedural).toBe(0);
		expect(plan.effortAfter).toBe(plan.effortBefore);
	});
});

describe("parseGraphHash (provenance reconstructs to graph_hash)", () => {
	it("recovers the graph_hash from a besoin: provenance", () => {
		expect(parseGraphHash("besoin:deadbeef")).toBe("deadbeef");
	});
	it("returns null for a non-besoin provenance or empty hash", () => {
		expect(parseGraphHash("memory:abc")).toBeNull();
		expect(parseGraphHash("besoin:")).toBeNull();
	});
});
