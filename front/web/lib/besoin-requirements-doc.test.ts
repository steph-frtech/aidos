import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type DocNode, emitRequirementsDoc } from "./besoin-requirements-doc";

// besoin-requirements-doc.test.ts — the EL19 reproducibility mirror of EmitRequirementsDoc.
// determinism-first (§6/§8): same graph → byte-identical doc (same graph_hash → same markdown). The
// NoEmit rungs (journey/view) are excluded from the Idea count; resolved mapping rungs emit.

function node(
	level: DocNode["level"],
	status: DocNode["status"],
	utterance: string,
	extra?: Partial<DocNode>,
): DocNode {
	return { level, status, utterance, metaComplete: true, ...extra };
}

const PRODUCT_ENTITY: DocNode[] = [
	node("product", "resolved", "un checkout", {
		refs: [{ field: "journeys", to: "journey" }],
	}),
	node("entity", "resolved", "une commande"),
];

const PRODUCT_JOURNEY: DocNode[] = [
	node("product", "resolved", "un checkout"),
	node("journey", "resolved", "Given/When/Then parcours"),
];

describe("EL19 emitRequirementsDoc — the deterministic requirements-doc projector", () => {
	it("renders the rungs in descent order with the per-node metadata and mirror form", () => {
		const doc = emitRequirementsDoc(PRODUCT_ENTITY, [], "abc123def456");
		expect(doc.graphHash).toBe("abc123def456");
		expect(doc.rungs.map((r) => r.level)).toEqual(["product", "entity"]);
		expect(doc.rungs[0].mirrorForm).toBeTruthy();
		expect(doc.rungs.every((r) => r.metaComplete)).toBe(true);
		expect(doc.markdown).toContain(
			"Document d'exigences — BesoinGraph abc123def456",
		);
	});

	it("counts only the MAPPING rungs as Ideas (NoEmit journey/view excluded)", () => {
		// product + entity → 2 mapping rungs → 2 Ideas.
		expect(emitRequirementsDoc(PRODUCT_ENTITY, [], "h").ideaCount).toBe(2);
		// product + journey → the journey is NoEmit → 1 Idea (no journey→product cast).
		expect(emitRequirementsDoc(PRODUCT_JOURNEY, [], "h").ideaCount).toBe(1);
	});

	it("excludes a NoEmit rung from the Idea backlog but keeps it as an anchor", () => {
		const doc = emitRequirementsDoc(PRODUCT_JOURNEY, [], "h");
		expect(doc.backlog.map((b) => b.fromLevel)).toEqual(["product"]);
		expect(doc.backlog.map((b) => b.fromLevel)).not.toContain("journey");
	});

	it("a non-resolved rung emits nothing (only right-sized rungs project)", () => {
		const draftOnly: DocNode[] = [
			node("product", "drafting", "esquisse"),
			node("entity", "resolved", "une commande"),
		];
		expect(emitRequirementsDoc(draftOnly, [], "h").ideaCount).toBe(1);
	});

	it("is byte-identical for the same graph (reproducibility mirror)", () => {
		const a = emitRequirementsDoc(PRODUCT_ENTITY, [], "stablehash");
		const b = emitRequirementsDoc(PRODUCT_ENTITY, [], "stablehash");
		expect(a.markdown).toBe(b.markdown);
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});

	it("carries OpenQuestions into the doc without blocking (bootstrap §6)", () => {
		const withOQ: DocNode[] = [
			node("product", "resolved", "un checkout", {
				openQuestions: ["forward-dep: entity pas encore là (portée)"],
			}),
		];
		const doc = emitRequirementsDoc(withOQ, [], "h");
		expect(doc.openQuestions).toContain(
			"forward-dep: entity pas encore là (portée)",
		);
		expect(doc.markdown).toContain("OpenQuestions portées");
	});

	it("property: the Idea count never exceeds the number of resolved rungs (NoEmit-safe)", () => {
		const lvl = fc.constantFrom(
			"product",
			"journey",
			"view",
			"entity",
		) as fc.Arbitrary<DocNode["level"]>;
		fc.assert(
			fc.property(fc.array(lvl, { minLength: 1, maxLength: 4 }), (levels) => {
				const uniq = [...new Set(levels)];
				const nodes = uniq.map((l) => node(l, "resolved", "x"));
				const doc = emitRequirementsDoc(nodes, [], "h");
				expect(doc.ideaCount).toBeLessThanOrEqual(uniq.length);
			}),
		);
	});
});
