import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { growComposes, nodePath, seedComposes } from "./composition";
import {
	type BlockReason,
	changeSetId,
	frozenVersion,
	GOAL_STAGES,
	goalStage,
	type MirrorSpec,
	type ProposedKernel,
	promoteIdea,
	refuseDirectWrite,
	syntheticIdea,
	syntheticMirror,
	validateMirror,
} from "./goal";
import type { Coordinate, Idea } from "./idea";

/**
 * WB2-11 — le MIROIR DE REPRODUCTIBILITÉ du twin /goal (lib/v2/goal.ts).
 *
 * mirror record: reflects=WB2-11-goal, test_kind=property, cert_language=vitest+fast-check,
 * liveness=live, authority=above (le geste /goal franchit le mur, PROPOSE — le mur intact).
 *
 * Épingle (CLAUDE.md §6/§8, déterminisme-first) : la transition idée → miroir → /goal → gel est PURE
 * & TOTALE ; le MUR tient (pas de miroir → pas de promotion ; écriture directe toujours refusée) ;
 * HasMirror passe false→true ; la version gelée est content-adressée (même entrée → même version) ;
 * l'idée descend à sa coordonnée VERBATIM ; wroteKernel reste toujours false.
 */

// L'ÉCHELLE n'est PLUS un jeu clos (ADR 0055) : c'est un CHEMIN dans l'arbre composes (§49/§108).
// On tire l'échelle parmi les chemins MEMBRES d'un arbre CULTIVÉ depuis le seed canonique
// (growComposes — l'arbre pousse, les rôles sont des lectures dérivées, jamais stockés).
const grownTree = growComposes(
	seedComposes(),
	seedComposes().find((n) => n.label === "checkout")?.id ?? "",
	"remboursement",
);
const memberPaths = grownTree.map((n) => nodePath(grownTree, n.id).join("/"));

// Une idée arbitraire bien formée (telle que le twin WB2-03 en produirait), à la coordonnée donnée.
const arbCoordinate = fc.record<Coordinate>({
	level: fc.constantFrom("operation", "entity", "control", "view"),
	facet: fc.constantFrom("F", "S", "E", "A"),
	scale: fc.constantFrom(...memberPaths),
});

const arbIdea: fc.Arbitrary<Idea> = fc
	.tuple(fc.string({ minLength: 3, maxLength: 40 }), arbCoordinate)
	.map(([intent, coordinate]) => ({
		id: "deadbeef",
		intent: intent.trim() || "intention",
		coordinate,
		provenance: "humain" as const,
		// expectedMirrorForm null → on n'impose pas la forme (testé séparément).
		expectedMirrorForm: null,
		hasMirror: false as const,
		wroteKernel: false as const,
	}));

const arbMirror: fc.Arbitrary<MirrorSpec> = fc
	.record({
		form: fc.constantFrom<MirrorSpec["form"]>(
			"gherkin_n0",
			"property_n1",
			"fixture_n2",
			"screen_fixture",
		),
		// Un texte non-blanc d'au moins MIN_MIRROR_LEN caractères (un miroir vide est un vœu, testé à part).
		text: fc.string({ maxLength: 60 }).map((s) => `mir-${s}`),
	})
	.map((m) => m as MirrorSpec);

