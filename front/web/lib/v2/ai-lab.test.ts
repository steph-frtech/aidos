/**
 * WB2-15 — le MIROIR DE REPRODUCTIBILITÉ du twin AI LAB (cerveau gauche → placement gaté).
 *
 * Déterminisme-first (CLAUDE.md §6/§8) : le CLAMP est une fonction PURE & TOTALE — ce miroir
 * (Vitest + fast-check) l'épingle. Les propriétés cardinales :
 *   - DÉTERMINISME : `placeNeed(m, r)` deux fois → le MÊME résultat.
 *   - LE CLAMP : ∀ placement gardé est dans l'ESPACE DÉCLARÉ (niveau × facette × paire) — un niveau/
 *     facette/paire inventé est JETÉ, jamais coercé.
 *   - LE MUR : ∀ message d'écriture-vérité → un WallRefusal, JAMAIS un placement.
 *   - LE FALLBACK DÉTERMINISTE : même message → même placement par défaut (pur, sans LLM).
 *   - LA BIJECTION slug↔cellule sur l'espace déclaré.
 *   - LE MULTI-NIVEAUX : un besoin fan-out sur plusieurs niveaux (le critère de done « specs placées
 *     multi-niveaux »).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	ALL_FACETS,
	ANATOMY_ORDER,
	cellBySlug,
	cellPlacements,
	countsByLevel,
	descendPair,
	fallbackPlacements,
	isDeclaredCell,
	isLastPair,
	isTruthWriteRequest,
	levelsTouched,
	MIRROR_PAIRS,
	NEED_SAMPLES,
	needSampleById,
	needSampleIds,
	nextPairId,
	PLACEMENT_SPACE,
	type Placement,
	pairLabel,
	pairRank,
	placementSlug,
	placeNeed,
	SPACE_COUNTS,
	VERTICAL_LEVELS,
} from "./ai-lab";

const TRUTH_WRITE_MESSAGES = [
	"écris la vérité maintenant",
	"write the kernel directly",
	"modifie le miroir",
	"freeze this truth",
	"gèle la vérité du checkout",
];

// un placement BRUT arbitraire — niveau/facette/paire possiblement INVENTÉS (le clamp les jette).
const rawPlacementArb = fc.record({
	level: fc.oneof(
		fc.constantFrom(...VERTICAL_LEVELS),
		fc.constantFrom("galaxie", "molecule", "atom"), // niveaux inventés
	),
	facet: fc.oneof(
		fc.constantFrom(...ALL_FACETS),
		fc.constantFrom("Z", "Q", "K"), // facettes inventées
	),
	pairId: fc.oneof(
		fc.constantFrom(...MIRROR_PAIRS.map((p) => p.id)),
		fc.constantFrom("invented", "ghost"), // paires inventées
	),
	spec: fc.string({ minLength: 1, maxLength: 40 }),
});

describe("WB2-15 — l'espace déclaré (7 × 8 × 6)", () => {
	it("a 7 niveaux, 8 facettes, 6 paires = 336 cellules", () => {
		expect(SPACE_COUNTS.levels).toBe(7);
		expect(SPACE_COUNTS.facets).toBe(8);
		expect(SPACE_COUNTS.pairs).toBe(6);
		expect(SPACE_COUNTS.cells).toBe(7 * 8 * 6);
		expect(PLACEMENT_SPACE).toHaveLength(336);
	});

	it("chaque cellule de l'espace est déclarée (le prédicat du clamp)", () => {
		for (const c of PLACEMENT_SPACE) expect(isDeclaredCell(c)).toBe(true);
	});

	it("rejette une cellule hors de l'espace déclaré (niveau/facette/paire inventé)", () => {
		expect(
			isDeclaredCell({ level: "produit", facet: "F", pairId: "spec" }),
		).toBe(true);
		// niveau inventé → jeté par le clamp.
		expect(
			isDeclaredCell({
				level: "galaxie" as never,
				facet: "F" as never,
				pairId: "spec",
			}),
		).toBe(false);
		// facette inventée → jetée par le clamp.
		expect(
			isDeclaredCell({
				level: "produit" as never,
				facet: "Z" as never,
				pairId: "spec",
			}),
		).toBe(false);
		expect(
			isDeclaredCell({ level: "produit", facet: "F", pairId: "ghost" }),
		).toBe(false);
	});

	it("BIJECTION slug↔cellule sur tout l'espace déclaré", () => {
		const slugs = new Set<string>();
		for (const c of PLACEMENT_SPACE) {
			const slug = placementSlug(c);
			expect(slugs.has(slug)).toBe(false); // unique
			slugs.add(slug);
			const back = cellBySlug(slug);
			expect(back).toEqual(c);
		}
		expect(slugs.size).toBe(PLACEMENT_SPACE.length);
		expect(cellBySlug("inconnu-Z-ghost")).toBeUndefined();
	});
});

describe("WB2-15 — placeNeed : gaté, clampé, déterministe", () => {
	it("DÉTERMINISME : placeNeed deux fois → le même résultat", () => {
		fc.assert(
			fc.property(
				fc.string({ maxLength: 30 }),
				fc.array(rawPlacementArb, { maxLength: 8 }),
				(message, raw) => {
					const a = placeNeed(message, raw);
					const b = placeNeed(message, raw);
					expect(a).toEqual(b);
				},
			),
		);
	});

	it("LE CLAMP : ∀ placement gardé est dans l'espace déclaré", () => {
		fc.assert(
			fc.property(fc.array(rawPlacementArb, { maxLength: 12 }), (raw) => {
				const r = placeNeed("besoin ordinaire", raw);
				expect(r.refused).toBe(false);
				if (!r.refused) {
					for (const p of r.placements) {
						expect(isDeclaredCell(p)).toBe(true);
					}
				}
			}),
		);
	});

	it("LE MUR : ∀ message d'écriture-vérité → WallRefusal, jamais un placement", () => {
		for (const message of TRUTH_WRITE_MESSAGES) {
			expect(isTruthWriteRequest(message)).toBe(true);
			const r = placeNeed(message, [
				{ level: "produit", facet: "F", pairId: "spec", spec: "x" },
			]);
			expect(r.refused).toBe(true);
			if (r.refused) {
				expect(r.code).toBe("AI_LAB_DIRECT_TRUTH_WRITE");
				expect(r.howToFix.length).toBeGreaterThan(0);
			}
		}
	});

	it("un message ordinaire NE refuse JAMAIS (le mur ne bloque que l'écriture-vérité)", () => {
		fc.assert(
			fc.property(
				fc.string({ maxLength: 40 }).filter((m) => !isTruthWriteRequest(m)),
				(message) => {
					const r = placeNeed(message, [
						{ level: "produit", facet: "F", pairId: "spec", spec: "x" },
					]);
					expect(r.refused).toBe(false);
				},
			),
		);
	});
});

describe("WB2-15 — multi-niveaux + fallback déterministe", () => {
	it("MULTI-NIVEAUX : le besoin checkout fan-out sur plusieurs niveaux", () => {
		const sample = needSampleById("checkout-multi");
		expect(sample).toBeDefined();
		if (!sample) return;
		const r = placeNeed(sample.message, sample.raw);
		expect(r.refused).toBe(false);
		if (!r.refused) {
			const levels = levelsTouched(r.placements);
			expect(levels.length).toBeGreaterThanOrEqual(3); // multi-niveaux
			// la cellule inventée (niveau « galaxie ») a été jetée par le clamp.
			expect(r.placements.every((p) => p.level !== ("galaxie" as never))).toBe(
				true,
			);
		}
	});

	it("le besoin secret-field clampe la facette inventée Z", () => {
		const sample = needSampleById("secret-field");
		if (!sample) return;
		const r = placeNeed(sample.message, sample.raw);
		expect(r.refused).toBe(false);
		if (!r.refused) {
			for (const p of r.placements) expect(isDeclaredCell(p)).toBe(true);
			expect(
				r.placements.some((p) => p.level === "entité" && p.facet === "S"),
			).toBe(true);
			expect(r.placements.every((p) => (p.facet as string) !== "Z")).toBe(true);
		}
	});

	it("FALLBACK DÉTERMINISTE : même message → même placement par défaut", () => {
		fc.assert(
			fc.property(fc.string({ minLength: 1, maxLength: 40 }), (message) => {
				const a = fallbackPlacements(message);
				const b = fallbackPlacements(message);
				expect(a).toEqual(b);
				if (message.trim()) {
					expect(a).toHaveLength(1);
					expect(isDeclaredCell(a[0])).toBe(true);
					expect(a[0].level).toBe("produit");
				}
			}),
		);
	});

	it("le fallback sur message vide ne place rien", () => {
		expect(fallbackPlacements("   ")).toEqual([]);
	});

	it("countsByLevel somme exactement le nombre de placements gardés", () => {
		const sample = needSampleById("checkout-multi");
		if (!sample) return;
		const r = placeNeed(sample.message, sample.raw);
		if (!r.refused) {
			const counts = countsByLevel(r.placements);
			const total = Object.values(counts).reduce((a, b) => a + b, 0);
			expect(total).toBe(r.placements.length);
		}
	});
});

describe("WB2-15 — registre clos des besoins d'exemple", () => {
	it("les ids sont uniques et résolvables", () => {
		const ids = needSampleIds();
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(needSampleById(id)).toBeDefined();
		expect(needSampleById("inconnu")).toBeUndefined();
	});

	it("chaque besoin d'exemple inclut au moins une cellule inventée (pour prouver le clamp)", () => {
		for (const s of NEED_SAMPLES) {
			const r = placeNeed(s.message, s.raw);
			expect(r.refused).toBe(false);
			if (!r.refused && Array.isArray(s.raw)) {
				// le clamp a jeté au moins une entrée brute.
				expect(r.placements.length).toBeLessThan((s.raw as unknown[]).length);
			}
		}
	});
});

// ── WB2-16 — LA DESCENTE de l'anatomie (valider une spec → la paire suivante) ──

const PAIR_IDS = MIRROR_PAIRS.map((p) => p.id);

/** une cellule racine (spec seule) sur un (niveau, facette) — le point de départ d'une descente. */
function rootCell(level: string, facet: string): Placement[] {
	return [
		{
			level: level as Placement["level"],
			facet: facet as Placement["facet"],
			pairId: "spec",
			spec: "racine de la descente",
		},
	];
}

