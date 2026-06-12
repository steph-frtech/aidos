import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { levelMirrorForm } from "../besoin-completeness";
import { allLevels, SOURCE_ORDER } from "../besoin-grammar";
import {
	growComposes,
	nodeByPath,
	nodePath,
	seedComposes,
} from "./composition";
import {
	type Besoin,
	composeIdea,
	FACET_LETTERS,
	ideaHash,
	MIN_INTENT_LEN,
	PROVENANCES,
	selectableLevels,
	validateBesoin,
	verticaleOrder,
} from "./idea";
import type { KernelNode } from "./kernel-tree";

/**
 * Miroir de reproductibilité (∀) pour WB2-03 — le twin de l'IDÉE lib/v2/idea.ts, rendu en
 * wizard XState sur /v2/idee.
 * mirror record: reflects=WB2-03-idea, test_kind=property, cert_language=fast-check,
 * liveness=live, authority=above (au-dessus du mur : l'idée PROPOSE, n'écrit aucune vérité).
 *
 * Les invariants sont le ROUGE HUMAIN du critère de done WB2-03 (« twin pur besoin → coordonnée,
 * déterministe » + « jamais une écriture-vérité »), PAS inventés pour être satisfaits :
 *   1. LE MUR (§2/§115) : toute idée composée a hasMirror=false ET wroteKernel=false — jamais
 *      une écriture-vérité, jamais un miroir.
 *   2. COORDONNÉE TOTALE : pour un besoin valide, la coordonnée reprend exactement le niveau,
 *      la facette et l'échelle saisis (aucune fabrication, aucun alias).
 *   3. FORME DE MIROIR = LA TABLE EL10 : expectedMirrorForm === levelMirrorForm(level) — la
 *      forme est RÉUTILISÉE (pas un fork), jamais apprise.
 *   4. DÉTERMINISME : même (besoin, arbre) → même idée (empreinte byte-identique sur replays).
 *   5. VALIDATION TOTALE & FAIL-CLOSED (ADR 0055) : l'échelle est un CHEMIN dans l'arbre
 *      composes (§49/§108) — un chemin MEMBRE passe (sous TOUTE croissance growComposes), un
 *      chemin HORS de l'arbre est refusé (scale_unknown), jamais composé en douce ; texte court /
 *      niveau / facette / provenance hors jeu clos refusés avec le diagnostic exact.
 */

// Générateurs des jeux clos (réutilisés des sources, jamais codés en dur ici).
const levelArb = fc.constantFrom(...allLevels());
const facetArb = fc.constantFrom(...FACET_LETTERS);
const provenanceArb = fc.constantFrom(...PROVENANCES);
const intentArb = fc
	.string({ minLength: MIN_INTENT_LEN, maxLength: 80 })
	.filter((s) => s.trim().length >= MIN_INTENT_LEN);

// L'ÉCHELLE n'est PLUS un jeu clos (ADR 0055) : on CULTIVE des arbres composes depuis le seed
// canonique (growComposes — append-only, idempotent ; une greffe vide est fail-closed sans effet)
// et l'échelle est TIRÉE parmi les CHEMINS MEMBRES de l'arbre cultivé (nodePath).
const SEED = seedComposes();

const grownTreeArb: fc.Arbitrary<readonly KernelNode[]> = fc
	.array(fc.tuple(fc.nat(), fc.string({ minLength: 1, maxLength: 12 })), {
		maxLength: 5,
	})
	.map((grafts) =>
		grafts.reduce<readonly KernelNode[]>(
			(tree, [pick, label]) =>
				growComposes(tree, tree[pick % tree.length].id, label),
			SEED,
		),
	);

// Un cas valide : un arbre cultivé + un besoin dont l'échelle est le chemin d'un nœud MEMBRE.
const validCaseArb: fc.Arbitrary<{
	tree: readonly KernelNode[];
	besoin: Besoin;
}> = fc
	.record({
		tree: grownTreeArb,
		pick: fc.nat(),
		intent: intentArb,
		level: levelArb,
		facet: facetArb,
		provenance: provenanceArb,
	})
	.map(({ tree, pick, intent, level, facet, provenance }) => ({
		tree,
		besoin: {
			intent,
			level,
			facet,
			scale: nodePath(tree, tree[pick % tree.length].id).join("/"),
			provenance,
		},
	}));

