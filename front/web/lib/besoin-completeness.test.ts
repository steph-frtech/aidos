import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type BesoinLevelMirror,
	besoinCompleteness,
	type CompletenessNode,
	derivedMirrorCovers,
	isMirrorForm,
	isMonsterCode,
	levelMirrorForm,
} from "./besoin-completeness";
import { allLevels, outOfScopeLevels } from "./besoin-grammar";

// besoin-completeness.test.ts — the EL09 TS twin mirror (vitest + fast-check). Proves byte-equivalence
// with the Go authority: the completeness law, the fault-injection both directions, monster detection
// as a pure function, the LevelMirrorForm table total over the grammar.

const resolvedProduct: CompletenessNode[] = [
	{ level: "product", status: "resolved" },
];
const productMirror: BesoinLevelMirror = {
	reflects: "product",
	form: "gherkin_n0",
};
const metaOk = { product: true };

describe("levelMirrorForm", () => {
	it("is total over the 9 grammar levels and yields a closed form", () => {
		for (const l of allLevels()) {
			const f = levelMirrorForm(l);
			expect(f).not.toBeNull();
			expect(isMirrorForm(f as string)).toBe(true);
		}
	});

	it("returns null for an out-of-grammar level (no fabrication)", () => {
		for (const l of outOfScopeLevels()) {
			expect(levelMirrorForm(l)).toBeNull();
		}
	});

	it("agrees with the derive-mirror taxonomy on the 5 covered rungs", () => {
		expect(levelMirrorForm("entity")).toBe("property_n1");
		expect(levelMirrorForm("control")).toBe("fixture_n2");
		expect(levelMirrorForm("action")).toBe("fixture_n2");
		expect(levelMirrorForm("operation")).toBe("fixture_n2");
		expect(levelMirrorForm("policy")).toBe("fixture_n2");
		for (const l of [
			"entity",
			"policy",
			"operation",
			"control",
			"action",
		] as const) {
			expect(derivedMirrorCovers(l)).toBe(true);
		}
		expect(derivedMirrorCovers("product")).toBe(false);
	});
});

describe("besoinCompleteness — the law + fault injection", () => {
	it("GREEN: a resolved node with its right-form mirror + live metadata is complete", () => {
		const rep = besoinCompleteness(resolvedProduct, [productMirror], metaOk);
		expect(rep.complete).toBe(true);
		expect(rep.monsters).toHaveLength(0);
	});

	it("RED dir.1: removing the mirror of a resolved node → NEED_LEVEL_WITHOUT_MIRROR", () => {
		const rep = besoinCompleteness(resolvedProduct, [], metaOk);
		expect(rep.complete).toBe(false);
		expect(
			rep.monsters.some((m) => m.code === "NEED_LEVEL_WITHOUT_MIRROR"),
		).toBe(true);
	});

	it("RED dir.2: a level-mirror reflecting no resolved node → ORPHAN_NEED_MIRROR", () => {
		const mirrors: BesoinLevelMirror[] = [
			productMirror,
			{ reflects: "entity", form: "property_n1" },
		];
		const rep = besoinCompleteness(resolvedProduct, mirrors, metaOk);
		expect(rep.complete).toBe(false);
		expect(rep.monsters.some((m) => m.code === "ORPHAN_NEED_MIRROR")).toBe(
			true,
		);
	});

	it("a mirror reflecting a drafting node is an orphan", () => {
		const nodes: CompletenessNode[] = [
			{ level: "product", status: "drafting" },
		];
		const rep = besoinCompleteness(nodes, [productMirror], {});
		expect(rep.complete).toBe(false);
		expect(rep.monsters.some((m) => m.code === "ORPHAN_NEED_MIRROR")).toBe(
			true,
		);
	});

	it("a wrong-form level-mirror → NEED_MIRROR_WRONG_FORM", () => {
		const wrong: BesoinLevelMirror = {
			reflects: "product",
			form: "property_n1",
		};
		const rep = besoinCompleteness(resolvedProduct, [wrong], metaOk);
		expect(rep.complete).toBe(false);
		expect(rep.monsters.some((m) => m.code === "NEED_MIRROR_WRONG_FORM")).toBe(
			true,
		);
	});

	it("a resolved node with vanished metadata → NEED_LEVEL_METADATA_DISAPPEARED", () => {
		const rep = besoinCompleteness(resolvedProduct, [productMirror], {});
		expect(rep.complete).toBe(false);
		expect(
			rep.monsters.some((m) => m.code === "NEED_LEVEL_METADATA_DISAPPEARED"),
		).toBe(true);
	});

	it("an empty node carries no completeness obligation", () => {
		const nodes: CompletenessNode[] = [
			...resolvedProduct,
			{ level: "journey", status: "empty" },
		];
		const rep = besoinCompleteness(nodes, [productMirror], metaOk);
		expect(rep.complete).toBe(true);
	});
});

describe("besoinCompleteness — determinism & closed codes (property)", () => {
	it("is reproducible: same input → identical report", () => {
		fc.assert(
			fc.property(
				fc.boolean(),
				fc.boolean(),
				fc.boolean(),
				(resolved, withMirror, metaPresent) => {
					const nodes: CompletenessNode[] = [
						{ level: "product", status: resolved ? "resolved" : "drafting" },
					];
					const mirrors = withMirror ? [productMirror] : [];
					const meta: Record<string, boolean> = metaPresent
						? { product: true }
						: {};
					const first = besoinCompleteness(nodes, mirrors, meta);
					const again = besoinCompleteness(nodes, mirrors, meta);
					expect(again).toEqual(first);
				},
			),
		);
	});

	it("orders monsters deterministically by level descent rank then code", () => {
		// Two resolved rungs both missing mirrors: product (rank 0) must come before entity (rank 6).
		const nodes: CompletenessNode[] = [
			{ level: "entity", status: "resolved" },
			{ level: "product", status: "resolved" },
		];
		const rep = besoinCompleteness(nodes, [], { product: true, entity: true });
		expect(rep.monsters[0].level).toBe("product");
		expect(rep.monsters.at(-1)?.level).toBe("entity");
	});

	it("every monster carries a closed code and a non-empty fix path (never a prison)", () => {
		fc.assert(
			fc.property(
				fc.boolean(),
				fc.boolean(),
				fc.boolean(),
				fc.boolean(),
				(resolved, mirrorPresent, rightForm, metaPresent) => {
					const nodes: CompletenessNode[] = [
						{ level: "product", status: resolved ? "resolved" : "drafting" },
					];
					const mirrors: BesoinLevelMirror[] = mirrorPresent
						? [
								{
									reflects: "product",
									form: rightForm ? "gherkin_n0" : "property_n1",
								},
							]
						: [];
					const meta: Record<string, boolean> = metaPresent
						? { product: true }
						: {};
					const rep = besoinCompleteness(nodes, mirrors, meta);
					for (const m of rep.monsters) {
						expect(isMonsterCode(m.code)).toBe(true);
						expect(m.howToFix.length).toBeGreaterThan(0);
					}
					let shouldBeComplete =
						resolved && mirrorPresent && rightForm && metaPresent;
					if (!resolved && !mirrorPresent) shouldBeComplete = true;
					expect(rep.complete).toBe(shouldBeComplete);
				},
			),
		);
	});
});
