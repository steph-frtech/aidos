import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	applyIntent,
	type BuilderState,
	classifyIntent,
	INTENT_KINDS,
	initBuilderState,
	understand,
} from "./builder";
import { nodeByPath } from "./composition";

/**
 * WB2-27 — le MIROIR du IA BUILDER (ADR 0057) : UN écran, UN chat qui fait TOUT —
 * mais TOUT passe par une GRAMMAIRE D'INTENTIONS FERMÉE et un RÉDUCTEUR PUR.
 *
 * Le chat n'est jamais une magie : chaque message est CLASSÉ (classifyIntent — un
 * algorithme lexical, pas un prompt) contre le jeu clos des intentions ; « l'attente »
 * est l'intention en tête, « les types de réponse possibles » sont TOUS les candidats
 * classés, « la réponse » est la liste d'événements produite par applyIntent (pur,
 * event-sourcé, append-only), « les impacts » la vague calculée. L'ambiguïté est
 * DÉTECTÉE (deux candidats proches), jamais tranchée en silence. Le LLM est l'exception
 * gatée (désambiguïsation côté écran) — le code a toujours autorité (§6/§8).
 * LE MUR : aucune intention, sur aucun état, ne produit une écriture-vérité.
 */

const S = (): BuilderState => initBuilderState();

describe("la grammaire d'intentions — un jeu CLOS, déclaré", () => {
	it("le jeu des intentions est déclaré et clos", () => {
		expect(INTENT_KINDS).toEqual([
			"capturer_idee",
			"greffer",
			"promouvoir",
			"impacter",
			"interroger",
			"deployer",
		]);
	});

	it("∀ texte : classifyIntent est TOTAL, DÉTERMINISTE, candidats ⊆ jeu clos, triés par score ↓", () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 120 }), (txt) => {
				const a = classifyIntent(txt);
				expect(a).toEqual(classifyIntent(txt));
				for (let i = 0; i < a.length; i++) {
					expect(INTENT_KINDS).toContain(a[i].kind);
					if (i > 0) expect(a[i - 1].score).toBeGreaterThanOrEqual(a[i].score);
				}
			}),
		);
	});

	it("« l'attente » : un message clair est COMPRIS (le bon kind en tête, statut comprise)", () => {
		const u = understand(S(), "greffe les remboursements sous app/paiement");
		expect(u.status).toBe("comprise");
		expect(u.candidates[0].kind).toBe("greffer");
	});

	it("l'AMBIGUÏTÉ est détectée, jamais tranchée en silence (deux verbes forts → ambigue)", () => {
		const u = understand(S(), "greffe et déploie le paiement");
		expect(u.status).toBe("ambigue");
		expect(u.candidates.filter((c) => c.score > 0).length).toBeGreaterThan(1);
	});

	it("un texte sans AUCUNE accroche est INCOMPRIS (status incomprise, jamais une invention)", () => {
		const u = understand(S(), "zzz qqq www");
		expect(u.status).toBe("incomprise");
	});
});

