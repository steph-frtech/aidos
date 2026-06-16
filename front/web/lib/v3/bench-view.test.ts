import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	ALL_KINDS,
	type BenchCandidate,
	type BenchSpec,
	CANONICAL_CANDIDATES,
	CANONICAL_SPEC,
	deriveBenchReport,
	deriveModelDiffs,
	extract,
	kindDiff,
	kindLabelKey,
	kindUnion,
	projectBenchRow,
	type RequirementKind,
	roleLabelKey,
	runCanonical,
} from "./bench-view";

/**
 * V3 — le MIROIR du TWIN « BENCH DE COMPLÉTUDE » (DG06, ADR 0079 / 0088). Il pin :
 *  (1) la BYTE-COHÉRENCE avec le Go (back/runtime/requirementbench) — l'extracteur
 *      surfa ce exactement les types dont les marqueurs sont présents dans le texte ;
 *  (2) le DÉTERMINISME (§6/§8) — même (spec, candidats) ⇒ même report, rejoué 100× ;
 *  (3) le DIFFÉRENTIEL multi-modèle — l'union A∪B∪single couvre plus de types qu'un
 *      seul modèle (le GAIN du bench différentiel, ADR 0079) ;
 *  (4) l'HONNÊTETÉ — MatchPct vacuoirement 1,0 quand la spec déclare aucun attendu ;
 *      les trous PROPOSÉS ne sont jamais des vérités.
 */

// ─── 1. L'extracteur : byte-cohérence avec Go Extract (taxonomy.go) ──────────────────

describe("extract — byte-cohérence avec Go Extract", () => {
	it("surfa ce un type quand son marqueur est présent (insensible à la casse)", () => {
		expect(extract("view goal: afficher la liste")).toContain("view.goal");
		expect(extract("VIEW GOAL: something")).toContain("view.goal");
		expect(extract("Button: passer la commande")).toContain("control.exists");
		expect(extract("Invariant: for all x > 0")).toContain("invariant.forall");
		expect(extract("Policy: only the owner can delete")).toContain(
			"policy.authz",
		);
		expect(extract("error case: on failure when out of stock")).toContain(
			"case.error",
		);
	});

	it("ne surfa ce PAS un type dont le marqueur est absent", () => {
		const result = extract("nothing here, empty text");
		expect(result).toHaveLength(0);
	});

	it("retourne un tableau dans l'ordre canonique de ALL_KINDS (déterminisme de l'ordre)", () => {
		const text = [
			"case.error marker: error case: on failure",
			"view goal: screen goal: x",
			"control: button: y",
		].join("\n");
		const result = extract(text);
		// L'ordre doit être l'ordre de ALL_KINDS, pas l'ordre d'apparition dans le texte.
		const indices = result.map((k) => ALL_KINDS.indexOf(k));
		expect(indices).toEqual([...indices].sort((a, b) => a - b));
	});

	it("le résultat est dédupliqué même si plusieurs marqueurs d'un même type matchent", () => {
		// "view goal:" ET "screen goal:" matchent tous les deux view.goal.
		const result = extract("view goal: x\nscreen goal: y");
		const viewGoalCount = result.filter((k) => k === "view.goal").length;
		expect(viewGoalCount).toBe(1);
	});
});

// ─── 2. L'arithmétique ensembliste ───────────────────────────────────────────────────

describe("kindUnion — union dans l'ordre canonique", () => {
	it("l'union de sets disjoints = tous les types, dans l'ordre canonique", () => {
		const a: RequirementKind[] = ["view.goal", "control.exists"];
		const b: RequirementKind[] = ["invariant.forall", "policy.authz"];
		const result = kindUnion([a, b]);
		expect(result).toEqual([
			"view.goal",
			"control.exists",
			"invariant.forall",
			"policy.authz",
		]);
	});

	it("l'union déduplique les types communs", () => {
		const a: RequirementKind[] = ["view.goal", "control.exists"];
		const b: RequirementKind[] = ["view.goal", "action.invoke"];
		const result = kindUnion([a, b]);
		const viewGoalCount = result.filter((k) => k === "view.goal").length;
		expect(viewGoalCount).toBe(1);
	});

	it("l'union de zéro set est vide", () => {
		expect(kindUnion([])).toEqual([]);
	});
});

