// biome-ignore-all lint/suspicious/noThenProperty: « then » est le terme Gherkin canonique (Given/When/Then), la langue ubiquitaire KRD.
/**
 * WB2-10 — le MIROIR DE REPRODUCTIBILITÉ du twin du geste /grill (lib/v2/grill).
 * mirror record: reflects=WB2-10-grill, test_kind=property, cert_language=vitest+fast-check,
 * liveness=live, authority=above (geste au-dessus du mur, PROPOSE — le mur intact).
 *
 * Le twin est PUR & DÉTERMINISTE : ces propriétés (fast-check) + ces assertions canoniques épinglent
 * les critères de done WB2-10 :
 *   - DÉTERMINISME : même brouillon → même sortie (même empreinte, mêmes scénarios affûtés) ;
 *   - ≤ 5 SCÉNARIOS (mandat A) : > 5 scénarios → verdict rejected, jamais une sortie ;
 *   - VERDICT CALCULÉ (§8) : intention vide / > 5 → rejected ; scénario manquant/incomplet → fuzzy ;
 *     intention + ≤ 5 scénarios complets → sharp ;
 *   - AFFÛTAGE IDEMPOTENT : affûter deux fois = affûter une fois (les canoniques ne réaffûtent pas) ;
 *   - ADRs CANDIDATS : un par terme affûté distinct, ordonnés (table), dédupliqués ;
 *   - LE MUR : hasMirror et wroteKernel TOUJOURS faux (jamais une écriture-vérité) ;
 *   - canonique : le brouillon de démonstration (2 termes ambigus, 2 scénarios) → sharp, 2 ADRs.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type GrillDraft,
	grillHash,
	MAX_SCENARIOS,
	runGrill,
	type Scenario,
	SHARPEN_TABLE,
	STEP_SLUG,
	scenarioComplete,
	sharpenText,
	syntheticGrillDraft,
	verdictOf,
} from "./grill";

/** Un générateur de scénarios COMPLETS (les trois clauses non-vides). */
function completeScenario(): fc.Arbitrary<Scenario> {
	const clause = fc
		.string({ minLength: 3, maxLength: 30 })
		.filter((s) => s.trim().length > 0);
	return fc.record({ given: clause, when: clause, then: clause });
}

const STEP = "wb2-10-grill";

