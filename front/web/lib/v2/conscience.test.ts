/**
 * WB2-20 — le MIROIR DE REPRODUCTIBILITÉ du twin de « la conscience » (Vitest + fast-check).
 *
 * Critère de done WB2-20 : « twin — reconcile pur + property (mêmes verdicts → même rapport) ; e2e —
 * voyants + cards ». Ce miroir épingle le twin :
 *   - `reconcile` (FK09 réutilisé, ADR 0007) est DÉTERMINISTE : mêmes verdicts → rapport byte-identique,
 *     invariant sous l'ORDRE d'entrée ;
 *   - `axisLights` projette TOUJOURS les quatre axes, dans l'ordre `AXES`, cohérents avec le tally du
 *     rapport (un voyant rouge ssi une paire HARD rouge sous l'axe ; ambre ssi seulement advisory) ;
 *   - la facette S range sa paire sous l'axe `autorisé` (la sécurité = autorisation) ;
 *   - `pairLights` range CHAQUE paire sous son axe (aucune paire perdue, aucune inventée) ;
 *   - `decisionCardsV2` projette les options FK09 en verbes V2 CLOS ⊆ {accept,amend,reject,defer},
 *     déterministe (mêmes cards → mêmes cards V2) ;
 *   - la facette SOFT X ne bascule JAMAIS le verdict global en drift (§13.6) — voyant ambre, pas rouge ;
 *   - le registre `CONSCIENCE_CASES` est CLOS et chaque cas se comporte comme attendu.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : aucune horloge, aucun aléa, aucun LLM — l'agrégateur LIT des
 * verdicts sourcés et les ROUTE ; il ne re-juge rien (§8). LE MUR (§2) : le twin n'écrit aucune vérité.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Facet } from "../facetwire";
import {
	AXES,
	axisLights,
	axisOf,
	CONSCIENCE_CASES,
	caseReport,
	conscienceCaseById,
	conscienceCaseIds,
	decisionCardsV2,
	pairLights,
	reconcile,
	type Source,
	type SourcedVerdict,
	V2_OPTIONS,
	type V2Option,
	v2Option,
} from "./conscience";

const SOURCES: Source[] = [
	"runner",
	"completeness",
	"facet",
	"semantic_diff",
	"reality_mirror",
	"sensor",
	"ledger",
];
const FACETS: Facet[] = ["F", "I", "S", "B", "R", "V", "M", "X"];

const svArb: fc.Arbitrary<SourcedVerdict> = fc.record({
	source: fc.constantFrom(...SOURCES),
	facet: fc.constantFrom(...FACETS),
	pair: fc.constantFrom("p0", "p1", "p2", "p3"),
	verdict: fc.constantFrom(
		"green" as const,
		"red" as const,
		"advisory" as const,
	),
});

const inputArb = fc.record({
	kernel_id: fc.constantFrom("k0", "checkout"),
	verdicts: fc.array(svArb, { maxLength: 12 }),
});

describe("WB2-20 — la conscience : agrégateur déterministe (twin pur)", () => {
	it("reconcile est DÉTERMINISTE : mêmes verdicts → rapport byte-identique", () => {
		fc.assert(
			fc.property(inputArb, (input) => {
				const a = reconcile(input);
				const b = reconcile(input);
				expect(JSON.stringify(a)).toBe(JSON.stringify(b));
			}),
		);
	});

	it("reconcile est INVARIANT sous l'ordre des verdicts (mêmes verdicts → même rapport)", () => {
		fc.assert(
			fc.property(inputArb, (input) => {
				const shuffled = {
					...input,
					verdicts: [...input.verdicts].reverse(),
				};
				const a = reconcile(input);
				const b = reconcile(shuffled);
				expect(JSON.stringify(a)).toBe(JSON.stringify(b));
			}),
		);
	});

	it("axisLights projette TOUJOURS les quatre axes, dans l'ordre AXES", () => {
		fc.assert(
			fc.property(inputArb, (input) => {
				const lights = axisLights(reconcile(input));
				expect(lights.map((l) => l.axis)).toEqual([...AXES]);
			}),
		);
	});

	it("axisLights est cohérent : rouge ssi paire rouge sous l'axe ; ambre ssi seulement advisory", () => {
		fc.assert(
			fc.property(inputArb, (input) => {
				const report = reconcile(input);
				const lights = axisLights(report);
				for (const l of lights) {
					if (l.red > 0) expect(l.light).toBe("red");
					else if (l.amber > 0) expect(l.light).toBe("amber");
					else expect(l.light).toBe("green");
					expect(l.total).toBe(l.green + l.red + l.amber);
				}
			}),
		);
	});

	it("axisLights conserve TOUTES les paires (somme des totaux == nombre de paires)", () => {
		fc.assert(
			fc.property(inputArb, (input) => {
				const report = reconcile(input);
				const lights = axisLights(report);
				const sum = lights.reduce((acc, l) => acc + l.total, 0);
				expect(sum).toBe(report.pairs.length);
			}),
		);
	});

	it("la facette S range sa paire sous l'axe `autorisé`", () => {
		fc.assert(
			fc.property(svArb, (sv) => {
				const report = reconcile({ kernel_id: "k", verdicts: [sv] });
				for (const p of report.pairs) {
					if (p.facet === "S") expect(axisOf(p)).toBe("autorisé");
				}
			}),
		);
	});

	it("pairLights range CHAQUE paire sous son axe (aucune perdue, aucune inventée)", () => {
		fc.assert(
			fc.property(inputArb, (input) => {
				const report = reconcile(input);
				const pls = pairLights(report);
				expect(pls.length).toBe(report.pairs.length);
				for (const pl of pls) {
					expect(AXES).toContain(pl.axis);
					expect(["green", "red", "amber"]).toContain(pl.light);
				}
			}),
		);
	});

	it("decisionCardsV2 produit des options CLOSES ⊆ {accept,amend,reject,defer}, déterministe", () => {
		fc.assert(
			fc.property(inputArb, (input) => {
				const report = reconcile(input);
				const cardsA = decisionCardsV2(report);
				const cardsB = decisionCardsV2(report);
				expect(JSON.stringify(cardsA)).toBe(JSON.stringify(cardsB));
				expect(cardsA.length).toBe(report.cards.length);
				for (const c of cardsA) {
					for (const o of c.options) expect(V2_OPTIONS).toContain(o);
					expect(V2_OPTIONS).toContain(c.recommendation);
					// les options sont dans l'ordre canonique V2_OPTIONS.
					const idx = c.options.map((o: V2Option) => V2_OPTIONS.indexOf(o));
					expect(idx).toEqual([...idx].sort((a, b) => a - b));
				}
			}),
		);
	});

	it("v2Option mappe chaque CardOption FK09 vers un verbe V2 clos (totalité)", () => {
		const opts = [
			"fix_below_wall",
			"change_above_wall",
			"ask_user_decision",
			"block",
			"keep_experimental",
			"deprecate",
		] as const;
		for (const o of opts) expect(V2_OPTIONS).toContain(v2Option(o));
	});

	it("la facette SOFT X ne bascule JAMAIS le verdict en drift (§13.6) — ambre, pas rouge", () => {
		fc.assert(
			fc.property(fc.array(svArb, { maxLength: 8 }), (verdicts) => {
				// on FORCE tous les verdicts sur la facette X (la seule soft).
				const onlyX = verdicts.map((v) => ({ ...v, facet: "X" as Facet }));
				const report = reconcile({ kernel_id: "k", verdicts: onlyX });
				expect(report.verdict).toBe("aligned");
				const lights = axisLights(report);
				for (const l of lights) expect(l.light).not.toBe("red");
			}),
		);
	});

	it("le registre CONSCIENCE_CASES est CLOS et résoluble", () => {
		const ids = conscienceCaseIds();
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) {
			const c = conscienceCaseById(id);
			expect(c).toBeDefined();
			if (c) expect(caseReport(c)).toBeDefined();
		}
		expect(conscienceCaseById("nope")).toBeUndefined();
	});

	it("cas `aligned` → verdict aligné, quatre voyants verts, aucune card", () => {
		const c = conscienceCaseById("aligned");
		expect(c).toBeDefined();
		if (!c) return;
		const report = caseReport(c);
		expect(report.verdict).toBe("aligned");
		expect(report.cards.length).toBe(0);
		for (const l of axisLights(report)) expect(l.light).toBe("green");
	});

	it("cas `runner-drift` → drift, voyant `prouvé` rouge + sa decision card actionnable", () => {
		const c = conscienceCaseById("runner-drift");
		expect(c).toBeDefined();
		if (!c) return;
		const report = caseReport(c);
		expect(report.verdict).toBe("drift");
		const prouve = axisLights(report).find((l) => l.axis === "prouvé");
		expect(prouve?.light).toBe("red");
		const cards = decisionCardsV2(report);
		const runnerCard = cards.find((c2) => c2.card.source === "runner");
		expect(runnerCard).toBeDefined();
		expect((runnerCard?.options.length ?? 0) > 0).toBe(true);
	});

	it("cas `break-security` → drift, voyant `autorisé` rouge + card de sécurité (reject recommandé)", () => {
		const c = conscienceCaseById("break-security");
		expect(c).toBeDefined();
		if (!c) return;
		const report = caseReport(c);
		expect(report.verdict).toBe("drift");
		const autorise = axisLights(report).find((l) => l.axis === "autorisé");
		expect(autorise?.light).toBe("red");
		const cards = decisionCardsV2(report);
		const secCard = cards.find(
			(c2) => c2.card.facet === "S" && !c2.card.advisory,
		);
		expect(secCard).toBeDefined();
		expect(secCard?.recommendation).toBe("reject");
	});

	it("cas `break-experience` → reste aligné, card ADVISORY (X ne bloque pas)", () => {
		const c = conscienceCaseById("break-experience");
		expect(c).toBeDefined();
		if (!c) return;
		const report = caseReport(c);
		expect(report.verdict).toBe("aligned");
		const cards = decisionCardsV2(report);
		const xCard = cards.find((c2) => c2.card.facet === "X" && c2.card.advisory);
		expect(xCard).toBeDefined();
	});
});
