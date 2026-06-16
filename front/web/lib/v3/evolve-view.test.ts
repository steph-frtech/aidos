import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	CANONICAL_BUDGET,
	CANONICAL_CELL,
	CANONICAL_SEED,
	type EvolveCell,
	MIRROR_BREAK_MUTATION,
	projectCellRun,
	promote,
	refusalLabelKey,
	runCanonical,
	SAMPLER_KINDS,
	type SamplerKind,
	samplerLabelKey,
} from "./evolve-view";

/**
 * V3 — le MIROIR du TWIN « GÉNÉRATEUR D'ÉVOLUTION » (EG05, ADR 0089). Il pin :
 *  (1) la BYTE-COHÉRENCE avec le Go (back/runtime/evolve) — les mutations seedées de la
 *      cellule canonique sont EXACTEMENT celles du FixtureProposer Go (graine 42) ;
 *  (2) le GATE déterministe (Promote) — anti-Goodhart : une variante au miroir rouge
 *      n'est JAMAIS promue, quel que soit son score ; l'ordre des motifs de refus est
 *      celui des `if` du Go ;
 *  (3) le DÉTERMINISME (§6/§8) — même (cellule, générateur, budget, graine) ⇒ même
 *      projection, byte-identique (le miroir de reproductibilité) ;
 *  (4) l'HONNÊTETÉ — le générateur n'invente jamais une niche ; une niche gagnée DOIT
 *      avoir une variante au gate passé ; le sampler déterministe ne gagne aucune niche
 *      (sa baseline n'est pas approuvée par l'autorité).
 */

describe("byte-cohérence avec le Go (FixtureProposer, graine 42)", () => {
	it("le run self-play canonique reproduit EXACTEMENT le flux seedé du Go", () => {
		const run = runCanonical("self-play");
		// 8 propositions (budget 8, borné [5,8]) ; triées (niche puis mutation).
		expect(run.variants.length).toBe(8);
		// Les mutations Go (graine 42), triées par (niche, mutation) — verbatim du run Go.
		const mutations = run.variants.map((v) => Number(v.mutation.toFixed(6)));
		expect(mutations).toEqual([
			0.132326, // discount
			0.235924, // discount
			0.780537, // discount
			0.336811, // refund
			0.388941, // refund
			0.837994, // refund
			0.285644, // split
			0.392562, // split
		]);
	});

	it("les niches gagnées + la couverture sont celles du Go (discount, refund → 2)", () => {
		const run = runCanonical("self-play");
		expect(run.nichesWon).toEqual([
			"createOrder/discount",
			"createOrder/refund",
		]);
		expect(run.coverage).toBe(2);
	});

	it("la niche non approuvée (split) ne gagne JAMAIS — l'autorité refuse", () => {
		const run = runCanonical("self-play");
		const split = run.variants.filter((v) => v.niche === "createOrder/split");
		expect(split.length).toBeGreaterThan(0);
		for (const v of split) {
			expect(v.verdict).toBe("refused");
			expect(v.refusal).toBe("authority");
		}
	});

	it("les variantes oos-rouges (mutation forte) sont refusées sur oos, pas sur autorité", () => {
		const run = runCanonical("self-play");
		// La variante refund mutée à 0.837994 : miroir vert mais oos rouge (0.497 < 0.55).
		const oosRed = run.variants.find(
			(v) => Number(v.mutation.toFixed(6)) === 0.837994,
		);
		expect(oosRed).toBeDefined();
		expect(oosRed?.outOfSample).toBe("red");
		expect(oosRed?.verdict).toBe("refused");
		expect(oosRed?.refusal).toBe("oos");
	});
});

describe("le sampler DÉTERMINISTE (FallbackSampler) — la baseline non approuvée", () => {
	it("propose UNE variante baseline, refusée sur l'autorité, 0 niche gagnée", () => {
		const run = runCanonical("deterministe");
		expect(run.variants.length).toBe(1);
		const v = run.variants[0];
		expect(v.niche).toBe("createOrder/baseline");
		expect(v.mirror).toBe("green");
		expect(v.outOfSample).toBe("green");
		expect(v.authorityApproved).toBe(false);
		expect(v.verdict).toBe("refused");
		expect(v.refusal).toBe("authority");
		expect(run.coverage).toBe(0);
		expect(run.nichesWon).toEqual([]);
	});

	it("le self-play OUT-COUVRE le déterministe (le gain EG04 rendu visible)", () => {
		const sp = runCanonical("self-play");
		const det = runCanonical("deterministe");
		expect(sp.coverage).toBeGreaterThan(det.coverage);
	});
});

describe("le gate Promote — anti-Goodhart, ordre des motifs verbatim du Go", () => {
	it("miroir rouge → refusé sur 'mirror' AVANT tout autre motif", () => {
		expect(
			promote({ mirror: "red", outOfSample: "red", authorityApproved: false }),
		).toEqual({ verdict: "refused", refusal: "mirror" });
	});

	it("miroir vert + oos rouge → refusé sur 'oos'", () => {
		expect(
			promote({
				mirror: "green",
				outOfSample: "red",
				authorityApproved: false,
			}),
		).toEqual({ verdict: "refused", refusal: "oos" });
	});

	it("miroir+oos verts, autorité non → refusé sur 'authority'", () => {
		expect(
			promote({
				mirror: "green",
				outOfSample: "green",
				authorityApproved: false,
			}),
		).toEqual({ verdict: "refused", refusal: "authority" });
	});

	it("les TROIS verts → proposé (la seule porte)", () => {
		expect(
			promote({
				mirror: "green",
				outOfSample: "green",
				authorityApproved: true,
			}),
		).toEqual({ verdict: "proposed", refusal: null });
	});

	it("∀ : un miroir rouge n'est JAMAIS promu, quel que soit le reste", () => {
		fc.assert(
			fc.property(
				fc.constantFrom<"green" | "red">("green", "red"),
				fc.boolean(),
				(oos, auth) => {
					const r = promote({
						mirror: "red",
						outOfSample: oos,
						authorityApproved: auth,
					});
					expect(r.verdict).toBe("refused");
					expect(r.refusal).toBe("mirror");
				},
			),
		);
	});
});