describe("WB2-10 grill twin — déterminisme & ≤ 5 scénarios & le mur (reproducibility mirror)", () => {
	it("DÉTERMINISME : même brouillon → même empreinte & même sortie", () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 3, maxLength: 80 }),
				fc.array(completeScenario(), {
					minLength: 1,
					maxLength: MAX_SCENARIOS,
				}),
				(intent, scenarios) => {
					const draft: GrillDraft = { intent, scenarios };
					const a = runGrill(draft, STEP);
					const b = runGrill(draft, STEP);
					expect(JSON.stringify(a)).toBe(JSON.stringify(b));
				},
			),
		);
	});

	it("≤ 5 SCÉNARIOS (mandat A) : > 5 scénarios → rejected, jamais une sortie", () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 3, maxLength: 40 }),
				fc.array(completeScenario(), {
					minLength: MAX_SCENARIOS + 1,
					maxLength: MAX_SCENARIOS + 4,
				}),
				(intent, scenarios) => {
					const r = runGrill({ intent, scenarios }, STEP);
					expect(r.ok).toBe(false);
					if (!r.ok) expect(r.issues).toContain("too_many_scenarios");
				},
			),
		);
	});

	it("VERDICT CALCULÉ : intention + ≤ 5 scénarios complets → sharp", () => {
		fc.assert(
			fc.property(
				fc
					.string({ minLength: 3, maxLength: 40 })
					.filter((s) => s.trim().length >= 3),
				fc.array(completeScenario(), {
					minLength: 1,
					maxLength: MAX_SCENARIOS,
				}),
				(intent, scenarios) => {
					const r = runGrill({ intent, scenarios }, STEP);
					expect(r.ok).toBe(true);
					if (r.ok) expect(r.intention.verdict).toBe("sharp");
				},
			),
		);
	});

	it("VERDICT CALCULÉ : aucun scénario → fuzzy (pas encore falsifiable)", () => {
		fc.assert(
			fc.property(
				fc
					.string({ minLength: 3, maxLength: 40 })
					.filter((s) => s.trim().length >= 3),
				(intent) => {
					const r = runGrill({ intent, scenarios: [] }, STEP);
					expect(r.ok).toBe(true);
					if (r.ok) expect(r.intention.verdict).toBe("fuzzy");
				},
			),
		);
	});

	it("VERDICT CALCULÉ : un scénario incomplet → fuzzy", () => {
		const r = runGrill(
			{
				intent: "une intention nette",
				scenarios: [{ given: "x", when: "", then: "y" }],
			},
			STEP,
		);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.intention.verdict).toBe("fuzzy");
	});

	it("VERDICT CALCULÉ : intention vide → rejected", () => {
		const r = runGrill(
			{ intent: "", scenarios: [{ given: "a", when: "b", then: "c" }] },
			STEP,
		);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.issues).toContain("intent_too_short");
	});

	it("AFFÛTAGE IDEMPOTENT : affûter deux fois = affûter une fois", () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 80 }), (text) => {
				const once = sharpenText(text).sharpened;
				const twice = sharpenText(once).sharpened;
				expect(twice).toBe(once);
			}),
		);
	});

	it("AFFÛTAGE : un terme ambigu connu est remplacé par son canonique", () => {
		const { sharpened, applied } = sharpenText("Je code une feature en bdd");
		expect(sharpened).toContain("cellule");
		expect(sharpened).toContain("miroir");
		expect(sharpened).not.toMatch(/\bfeature\b/i);
		const froms = applied.map((a) => a[0]);
		expect(froms).toContain("feature");
		expect(froms).toContain("bdd");
	});

	it("LE MUR : hasMirror & wroteKernel TOUJOURS faux", () => {
		fc.assert(
			fc.property(
				fc
					.string({ minLength: 3, maxLength: 40 })
					.filter((s) => s.trim().length >= 3),
				fc.array(completeScenario(), {
					minLength: 1,
					maxLength: MAX_SCENARIOS,
				}),
				(intent, scenarios) => {
					const r = runGrill({ intent, scenarios }, STEP);
					expect(r.ok).toBe(true);
					if (r.ok) {
						expect(r.intention.hasMirror).toBe(false);
						expect(r.intention.wroteKernel).toBe(false);
					}
				},
			),
		);
	});

	it("ADRs CANDIDATS : un par terme affûté distinct, ordonnés (table), dédupliqués", () => {
		const r = runGrill(
			{
				intent: "Une feature avec un test, encore une feature et un test",
				scenarios: [{ given: "un goal", when: "le wall tient", then: "ok" }],
			},
			STEP,
		);
		expect(r.ok).toBe(true);
		if (r.ok) {
			const tos = r.intention.candidateAdrs.map((a) => a.to);
			// déduplication : « feature » et « test » répétés → une seule ADR chacun.
			expect(new Set(tos).size).toBe(tos.length);
			expect(tos).toContain("cellule");
			expect(tos).toContain("miroir");
			expect(tos).toContain("/goal");
			expect(tos).toContain("mur");
			// ordre = ordre de la table SHARPEN_TABLE (déterministe).
			const tableTos = SHARPEN_TABLE.map((e) => e[1]);
			const idxs = tos.map((t) => tableTos.indexOf(t));
			expect(idxs).toEqual([...idxs].sort((a, b) => a - b));
		}
	});

	it("CANONIQUE : le brouillon de démonstration → sharp, 2 ADRs (feature, bdd), 2 scénarios", () => {
		const r = runGrill(syntheticGrillDraft(), STEP_SLUG);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.intention.verdict).toBe("sharp");
			expect(r.intention.scenarios).toHaveLength(2);
			const froms = r.intention.candidateAdrs.map((a) => a.from);
			expect(froms).toContain("feature");
			expect(froms).toContain("bdd");
			expect(r.intention.sharpenedIntent).toContain("cellule");
			expect(r.intention.sharpenedIntent).toContain("miroir");
			expect(r.intention.docSeed.conceptPath).toBe(
				"steps/concept/wb2-10-grill.mdx",
			);
			expect(r.intention.docSeed.internalsPath).toBe(
				"steps/internals/wb2-10-grill.mdx",
			);
		}
	});

	it("EMPREINTE : content-adressée — toute mutation des scénarios la change", () => {
		const base: Scenario[] = [{ given: "a", when: "b", then: "c" }];
		const h1 = grillHash("intention", base);
		const h2 = grillHash("intention", [{ given: "a", when: "b", then: "d" }]);
		expect(h1).not.toBe(h2);
		expect(grillHash("intention", base)).toBe(h1);
	});

	it("scenarioComplete : vrai ssi les trois clauses non-vides", () => {
		expect(scenarioComplete({ given: "a", when: "b", then: "c" })).toBe(true);
		expect(scenarioComplete({ given: "", when: "b", then: "c" })).toBe(false);
		expect(scenarioComplete({ given: "a", when: " ", then: "c" })).toBe(false);
	});

	it("verdictOf : la grammaire est totale (rejected domine fuzzy domine sharp)", () => {
		expect(verdictOf(["intent_too_short"])).toBe("rejected");
		expect(verdictOf(["too_many_scenarios"])).toBe("rejected");
		expect(verdictOf(["no_scenario"])).toBe("fuzzy");
		expect(verdictOf(["scenario_incomplete"])).toBe("fuzzy");
		expect(verdictOf([])).toBe("sharp");
	});
});
