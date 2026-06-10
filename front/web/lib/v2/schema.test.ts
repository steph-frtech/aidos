import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { GLOSSARY, type Locale } from "./glossary";
import {
	isSchemaTotal,
	nodeLabel,
	nodePosition,
	SCHEMA_EDGES,
	SCHEMA_NODES,
	schemaHash,
	TIER_ORDER,
} from "./schema";

/**
 * Miroir de reproductibilité (∀) pour WB2-02 — le schéma KRD lib/v2/schema.ts, projeté du
 * glossaire et rendu en diagramme cliquable sur /v2.
 * mirror record: reflects=WB2-02-schema, test_kind=property, cert_language=fast-check,
 * liveness=live, authority=below (sous la ligne : lecture seule, le mur intact).
 *
 * Les invariants sont le ROUGE HUMAIN du critère de done WB2-02 (« les libellés viennent du
 * glossaire — pas de chaîne en dur » + « chaque bloc navigue vers son écran »), PAS inventés
 * pour être satisfaits :
 *   1. TOTALITÉ : chaque nœud cible un slug canonique du glossaire ; chaque arête relie deux
 *      nœuds ; aucun nœud dupliqué (pas de lien mort, pas de bloc orphelin).
 *   2. LIBELLÉS DU GLOSSAIRE : nodeLabel(slug) === le libellé du glossaire, en FR comme en EN
 *      (aucune chaîne de schéma en dur).
 *   3. DÉTERMINISME : nodePosition / schemaHash sont des fonctions pures & totales (même → même).
 */

const LOCALES: readonly Locale[] = ["fr", "en"];

describe("WB2-02 — le schéma est total (pas de lien mort)", () => {
	it("LAW 1 — chaque nœud cible un slug canonique, chaque arête relie deux nœuds", () => {
		expect(isSchemaTotal()).toBe(true);
	});

	it("LAW 1 — chaque slug de nœud existe dans le glossaire", () => {
		const glossarySlugs = new Set(GLOSSARY.map((e) => e.slug));
		for (const n of SCHEMA_NODES) {
			expect(glossarySlugs.has(n.slug)).toBe(true);
		}
	});

	it("LAW 1 — chaque étage de nœud est un étage canonique", () => {
		for (const n of SCHEMA_NODES) {
			expect(TIER_ORDER).toContain(n.tier);
		}
	});

	it("LAW 1 — chaque extrémité d'arête est un nœud du schéma", () => {
		const slugs = new Set(SCHEMA_NODES.map((n) => n.slug));
		for (const e of SCHEMA_EDGES) {
			expect(slugs.has(e.from)).toBe(true);
			expect(slugs.has(e.to)).toBe(true);
		}
	});

	it("LAW 1 — le schéma couvre les neuf concepts canoniques (aucun orphelin)", () => {
		const nodeSlugs = new Set(SCHEMA_NODES.map((n) => n.slug));
		for (const e of GLOSSARY) {
			expect(nodeSlugs.has(e.slug)).toBe(true);
		}
	});
});

describe("WB2-02 — les libellés viennent du glossaire (pas de chaîne en dur)", () => {
	it("LAW 2 — nodeLabel(slug) === le libellé du glossaire (FR + EN)", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...SCHEMA_NODES.map((n) => n.slug)),
				fc.constantFrom(...LOCALES),
				(slug, locale) => {
					const e = GLOSSARY.find((g) => g.slug === slug);
					expect(e).toBeDefined();
					expect(nodeLabel(slug, locale)).toBe(e?.[locale].label);
				},
			),
		);
	});

	it("LAW 2 — un slug hors-glossaire donne un libellé vide (total, pas de fabrication)", () => {
		expect(nodeLabel("__inconnu__", "fr")).toBe("");
		expect(nodeLabel("", "en")).toBe("");
	});
});

describe("WB2-02 — le layout est déterministe (même → même)", () => {
	it("LAW 3 — nodePosition est pure & stable sur appels répétés", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...SCHEMA_NODES.map((n) => n.slug)),
				(slug) => {
					expect(nodePosition(slug)).toEqual(nodePosition(slug));
				},
			),
		);
	});

	it("LAW 3 — l'étage gouverne le y (l'entrée au-dessus du mur, sous le mur la verticale)", () => {
		const yIdee = nodePosition("idee").y;
		const yMur = nodePosition("mur").y;
		const yKernel = nodePosition("kernel").y;
		expect(yIdee).toBeLessThan(yMur);
		expect(yMur).toBeLessThan(yKernel);
	});

	it("LAW 3 — schemaHash est déterministe (même schéma → même empreinte)", () => {
		expect(schemaHash()).toBe(schemaHash());
		expect(schemaHash()).toMatch(/^[0-9a-f]{8}$/);
	});
});
