import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	def,
	entry,
	GLOSSARY,
	type GlossaryEntry,
	glossaryHash,
	isTotal,
	SLUGS,
	term,
} from "./glossary";
import { FORBIDDEN_FRANGLAIS, lintNav } from "./vocabulary-lint";

/**
 * Miroir de reproductibilité (∀) pour WB2-00 — le glossaire canonique KRD lib/v2/glossary.ts
 * + le lint vocabulaire lib/v2/vocabulary-lint.ts.
 * mirror record: reflects=WB2-00-glossary, test_kind=property, cert_language=fast-check,
 * liveness=live, authority=below (au-dessous de la ligne : lecture seule, le mur intact).
 *
 * Les invariants sont le ROUGE HUMAIN du critère de done WB2-00, PAS inventés pour être
 * satisfaits :
 *   1. TOTALITÉ : chaque concept a un libellé ET une définition NON VIDES en FR ET en EN.
 *   2. PUR FRANÇAIS / PUR ANGLAIS : la nav (les libellés FR) ne contient aucun franglais.
 *   3. DÉTERMINISME : term/def/glossaryHash sont des fonctions pures & totales (même → même).
 */

describe("WB2-00 — le glossaire est total", () => {
	it("LAW 1 — chaque concept a FR+EN+def (totalité)", () => {
		expect(isTotal(GLOSSARY)).toBe(true);
		for (const e of GLOSSARY) {
			expect(e.fr.label.trim()).not.toBe("");
			expect(e.fr.def.trim()).not.toBe("");
			expect(e.en.label.trim()).not.toBe("");
			expect(e.en.def.trim()).not.toBe("");
		}
	});

	it("les slugs sont uniques et stables", () => {
		expect(new Set(SLUGS).size).toBe(SLUGS.length);
		expect(SLUGS.length).toBe(GLOSSARY.length);
	});

	it("isTotal rejette une entrée à cellule vide", () => {
		const broken: GlossaryEntry[] = [
			...GLOSSARY,
			{
				slug: "monstre",
				fr: { label: "", def: "x" },
				en: { label: "Monster", def: "y" },
			},
		];
		expect(isTotal(broken)).toBe(false);
	});

	it("isTotal rejette un slug dupliqué", () => {
		const dup: GlossaryEntry[] = [GLOSSARY[0], GLOSSARY[0]];
		expect(isTotal(dup)).toBe(false);
	});
});

describe("WB2-00 — lint vocabulaire (aucun franglais en nav)", () => {
	it("LAW 2 — la nav issue du glossaire FR est conforme (0 écart)", () => {
		const navLabels = GLOSSARY.map((e) => e.fr.label);
		const verdict = lintNav(navLabels);
		expect(verdict.clean).toBe(true);
		expect(verdict.violations).toEqual([]);
	});

	it("aucun libellé FR ne contient un terme franglais interdit", () => {
		const forbidden = new Set(FORBIDDEN_FRANGLAIS.map((w) => w.toLowerCase()));
		for (const e of GLOSSARY) {
			const tokens = e.fr.label.toLowerCase().split(/\s+/);
			for (const tok of tokens) {
				expect(forbidden.has(tok)).toBe(false);
			}
		}
	});

	it("le lint détecte un libellé hors-glossaire", () => {
		const verdict = lintNav(["Dashboard"]);
		expect(verdict.clean).toBe(false);
		expect(verdict.violations[0].reason).toBe("not-in-glossary");
	});

	it("le lint détecte un franglais explicite", () => {
		// « Wall » est un terme du FORBIDDEN, mais d'abord rejeté car hors-glossaire (FR=« Mur »).
		const verdict = lintNav(["Wall"]);
		expect(verdict.clean).toBe(false);
	});
});

describe("WB2-00 — déterminisme (reproductibilité)", () => {
	it("term/def round-trip sur tout slug canonique, dans les deux locales", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...SLUGS),
				fc.constantFrom("fr" as const, "en" as const),
				(slug, locale) => {
					const e = entry(slug);
					expect(e).toBeDefined();
					expect(term(slug, locale)).toBe(e?.[locale].label);
					expect(def(slug, locale)).toBe(e?.[locale].def);
				},
			),
		);
	});

	it("term/def sont totaux : un slug inconnu rend undefined, jamais une exception", () => {
		fc.assert(
			fc.property(fc.string(), (s) => {
				if (SLUGS.includes(s)) return;
				expect(term(s, "fr")).toBeUndefined();
				expect(def(s, "en")).toBeUndefined();
			}),
		);
	});

	it("glossaryHash est déterministe (même glossaire → même empreinte)", () => {
		expect(glossaryHash(GLOSSARY)).toBe(glossaryHash(GLOSSARY));
		expect(glossaryHash(GLOSSARY)).toMatch(/^[0-9a-f]{8}$/);
		// une entrée modifiée change l'empreinte.
		const altered: GlossaryEntry[] = [
			{ ...GLOSSARY[0], fr: { ...GLOSSARY[0].fr, label: "Idee modifiée" } },
			...GLOSSARY.slice(1),
		];
		expect(glossaryHash(altered)).not.toBe(glossaryHash(GLOSSARY));
	});
});
