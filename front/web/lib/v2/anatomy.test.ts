/**
 * WB2-06 — le MIROIR DE REPRODUCTIBILITÉ du twin de l'anatomie (lib/v2/anatomy) : les SIX paires-
 * miroir autour du mur + les voyants 🟢/🔴/🟡 computés.
 * mirror record: reflects=WB2-06-anatomy, test_kind=property, cert_language=vitest+fast-check,
 * liveness=live, authority=above (projection de lecture, le mur intact).
 *
 * Le twin est PUR & DÉTERMINISTE : ces propriétés (fast-check) épinglent les critères de done :
 *   - DÉTERMINISME : même état → même anatomie (même sérialisation, mêmes voyants) ;
 *   - LE MUR DESSINÉ : déclaré TOUJOURS au-dessus (side=above), prouvé TOUJOURS en dessous (below) ;
 *   - LES SIX PAIRES : exactement six, ORDONNÉES PAIR_KINDS, aucune perdue ni dupliquée (1-pour-1) ;
 *   - VOYANT COMPUTÉ : table de vérité exhaustive (declared × proven → green/red/amber), jamais
 *     déclaré — le ROUGE n'est porté QUE par un échec machine sous un côté déclaré ;
 *   - le compte par voyant somme à 6 ; l'overall = le pire des six ;
 *   - le rejet d'un état hors jeu clos (kernelId vide, paire inconnue/dupliquée/manquante).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Anatomy,
	buildAnatomy,
	computeVoyant,
	type DeclaredState,
	PAIR_KINDS,
	type PairState,
	type ProvenState,
	syntheticPairStates,
	validateAnatomy,
} from "./anatomy";

const DECLARED: readonly DeclaredState[] = ["declared", "absent"];
const PROVEN: readonly ProvenState[] = ["pass", "fail", "pending", "absent"];

/**
 * Un générateur de kernelId VALIDE : une chaîne dont le trim est non vide (le jeu clos exige un
 * kernelId non blanc — un id de seuls espaces est rejeté par validateAnatomy, ce n'est pas un id).
 */
function arbId(): fc.Arbitrary<string> {
	return fc.string({ minLength: 1 }).filter((s) => s.trim() !== "");
}

/** Un générateur d'états VALIDES : exactement les six paires, états dans les jeux clos. */
function arbStates(): fc.Arbitrary<PairState[]> {
	return fc
		.tuple(
			...PAIR_KINDS.map(() =>
				fc.record({
					declared: fc.constantFrom(...DECLARED),
					proven: fc.constantFrom(...PROVEN),
				}),
			),
		)
		.map((cells) =>
			PAIR_KINDS.map((kind, i) => ({
				kind,
				declared: cells[i].declared,
				proven: cells[i].proven,
			})),
		);
}

const ser = (a: Anatomy) => JSON.stringify(a);

describe("WB2-06 anatomy twin — les six paires-miroir + les voyants (PUR & DÉTERMINISTE)", () => {
	it("DÉTERMINISME : même état → même anatomie (même sérialisation)", () => {
		fc.assert(
			fc.property(arbId(), arbStates(), (id, states) => {
				const a = buildAnatomy(id, states);
				const b = buildAnatomy(id, states);
				expect(a.ok && b.ok).toBe(true);
				if (a.ok && b.ok) expect(ser(a.anatomy)).toBe(ser(b.anatomy));
			}),
		);
	});

	it("LES SIX PAIRES : exactement six, ordonnées PAIR_KINDS, aucune perdue ni dupliquée", () => {
		fc.assert(
			fc.property(arbId(), arbStates(), (id, states) => {
				const r = buildAnatomy(id, states);
				expect(r.ok).toBe(true);
				if (!r.ok) return;
				expect(r.anatomy.pairs).toHaveLength(6);
				expect(r.anatomy.pairs.map((p) => p.kind)).toEqual([...PAIR_KINDS]);
			}),
		);
	});

	it("LE MUR DESSINÉ : déclaré TOUJOURS au-dessus, prouvé TOUJOURS en dessous (read-only machine)", () => {
		fc.assert(
			fc.property(arbId(), arbStates(), (id, states) => {
				const r = buildAnatomy(id, states);
				if (!r.ok) return;
				for (const p of r.anatomy.pairs) {
					expect(p.declared.side).toBe("above");
					expect(p.proven.side).toBe("below");
				}
			}),
		);
	});

	it("VOYANT COMPUTÉ : table de vérité exhaustive (declared × proven), déterministe", () => {
		for (const d of DECLARED) {
			for (const p of PROVEN) {
				const v = computeVoyant(d, p);
				if (d === "declared" && p === "pass") expect(v).toBe("green");
				else if (d === "declared" && p === "fail") expect(v).toBe("red");
				else expect(v).toBe("amber");
				// Re-call : déterministe (même couple → même voyant).
				expect(computeVoyant(d, p)).toBe(v);
			}
		}
	});

	it("LE ROUGE n'est porté QUE par un échec machine sous un côté déclaré", () => {
		fc.assert(
			fc.property(arbId(), arbStates(), (id, states) => {
				const r = buildAnatomy(id, states);
				if (!r.ok) return;
				for (const pair of r.anatomy.pairs) {
					if (pair.voyant === "red") {
						expect(pair.declared.state).toBe("declared");
						expect(pair.proven.state).toBe("fail");
					}
				}
			}),
		);
	});

	it("le compte par voyant somme à 6 ; l'overall = le pire des six", () => {
		fc.assert(
			fc.property(arbId(), arbStates(), (id, states) => {
				const r = buildAnatomy(id, states);
				if (!r.ok) return;
				const { counts, pairs, overall } = r.anatomy;
				expect(counts.green + counts.red + counts.amber).toBe(6);
				const hasRed = pairs.some((p) => p.voyant === "red");
				const hasAmber = pairs.some((p) => p.voyant === "amber");
				expect(overall).toBe(hasRed ? "red" : hasAmber ? "amber" : "green");
			}),
		);
	});

	it("REJET : kernelId vide, paire inconnue, dupliquée ou manquante (hors jeu clos)", () => {
		// kernelId vide.
		expect(validateAnatomy("  ", syntheticPairStates("k"))).toContain(
			"empty_kernel_id",
		);
		// Paire manquante (cinq paires seulement).
		const five = syntheticPairStates("k").slice(0, 5);
		expect(validateAnatomy("k", five)).toContain("missing_pair");
		// Paire dupliquée.
		const six = syntheticPairStates("k");
		const dup: PairState[] = [...six.slice(0, 5), six[0]];
		expect(validateAnatomy("k", dup)).toContain("duplicate_pair");
		expect(validateAnatomy("k", dup)).toContain("missing_pair");
		// Paire inconnue.
		const unknown = [...six.slice(0, 5), { ...six[5], kind: "bogus" as never }];
		expect(validateAnatomy("k", unknown)).toContain("pair_kind_unknown");
		// buildAnatomy refuse l'entrée invalide.
		expect(buildAnatomy("", five).ok).toBe(false);
	});

	it("SYNTHÉTIQUE déterministe : même kernelId → même état → même anatomie", () => {
		fc.assert(
			fc.property(arbId(), (id) => {
				const s1 = syntheticPairStates(id);
				const s2 = syntheticPairStates(id);
				expect(JSON.stringify(s1)).toBe(JSON.stringify(s2));
				const a = buildAnatomy(id, s1);
				expect(a.ok).toBe(true);
				if (a.ok) expect(a.anatomy.pairs).toHaveLength(6);
			}),
		);
	});
});