describe("applyIntent — le RÉDUCTEUR PUR event-sourcé", () => {
	it("∀ (état, texte) : DÉTERMINISTE — même entrée → même état', mêmes événements, mêmes impacts", () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 80 }), (txt) => {
				const a = applyIntent(S(), txt);
				const b = applyIntent(S(), txt);
				expect(a).toEqual(b);
			}),
		);
	});

	it("∀ : le journal est APPEND-ONLY (le préfixe d'événements est intact)", () => {
		fc.assert(
			fc.property(
				fc.array(fc.string({ maxLength: 60 }), { maxLength: 5 }),
				(msgs) => {
					let st = S();
					let prevLen = 0;
					for (const m of msgs) {
						const r = applyIntent(st, m);
						expect(r.state.log.slice(0, prevLen)).toEqual(
							st.log.slice(0, prevLen),
						);
						expect(r.state.log.length).toBeGreaterThanOrEqual(st.log.length);
						prevLen = st.log.length;
						st = r.state;
					}
				},
			),
		);
	});

	it("GREFFER : « greffe pommes sous app/catalogue » fait pousser l'arbre LÀ", () => {
		const r = applyIntent(S(), "greffe pommes sous app/catalogue");
		expect(r.events.some((e) => e.kind === "arbre_greffe")).toBe(true);
		expect(nodeByPath(r.state.tree, "app/catalogue/pommes")).not.toBeNull();
	});

	it("CAPTURER : une idée naît PLACÉE (niveau/facette/échelle pris du nœud d'attache), hasMirror=false", () => {
		const r = applyIntent(
			S(),
			"capture l'idée : au checkout, débiter le compte une seule fois",
		);
		expect(r.events.some((e) => e.kind === "idee_capturee")).toBe(true);
		expect(r.state.ideas).toHaveLength(1);
		const idea = r.state.ideas[0];
		expect(idea.hasMirror).toBe(false);
		expect(idea.wroteKernel).toBe(false);
		// placée par placeIntent : le checkout du seed accroche lexicalement.
		expect(idea.coordinate.scale.startsWith("app/paiement/checkout")).toBe(
			true,
		);
	});

	it("PROMOUVOIR : après capture, « promeus la dernière idée » → un kernel PROPOSÉ (DRAFT, wroteKernel=false)", () => {
		const r1 = applyIntent(
			S(),
			"capture l'idée : au checkout, débiter une seule fois",
		);
		const r2 = applyIntent(r1.state, "promeus la dernière idée");
		expect(r2.events.some((e) => e.kind === "kernel_propose")).toBe(true);
		expect(r2.state.kernels).toHaveLength(1);
		const k = r2.state.kernels[0];
		expect(k.version.startsWith("k:")).toBe(true);
		expect(k.changeSet.status).toBe("DRAFT");
		expect(k.wroteKernel).toBe(false);
	});

	it("PROMOUVOIR sans idée capturée → un événement de refus, jamais un kernel inventé", () => {
		const r = applyIntent(S(), "promeus la dernière idée");
		expect(r.state.kernels).toHaveLength(0);
		expect(r.events.some((e) => e.kind === "refus")).toBe(true);
	});

	it("IMPACTER : « quel impact si je modifie app/paiement » → la vague du sous-arbre", () => {
		const r = applyIntent(S(), "quel impact si je modifie app/paiement");
		expect(r.events.some((e) => e.kind === "impact_calcule")).toBe(true);
		// le sous-arbre de paiement (checkout, débit) est dans la vague.
		expect(r.impacts.some((i) => i.cible.includes("checkout"))).toBe(true);
	});

	it("LE MUR (∀ messages) : aucune intention ne produit JAMAIS une écriture-vérité", () => {
		fc.assert(
			fc.property(
				fc.array(fc.string({ maxLength: 60 }), { maxLength: 6 }),
				(msgs) => {
					let st = S();
					for (const m of msgs) {
						const r = applyIntent(st, m);
						for (const k of r.state.kernels) expect(k.wroteKernel).toBe(false);
						for (const i of r.state.ideas) {
							expect(i.hasMirror).toBe(false);
							expect(i.wroteKernel).toBe(false);
						}
						// « verite_ecrite » n'existe PAS dans le jeu clos des événements — la sonde
						// compare via String() (sinon TS2367 : l'union fermée n'a aucun recouvrement).
						expect(
							r.events.every((e) => String(e.kind) !== "verite_ecrite"),
						).toBe(true);
						st = r.state;
					}
				},
			),
		);
	});

	it("INTERROGER + DEPLOYER : totals — l'état est lu, le déploiement PROPOSÉ (gaté), rien d'exécuté", () => {
		const r1 = applyIntent(S(), "montre-moi l'état du projet");
		expect(r1.events.some((e) => e.kind === "etat_lu")).toBe(true);
		const r2 = applyIntent(S(), "déploie l'application en production");
		expect(r2.events.some((e) => e.kind === "deploiement_propose")).toBe(true);
	});
});