describe("WB2-16 — which-pair déterministe (l'ordre de l'anatomie)", () => {
	it("l'anatomie a 6 paires en ordre Spec→Comportement→Scénarios→Modèle→Contrat→Evidence", () => {
		expect(ANATOMY_ORDER).toEqual([
			"spec",
			"behavior",
			"scenarios",
			"model",
			"contract",
			"evidence",
		]);
		expect(ANATOMY_ORDER).toHaveLength(6);
	});

	it("nextPairId chaîne chaque paire à la suivante, et undefined à la dernière", () => {
		for (let i = 0; i < PAIR_IDS.length - 1; i++) {
			expect(nextPairId(PAIR_IDS[i])).toBe(PAIR_IDS[i + 1]);
			expect(isLastPair(PAIR_IDS[i])).toBe(false);
		}
		expect(nextPairId("evidence")).toBeUndefined();
		expect(isLastPair("evidence")).toBe(true);
		expect(nextPairId("inconnu")).toBeUndefined();
		expect(isLastPair("inconnu")).toBe(false);
	});

	it("pairRank + pairLabel sont totaux et stables", () => {
		expect(pairRank("spec")).toBe(0);
		expect(pairRank("evidence")).toBe(5);
		expect(pairRank("inconnu")).toBe(-1);
		expect(pairLabel("spec")).toBe("Spec");
		expect(pairLabel("evidence")).toBe("Evidence");
		expect(pairLabel("inconnu")).toBe("inconnu");
	});

	it("WHICH-PAIR DÉTERMINISTE (property) : nextPairId(p) ne dépend QUE de p", () => {
		fc.assert(
			fc.property(
				fc.oneof(
					fc.constantFrom(...PAIR_IDS),
					fc.constantFrom("inconnu", "ghost", "spec2"),
				),
				(pairId) => {
					expect(nextPairId(pairId)).toBe(nextPairId(pairId));
					const i = ANATOMY_ORDER.indexOf(pairId);
					const expected =
						i >= 0 && i < ANATOMY_ORDER.length - 1
							? ANATOMY_ORDER[i + 1]
							: undefined;
					expect(nextPairId(pairId)).toBe(expected);
				},
			),
		);
	});
});