describe("le déterminisme (§6/§8) — le miroir de reproductibilité", () => {
	const arbCell = (): fc.Arbitrary<EvolveCell> =>
		fc
			.uniqueArray(
				fc.constantFrom("a", "b", "c", "d", "discount", "refund", "split"),
				{ minLength: 1, maxLength: 5 },
			)
			.chain((niches) =>
				fc.record({
					id: fc.constantFrom("createOrder", "shipOrder", "refundOrder"),
					niches: fc.constant(niches),
					authorityApprovedNiches: fc.subarray(niches),
					outOfSampleThreshold: fc.double({
						min: 0,
						max: 1,
						noNaN: true,
					}),
				}),
			);

	it("∀ : même (cellule, générateur, budget, graine) ⇒ même projection (byte-identique)", () => {
		fc.assert(
			fc.property(
				arbCell(),
				fc.constantFrom<SamplerKind>("self-play", "deterministe"),
				fc.integer({ min: 1, max: 12 }),
				fc.integer({ min: -100000, max: 100000 }),
				(cell, sampler, budget, seed) => {
					const a = projectCellRun(cell, sampler, budget, seed);
					const b = projectCellRun(cell, sampler, budget, seed);
					expect(a).toEqual(b);
				},
			),
		);
	});

	it("∀ : une niche gagnée a TOUJOURS une variante au gate passé (jamais inventée)", () => {
		fc.assert(
			fc.property(
				arbCell(),
				fc.constantFrom<SamplerKind>("self-play", "deterministe"),
				fc.integer({ min: 1, max: 12 }),
				fc.integer({ min: -100000, max: 100000 }),
				(cell, sampler, budget, seed) => {
					const run = projectCellRun(cell, sampler, budget, seed);
					for (const niche of run.nichesWon) {
						const passing = run.variants.some(
							(v) => v.niche === niche && v.verdict === "proposed",
						);
						expect(passing).toBe(true);
					}
				},
			),
		);
	});

	it("∀ : le générateur n'émet que des niches DÉCLARÉES par la cellule (honnêteté §8)", () => {
		fc.assert(
			fc.property(
				arbCell(),
				fc.integer({ min: 1, max: 12 }),
				fc.integer({ min: -100000, max: 100000 }),
				(cell, budget, seed) => {
					// self-play : round-robin sur les niches déclarées.
					const run = projectCellRun(cell, "self-play", budget, seed);
					for (const v of run.variants) {
						expect(cell.niches).toContain(v.niche);
					}
				},
			),
		);
	});

	it("∀ : un gate passé ⟺ miroir vert ∧ oos vert ∧ autorité (le Juge déterministe)", () => {
		fc.assert(
			fc.property(
				arbCell(),
				fc.constantFrom<SamplerKind>("self-play", "deterministe"),
				fc.integer({ min: 1, max: 12 }),
				fc.integer({ min: -100000, max: 100000 }),
				(cell, sampler, budget, seed) => {
					const run = projectCellRun(cell, sampler, budget, seed);
					for (const v of run.variants) {
						const expected =
							v.mirror === "green" &&
							v.outOfSample === "green" &&
							v.authorityApproved;
						expect(v.verdict === "proposed").toBe(expected);
					}
				},
			),
		);
	});
});

describe("les libellés i18n — un jeu déclaré et clos", () => {
	it("chaque motif de refus a une clé distincte, chaque générateur aussi", () => {
		const refusalKeys = [
			refusalLabelKey("mirror"),
			refusalLabelKey("oos"),
			refusalLabelKey("authority"),
			refusalLabelKey(null),
		];
		expect(new Set(refusalKeys).size).toBe(4);
		const samplerKeys = SAMPLER_KINDS.map(samplerLabelKey);
		expect(new Set(samplerKeys).size).toBe(SAMPLER_KINDS.length);
	});

	it("les clés sont celles attendues par les messages FR/EN", () => {
		expect(refusalLabelKey("mirror")).toBe("evolveRefusalMirror");
		expect(samplerLabelKey("self-play")).toBe("evolveSamplerSelfPlay");
		expect(samplerLabelKey("deterministe")).toBe("evolveSamplerDet");
	});
});

describe("les invariants de bord", () => {
	it("le seuil de cassure du miroir est celui du Go (0.85)", () => {
		expect(MIRROR_BREAK_MUTATION).toBe(0.85);
	});

	it("la cellule canonique est celle attendue (graine + budget figés)", () => {
		expect(CANONICAL_SEED).toBe(42);
		expect(CANONICAL_BUDGET).toBe(8);
		expect(CANONICAL_CELL.niches.length).toBe(3);
		expect(CANONICAL_CELL.authorityApprovedNiches.length).toBe(2);
	});
});