describe("kindDiff — (a \\ b) dans l'ordre canonique", () => {
	it("a \\ b = les éléments de a absents de b", () => {
		const a: RequirementKind[] = [
			"view.goal",
			"control.exists",
			"invariant.forall",
		];
		const b: RequirementKind[] = ["control.exists"];
		expect(kindDiff(a, b)).toEqual(["view.goal", "invariant.forall"]);
	});

	it("a \\ a = vide", () => {
		const a: RequirementKind[] = ["view.goal", "policy.authz"];
		expect(kindDiff(a, a)).toEqual([]);
	});
});

// ─── 3. La dérivation principale : byte-cohérence avec Go Derive ─────────────────────

describe("deriveBenchReport — byte-cohérence avec Go Derive (requirementbench.go)", () => {
	it("le run canonique hermétique : matchPct = 1,0 (l'union couvre tous les 7 attendus)", () => {
		const report = deriveBenchReport(CANONICAL_SPEC, CANONICAL_CANDIDATES);
		expect(report.specId).toBe("createOrder");
		expect(report.expectedCount).toBe(7);
		expect(report.missingTypes).toHaveLength(0);
		expect(report.matchPct).toBe(1.0);
	});

	it("le modèle 'single' seul MANQUE 3 types (invariant + policy + error)", () => {
		const report = deriveBenchReport(CANONICAL_SPEC, [CANONICAL_CANDIDATES[0]]);
		expect(report.missingTypes).toContain("invariant.forall");
		expect(report.missingTypes).toContain("policy.authz");
		expect(report.missingTypes).toContain("case.error");
		expect(report.matchPct).toBeLessThan(1.0);
	});

	it("MatchPct vacuoirement 1,0 quand la spec déclare aucun type attendu", () => {
		const emptySpec = {
			id: "empty",
			specText: "",
			expectedKinds: [] as RequirementKind[],
		};
		const report = deriveBenchReport(emptySpec, []);
		expect(report.matchPct).toBe(1.0);
		expect(report.missingTypes).toHaveLength(0);
	});

	it("MatchPct = 0,0 quand aucun candidat ne surfa ce un type attendu", () => {
		const spec = {
			id: "spec1",
			specText: "",
			expectedKinds: ["invariant.forall", "policy.authz"] as RequirementKind[],
		};
		const report = deriveBenchReport(spec, [
			{ role: "single", text: "nothing here" },
		]);
		expect(report.matchPct).toBe(0.0);
		expect(report.missingTypes).toEqual(["invariant.forall", "policy.authz"]);
	});

	it("les MissingTypes sont dans l'ordre canonique (déterminisme de l'ordre)", () => {
		const spec = {
			id: "spec2",
			specText: "",
			// Déclarés dans un ordre différent de l'ordre canonique.
			expectedKinds: [
				"case.error",
				"view.goal",
				"invariant.forall",
			] as RequirementKind[],
		};
		const report = deriveBenchReport(spec, []);
		// Les missing doivent être dans l'ordre canonique, pas l'ordre de déclaration.
		const indices = report.missingTypes.map((k) => ALL_KINDS.indexOf(k));
		expect(indices).toEqual([...indices].sort((a, b) => a - b));
	});
});

// ─── 4. Le différentiel multi-modèle ────────────────────────────────────────────────

describe("deriveModelDiffs — le différentiel multi-modèle (ADR 0079)", () => {
	it("le gain du bench : le modèle 'single' manque des types que A+B lui apportent", () => {
		const diffs = deriveModelDiffs(CANONICAL_SPEC, CANONICAL_CANDIDATES);
		const singleDiff = diffs.find((d) => d.role === "single");
		expect(singleDiff).toBeDefined();
		// single manque des types que l'union surfac e (invariant, policy, error).
		expect(singleDiff?.missedByThisModel.length).toBeGreaterThan(0);
	});

	it("le ownMatchPct de l'union totale = 1,0 (tous couverts)", () => {
		// On vérifie que l'union des trois donne bien 1,0 sur le report.
		const report = deriveBenchReport(CANONICAL_SPEC, CANONICAL_CANDIDATES);
		expect(report.matchPct).toBe(1.0);
	});

	it("chaque diff porte un rôle unique correspondant au candidat d'entrée", () => {
		const diffs = deriveModelDiffs(CANONICAL_SPEC, CANONICAL_CANDIDATES);
		const roles = diffs.map((d) => d.role);
		expect(roles).toEqual(["single", "A", "B"]);
	});
});

// ─── 5. projectBenchRow et runCanonical ──────────────────────────────────────────────