describe("WB2-16 — descendPair : gaté, déterministe, le mur tient", () => {
	it("DÉTERMINISME (property) : descendPair deux fois → le même résultat", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...VERTICAL_LEVELS),
				fc.constantFrom(...ALL_FACETS),
				fc.constantFrom(...PAIR_IDS),
				(level, facet, pairId) => {
					const cell: Placement[] = [
						{
							level,
							facet,
							pairId,
							spec: "x",
						},
					];
					const a = descendPair(cell, level, facet, pairId);
					const b = descendPair(cell, level, facet, pairId);
					expect(a).toEqual(b);
				},
			),
		);
	});

	it("valider spec → génère behavior (la paire suivante), parent validé", () => {
		const r = descendPair(rootCell("produit", "F"), "produit", "F", "spec");
		expect(r.nextPair).toBe("behavior");
		expect(r.realized).toBe(false);
		const cell = cellPlacements(r.placements, "produit", "F");
		expect(cell.map((p) => p.pairId)).toEqual(["spec", "behavior"]);
		expect(cell[0].status).toBe("validated");
		// la fille est PROPOSÉE : v1 n'encode pas le statut « proposed » par défaut (undefined = proposé).
		expect(cell[1].status ?? "proposed").toBe("proposed");
	});

	it("LA DESCENTE CHAÎNE : spec→…→evidence, la dernière paire est RÉALISÉE", () => {
		let placements = rootCell("entité", "F");
		let realized = false;
		for (const pairId of PAIR_IDS) {
			const r = descendPair(placements, "entité", "F", pairId);
			placements = r.placements;
			realized = r.realized;
		}
		// les 6 paires de l'anatomie ont été générées dans la cellule.
		const cell = cellPlacements(placements, "entité", "F");
		expect(cell.map((p) => p.pairId)).toEqual(PAIR_IDS);
		// la descente est complète : la dernière paire (evidence) est « réalisée ».
		expect(realized).toBe(true);
		expect(cell[cell.length - 1].status).toBe("realized");
	});

	it("ENRICHISSEMENT GATÉ vs FALLBACK TEMPLATE : Claude écrit le texte, sinon le template", () => {
		// fallback déterministe : pas d'override → la spec dérivée (deriveNextSpec).
		const fb = descendPair(
			rootCell("opération", "F"),
			"opération",
			"F",
			"spec",
		);
		expect(fb.enriched).toBe(false);
		const fbChild = cellPlacements(fb.placements, "opération", "F").find(
			(p) => p.pairId === "behavior",
		);
		expect(fbChild?.spec).toContain("dérivé de");
		// enrichi : override Claude → son texte EXACT.
		const en = descendPair(
			rootCell("opération", "F"),
			"opération",
			"F",
			"spec",
			{
				spec: "Le panier doit rester cohérent à chaque ajout",
			},
		);
		expect(en.enriched).toBe(true);
		const enChild = cellPlacements(en.placements, "opération", "F").find(
			(p) => p.pairId === "behavior",
		);
		expect(enChild?.spec).toBe("Le panier doit rester cohérent à chaque ajout");
	});

	it("LE MUR : la dernière paire ne génère PAS de fille (réalisé), enriched=false à evidence", () => {
		const cell: Placement[] = [
			{ level: "entité", facet: "F", pairId: "evidence", spec: "evidence" },
		];
		const r = descendPair(cell, "entité", "F", "evidence", { spec: "ignoré" });
		expect(r.nextPair).toBeUndefined();
		expect(r.realized).toBe(true);
		expect(r.enriched).toBe(false); // à la dernière paire l'override ne crée aucune fille.
	});

	it("cellule inconnue = no-op (le mur §2 : aucune écriture, liste inchangée)", () => {
		const cell = rootCell("produit", "F");
		const r = descendPair(cell, "galaxie" as never, "F", "spec");
		expect(r.placements).toEqual(cell);
		expect(r.nextPair).toBeUndefined();
		expect(r.realized).toBe(false);
	});
});