describe("WB2-03 idea twin — le candidat-vérité (§115), au-dessus du mur", () => {
	it("1. LE MUR : toute idée composée a hasMirror=false ET wroteKernel=false", () => {
		fc.assert(
			fc.property(validCaseArb, ({ tree, besoin }) => {
				const r = composeIdea(besoin, tree);
				expect(r.ok).toBe(true);
				if (r.ok) {
					expect(r.idea.hasMirror).toBe(false);
					expect(r.idea.wroteKernel).toBe(false);
				}
			}),
		);
	});

	it("2. COORDONNÉE TOTALE : la coordonnée reprend exactement le besoin saisi", () => {
		fc.assert(
			fc.property(validCaseArb, ({ tree, besoin: b }) => {
				const r = composeIdea(b, tree);
				expect(r.ok).toBe(true);
				if (r.ok) {
					expect(r.idea.coordinate.level).toBe(b.level);
					expect(r.idea.coordinate.facet).toBe(b.facet);
					expect(r.idea.coordinate.scale).toBe(b.scale);
					expect(r.idea.provenance).toBe(b.provenance);
					expect(r.idea.intent).toBe(b.intent.trim());
				}
			}),
		);
	});

	it("3. FORME DE MIROIR = la table EL10 (levelMirrorForm), réutilisée", () => {
		fc.assert(
			fc.property(validCaseArb, ({ tree, besoin: b }) => {
				const r = composeIdea(b, tree);
				expect(r.ok).toBe(true);
				if (r.ok) {
					expect(r.idea.expectedMirrorForm).toBe(levelMirrorForm(b.level));
				}
			}),
		);
	});

	it("4. DÉTERMINISME : même (besoin, arbre) → même idée (empreinte byte-identique)", () => {
		fc.assert(
			fc.property(validCaseArb, ({ tree, besoin: b }) => {
				const a = composeIdea(b, tree);
				const c = composeIdea({ ...b }, [...tree]);
				expect(a.ok).toBe(true);
				expect(c.ok).toBe(true);
				if (a.ok && c.ok) {
					expect(a.idea.id).toBe(c.idea.id);
					expect(a.idea).toEqual(c.idea);
				}
			}),
		);
	});

	it("5a. VALIDATION : un texte trop court est refusé (intent_too_short)", () => {
		fc.assert(
			fc.property(
				fc.string({ maxLength: MIN_INTENT_LEN - 1 }),
				validCaseArb,
				(intent, { tree, besoin }) => {
					fc.pre(intent.trim().length < MIN_INTENT_LEN);
					const r = composeIdea({ ...besoin, intent }, tree);
					expect(r.ok).toBe(false);
					if (!r.ok) expect(r.errors).toContain("intent_too_short");
				},
			),
		);
	});

	it("5b. VALIDATION : un niveau hors grammaire est refusé (level_unknown)", () => {
		const r = composeIdea(
			{
				intent: "un vrai besoin",
				level: "saga",
				facet: "F",
				scale: "app/paiement/checkout",
				provenance: "humain",
			},
			SEED,
		);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.errors).toContain("level_unknown");
	});

	it("5c. VALIDATION : facette / échelle / provenance hors source refusées", () => {
		const r = composeIdea(
			{
				intent: "un vrai besoin",
				level: "product",
				facet: "Z",
				scale: "galaxie", // un chemin qui ne résout AUCUN nœud de l'arbre composes
				provenance: "robot",
			},
			SEED,
		);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.errors).toContain("facet_unknown");
			expect(r.errors).toContain("scale_unknown");
			expect(r.errors).toContain("provenance_unknown");
		}
	});

	it("5d. ÉCHELLE FAIL-CLOSED (ADR 0055) : un chemin HORS de l'arbre ⇒ scale_unknown", () => {
		fc.assert(
			fc.property(grownTreeArb, fc.string({ maxLength: 30 }), (tree, scale) => {
				fc.pre(nodeByPath(tree, scale) === null);
				const errs = validateBesoin(
					{
						intent: "un vrai besoin",
						level: "product",
						facet: "F",
						scale,
						provenance: "humain",
					},
					tree,
				);
				expect(errs).toContain("scale_unknown");
			}),
		);
	});

	it("5e. ÉCHELLE MEMBRE (ADR 0055) : tout chemin d'un nœud de l'arbre cultivé passe", () => {
		fc.assert(
			fc.property(validCaseArb, ({ tree, besoin }) => {
				expect(validateBesoin(besoin, tree)).not.toContain("scale_unknown");
				const r = composeIdea(besoin, tree);
				expect(r.ok).toBe(true);
			}),
		);
	});

	it("validateBesoin est l'oracle de composeIdea (cohérence ok ⇔ aucune erreur)", () => {
		fc.assert(
			fc.property(
				fc.record({
					intent: fc.string({ maxLength: 30 }),
					level: fc.string({ maxLength: 12 }),
					facet: fc.string({ maxLength: 2 }),
					scale: fc.string({ maxLength: 10 }),
					provenance: fc.string({ maxLength: 8 }),
				}),
				grownTreeArb,
				(b, tree) => {
					const errs = validateBesoin(b, tree);
					const r = composeIdea(b, tree);
					expect(r.ok).toBe(errs.length === 0);
				},
			),
		);
	});

	it("ideaHash est stable et content-adressé (même entrée → même empreinte)", () => {
		fc.assert(
			fc.property(validCaseArb, ({ tree, besoin }) => {
				const r = composeIdea(besoin, tree);
				expect(r.ok).toBe(true);
				if (!r.ok) return;
				const coord = r.idea.coordinate;
				const h1 = ideaHash(r.idea.intent, coord, r.idea.provenance);
				const h2 = ideaHash(r.idea.intent, coord, r.idea.provenance);
				expect(h1).toBe(h2);
				expect(h1).toMatch(/^[0-9a-f]{8}$/);
			}),
		);
	});

	it("les niveaux proposables = la grammaire besoin (réutilisée, pas un fork)", () => {
		expect(selectableLevels()).toEqual(allLevels());
		expect(verticaleOrder()).toEqual([...SOURCE_ORDER]);
	});
});