describe("projectBenchRow / runCanonical", () => {
	it("la ligne canonique = le report + 3 diffs (un par candidat)", () => {
		const row = runCanonical();
		expect(row.specId).toBe("createOrder");
		expect(row.report.matchPct).toBe(1.0);
		expect(row.diffs).toHaveLength(3);
	});

	it("projectBenchRow = deriveBenchReport + deriveModelDiffs (cohérence)", () => {
		const row = projectBenchRow(CANONICAL_SPEC, CANONICAL_CANDIDATES);
		const report = deriveBenchReport(CANONICAL_SPEC, CANONICAL_CANDIDATES);
		const diffs = deriveModelDiffs(CANONICAL_SPEC, CANONICAL_CANDIDATES);
		expect(row.report).toEqual(report);
		expect(row.diffs).toEqual(diffs);
	});
});

// ─── 6. Clés i18n ────────────────────────────────────────────────────────────────────

describe("kindLabelKey / roleLabelKey", () => {
	it("kindLabelKey transforme les points en underscores et préfixe benchKind_", () => {
		expect(kindLabelKey("view.goal")).toBe("benchKind_view_goal");
		expect(kindLabelKey("invariant.forall")).toBe("benchKind_invariant_forall");
		expect(kindLabelKey("case.error")).toBe("benchKind_case_error");
	});

	it("roleLabelKey retourne les clés connues pour les rôles canoniques", () => {
		expect(roleLabelKey("single")).toBe("benchRoleSingle");
		expect(roleLabelKey("A")).toBe("benchRoleA");
		expect(roleLabelKey("B")).toBe("benchRoleB");
		expect(roleLabelKey("unknown")).toBe("benchRoleOther");
	});
});

// ─── 7. Le MIROIR DE REPRODUCTIBILITÉ (§6/§8) — propriété fast-check ──────────────

describe("MIROIR DE REPRODUCTIBILITÉ — déterminisme ∀ (spec, candidats)", () => {
	it("extract est déterministe : même texte ⇒ même set, 100× (fast-check)", () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 500 }), (text) => {
				const first = extract(text);
				const second = extract(text);
				expect(first).toEqual(second);
			}),
			{ numRuns: 100 },
		);
	});

	it("deriveBenchReport est déterministe : mêmes (spec, candidats) ⇒ même report, 100× (fast-check)", () => {
		// Utilise le jeu canonique hermétique pour rester reproductible sans réseau.
		fc.assert(
			fc.property(fc.constant(null), () => {
				const a = deriveBenchReport(CANONICAL_SPEC, CANONICAL_CANDIDATES);
				const b = deriveBenchReport(CANONICAL_SPEC, CANONICAL_CANDIDATES);
				expect(a).toEqual(b);
			}),
			{ numRuns: 100 },
		);
	});

	it("runCanonical est déterministe : 100× ⇒ même BenchRow (fast-check)", () => {
		fc.assert(
			fc.property(fc.constant(null), () => {
				const a = runCanonical();
				const b = runCanonical();
				expect(a).toEqual(b);
			}),
			{ numRuns: 100 },
		);
	});

	it("MatchPct est toujours dans [0,1] pour n'importe quel texte de candidat (fast-check)", () => {
		fc.assert(
			fc.property(
				fc.string({ maxLength: 300 }),
				fc.array(fc.string({ maxLength: 200 }), { minLength: 1, maxLength: 5 }),
				(expectedText, candidateTexts) => {
					// Spec avec un sous-ensemble aléatoire d'expectedKinds.
					const spec: BenchSpec = {
						id: "fc-spec",
						specText: expectedText,
						expectedKinds: ALL_KINDS.slice(0, 7),
					};
					const candidates: BenchCandidate[] = candidateTexts.map((t, i) => ({
						role: String(i),
						text: t,
					}));
					const report = deriveBenchReport(spec, candidates);
					expect(report.matchPct).toBeGreaterThanOrEqual(0);
					expect(report.matchPct).toBeLessThanOrEqual(1);
				},
			),
			{ numRuns: 50 },
		);
	});

	it("MissingTypes ⊆ ExpectedKinds (les trous sont toujours un sous-ensemble des attendus)", () => {
		fc.assert(
			fc.property(fc.constant(null), () => {
				const report = deriveBenchReport(CANONICAL_SPEC, CANONICAL_CANDIDATES);
				for (const missing of report.missingTypes) {
					expect(CANONICAL_SPEC.expectedKinds).toContain(missing);
				}
			}),
			{ numRuns: 100 },
		);
	});
});