describe("WB2-11 twin /goal — la transition idée → miroir → /goal → gel", () => {
	it("le démo canonique se promeut : un kernel proposé, version gelée, ChangeSet DRAFT", () => {
		const r = promoteIdea(syntheticIdea(), syntheticMirror());
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const p = r.proposed;
		expect(p.hasMirror).toBe(true);
		expect(p.wroteKernel).toBe(false);
		expect(p.version.startsWith("k:")).toBe(true);
		expect(p.changeSet.status).toBe("DRAFT");
		expect(p.changeSet.id.startsWith("cs:")).toBe(true);
		expect(p.coordinate).toEqual(syntheticIdea().coordinate);
	});

	it("LE MUR (§116) : une idée SANS miroir (texte vide) ne peut PAS être promue", () => {
		fc.assert(
			fc.property(arbIdea, (idea) => {
				const r = promoteIdea(idea, { form: "fixture_n2", text: "  " });
				expect(r.ok).toBe(false);
				if (!r.ok) expect(r.errors).toContain("mirror_text_empty");
			}),
		);
	});

	it("le franchissement : APRÈS l'écriture du miroir, HasMirror passe false → true", () => {
		fc.assert(
			fc.property(arbIdea, arbMirror, (idea, mirror) => {
				expect(idea.hasMirror).toBe(false); // au-dessus du mur, l'idée PROPOSE
				const r = promoteIdea(idea, mirror);
				expect(r.ok).toBe(true);
				if (r.ok) expect(r.proposed.hasMirror).toBe(true); // le mur franchi
			}),
		);
	});

	it("wroteKernel reste TOUJOURS false : /goal PROPOSE, il n'APPLIQUE jamais", () => {
		fc.assert(
			fc.property(arbIdea, arbMirror, (idea, mirror) => {
				const r = promoteIdea(idea, mirror);
				if (r.ok) {
					expect(r.proposed.wroteKernel).toBe(false);
					expect(r.proposed.changeSet.status).toBe("DRAFT");
				}
			}),
		);
	});

	it("l'idée DESCEND à sa coordonnée VERBATIM (jamais réinventée)", () => {
		fc.assert(
			fc.property(arbIdea, arbMirror, (idea, mirror) => {
				const r = promoteIdea(idea, mirror);
				if (r.ok) {
					expect(r.proposed.coordinate).toEqual(idea.coordinate);
					expect(r.proposed.intent).toBe(idea.intent);
					expect(r.proposed.ideaId).toBe(idea.id);
				}
			}),
		);
	});

	it("la VERSION gelée est DÉTERMINISTE & content-adressée : même (idée+miroir) → même version", () => {
		fc.assert(
			fc.property(arbIdea, arbMirror, (idea, mirror) => {
				const v1 = frozenVersion(idea.intent, idea.coordinate, mirror);
				const v2 = frozenVersion(idea.intent, idea.coordinate, mirror);
				expect(v1).toBe(v2);
				const r1 = promoteIdea(idea, mirror);
				const r2 = promoteIdea(idea, mirror);
				if (r1.ok && r2.ok) {
					expect(r1.proposed.version).toBe(r2.proposed.version);
					expect(r1.proposed.changeSet.id).toBe(r2.proposed.changeSet.id);
				}
			}),
		);
	});

	it("toute MUTATION du miroir change la version (content-addressing)", () => {
		const idea = syntheticIdea();
		const v = frozenVersion(idea.intent, idea.coordinate, syntheticMirror());
		const vMut = frozenVersion(idea.intent, idea.coordinate, {
			form: "fixture_n2",
			text: `${syntheticMirror().text} MUTÉ`,
		});
		expect(vMut).not.toBe(v);
	});

	it("le ChangeSet id est dérivé de (ideaId + version) — idempotent", () => {
		expect(changeSetId("deadbeef", "k:00000000")).toBe(
			changeSetId("deadbeef", "k:00000000"),
		);
		expect(changeSetId("a", "k:1")).not.toBe(changeSetId("b", "k:1"));
	});
});

describe("WB2-11 twin /goal — la validation du miroir (la forme attendue, EL10)", () => {
	it("une forme HORS du jeu clos est refusée", () => {
		const idea = syntheticIdea();
		const errs = validateMirror(idea, {
			form: "n_importe_quoi" as MirrorSpec["form"],
			text: "un texte",
		});
		expect(errs).toContain("mirror_form_unknown");
	});

	it("une forme ≠ la forme attendue par la coordonnée est refusée (mismatch)", () => {
		// syntheticIdea attend fixture_n2 ; on écrit un gherkin_n0 → mismatch.
		const r = promoteIdea(syntheticIdea(), {
			form: "gherkin_n0",
			text: "Given … When … Then …",
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.errors).toContain("mirror_form_mismatch");
	});

	it("la BONNE forme (fixture_n2) promeut l'idée synthétique", () => {
		const r = promoteIdea(syntheticIdea(), syntheticMirror());
		expect(r.ok).toBe(true);
	});
});

describe("WB2-11 twin /goal — le MUR : l'écriture-vérité directe TOUJOURS refusée", () => {
	it("refuseDirectWrite refuse TOUTE cible (jamais un succès) avec un BlockReason actionnable", () => {
		fc.assert(
			fc.property(fc.string(), (target) => {
				const b: BlockReason = refuseDirectWrite(target);
				expect(b.severity).toBe("error");
				expect(b.code).toBe("WALL_DIRECT_TRUTH_WRITE_FORBIDDEN");
				expect(b.howToFix.length).toBeGreaterThan(0);
				// la voie légale est rappelée : idée → miroir → /goal → approbation
				expect(b.howToFix.join(" ")).toContain("/goal");
			}),
		);
	});
});

describe("WB2-11 twin /goal — le stade computé (le cycle de vie)", () => {
	it("GOAL_STAGES est le jeu clos ordonné idea → mirror_written → frozen", () => {
		expect([...GOAL_STAGES]).toEqual(["idea", "mirror_written", "frozen"]);
	});

	it("le stade est CALCULÉ depuis l'état, jamais déclaré", () => {
		expect(goalStage(false, null)).toBe("idea");
		expect(goalStage(true, null)).toBe("mirror_written");
		const proposed = promoteIdea(syntheticIdea(), syntheticMirror());
		const p: ProposedKernel | null = proposed.ok ? proposed.proposed : null;
		expect(goalStage(true, p)).toBe("frozen");
	});
});
