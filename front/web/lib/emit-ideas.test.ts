/**
 * lib/emit-ideas.test.ts — the vitest + fast-check mirror of the EL16 TypeScript twin
 * (lib/emit-ideas.ts). It re-proves, on the front, the SAME invariants the Go rapid property proves:
 * EmitIdeas is deterministic, governed by the closed table levelToProposes (EL05), NoEmit-safe,
 * resolved-only, and every emitted Idea is a draft with no version/mirror (the wall). determinism-first:
 * the twin is a pure total function — same nodes → same ordered []Idea.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { allLevels, type Level } from "./besoin-grammar";
import { levelToProposes } from "./besoin-proposes";
import {
	type EmitNode,
	type EmitNodeStatus,
	emitCount,
	emitIdeas,
} from "./emit-ideas";

const STATUSES: EmitNodeStatus[] = ["empty", "drafting", "resolved"];

// arbNodes draws a random subset of levels, each at a random status, with a deterministic utterance.
const arbNodes = fc
	.array(
		fc.record({
			level: fc.constantFrom<Level>(...allLevels()),
			status: fc.constantFrom<EmitNodeStatus>(...STATUSES),
			utterance: fc.string(),
		}),
		{ maxLength: 9 },
	)
	.map((arr) => {
		// dedup by level (one node per level, as the graph holds at most one node per Level).
		const byLevel = new Map<Level, EmitNode>();
		for (const n of arr) byLevel.set(n.level, n);
		return [...byLevel.values()];
	});

describe("EL16 emitIdeas — deterministic", () => {
	it("yields the same ordered list on every call (idempotence)", () => {
		fc.assert(
			fc.property(arbNodes, (nodes) => {
				expect(JSON.stringify(emitIdeas(nodes))).toBe(
					JSON.stringify(emitIdeas(nodes)),
				);
			}),
		);
	});
});

describe("EL16 emitIdeas — governed by LevelToProposes (EL05)", () => {
	it("every emitted Idea's proposes is the table verdict of a resolved mapping rung", () => {
		fc.assert(
			fc.property(arbNodes, (nodes) => {
				const want = new Set<string>();
				for (const n of nodes) {
					if (n.status !== "resolved") continue;
					const m = levelToProposes(n.level);
					if (m.kind === "emit" && m.proposes) want.add(m.proposes);
				}
				for (const idea of emitIdeas(nodes)) {
					expect(want.has(idea.proposes)).toBe(true);
					expect(idea.status).toBe("draft");
				}
			}),
		);
	});

	it("never emits for a NoEmit rung (journey/view/invariant), even when resolved", () => {
		const nodes: EmitNode[] = [
			{ level: "journey", status: "resolved", utterance: "j" },
			{ level: "view", status: "resolved", utterance: "v" },
			{ level: "invariant", status: "resolved", utterance: "i" },
		];
		expect(emitIdeas(nodes)).toHaveLength(0);
	});

	it("emits exactly one draft Idea per resolved mapping rung — product+entity → 2", () => {
		const nodes: EmitNode[] = [
			{ level: "product", status: "resolved", utterance: "je veux un produit" },
			{ level: "entity", status: "resolved", utterance: "je veux une entité" },
		];
		const out = emitIdeas(nodes);
		expect(out).toHaveLength(2);
		expect(out.map((i) => i.proposes)).toEqual(["product", "entity"]);
		expect(out.every((i) => i.provenance.source === "human")).toBe(true);
	});

	it("product+journey → exactly one Idea (journey is NoEmit, no cast)", () => {
		const nodes: EmitNode[] = [
			{ level: "product", status: "resolved", utterance: "p" },
			{ level: "journey", status: "resolved", utterance: "j" },
		];
		const out = emitIdeas(nodes);
		expect(out).toHaveLength(1);
		expect(out[0].proposes).toBe("product");
	});
});

describe("EL16 emitIdeas — resolved-only + the wall", () => {
	it("a drafting/empty rung never emits", () => {
		const nodes: EmitNode[] = [
			{ level: "product", status: "resolved", utterance: "p" },
			{ level: "entity", status: "drafting", utterance: "e" },
		];
		const out = emitIdeas(nodes);
		expect(out).toHaveLength(1);
		expect(out[0].proposes).toBe("product");
	});

	it("no emitted Idea carries a version or mirror key (HasMirror always false)", () => {
		fc.assert(
			fc.property(arbNodes, (nodes) => {
				for (const idea of emitIdeas(nodes)) {
					const keys = Object.keys(idea);
					expect(keys).not.toContain("version");
					expect(keys).not.toContain("mirror");
				}
			}),
		);
	});

	it("emitCount matches the emission length (no drift)", () => {
		fc.assert(
			fc.property(arbNodes, (nodes) => {
				expect(emitCount(nodes)).toBe(emitIdeas(nodes).length);
			}),
		);
	});
});
