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
	it("le jeu des intentions est déclaré et clos (le cycle de vie ENTIER d'une appli)", () => {
		expect(INTENT_KINDS).toEqual([
			"capturer_idee",
			"greffer",
			"promouvoir",
			"generer",
			"deployer",
			"delta",
			"impacter",
			"interroger",
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

	it("INTERROGER : total — l'état est lu", () => {
		const r1 = applyIntent(S(), "montre-moi l'état du projet");
		expect(r1.events.some((e) => e.kind === "etat_lu")).toBe(true);
	});
});

// ── le cycle de vie complet : générer → test → prod (le cliquet) → delta ──────

/** Mène l'état jusqu'à UN kernel proposé (capture + promotion) — l'app minimale. */
function withKernel(): BuilderState {
	const r1 = applyIntent(
		S(),
		"capture l'idée : au checkout, débiter le compte une seule fois",
	);
	return applyIntent(r1.state, "promeus la dernière idée").state;
}

describe("GÉNÉRER — l'app est une PROJECTION pure des kernels proposés", () => {
	it("générer sans kernel → refus (rien à projeter, jamais une invention)", () => {
		const r = applyIntent(S(), "génère l'application");
		expect(r.events.some((e) => e.kind === "refus")).toBe(true);
	});

	it("après promotion : app_generee, version content-adressée STABLE (même état → même app)", () => {
		const st = withKernel();
		const a = applyIntent(st, "génère l'application");
		const b = applyIntent(st, "génère l'application");
		expect(a.events.some((e) => e.kind === "app_generee")).toBe(true);
		const va = a.events.find((e) => e.kind === "app_generee")?.ref;
		expect(va).toBe(b.events.find((e) => e.kind === "app_generee")?.ref);
		expect(va?.startsWith("app:")).toBe(true);
	});
});

describe("DÉPLOYER — test PUIS prod : le CLIQUET d'environnements", () => {
	it("déployer en test sans kernel → refus (rien à déployer)", () => {
		const r = applyIntent(S(), "déploie l'application en test");
		expect(r.events.some((e) => e.kind === "refus")).toBe(true);
		expect(r.state.envs.test).toBeNull();
	});

	it("LA PROD DIRECTE EST REFUSÉE : jamais la prod sans que CETTE version soit passée en test", () => {
		const st = withKernel();
		const r = applyIntent(st, "déploie l'application en prod");
		expect(r.events.some((e) => e.kind === "refus")).toBe(true);
		expect(r.state.envs.prod).toBeNull();
	});

	it("le chemin légal : test → prod (même version) — les deux environnements portent la version", () => {
		const st = withKernel();
		const t = applyIntent(st, "déploie l'application en test");
		expect(t.events.some((e) => e.kind === "deploiement_test")).toBe(true);
		expect(t.state.envs.test).not.toBeNull();
		const p = applyIntent(t.state, "déploie l'application en prod");
		expect(p.events.some((e) => e.kind === "deploiement_prod")).toBe(true);
		expect(p.state.envs.prod?.version).toBe(t.state.envs.test?.version);
	});

	it("LE CLIQUET RE-MORD : une nouvelle promotion invalide la prod — il faut REPASSER par le test", () => {
		const st = withKernel();
		const t = applyIntent(st, "déploie l'application en test");
		const p = applyIntent(t.state, "déploie l'application en prod");
		// une NOUVELLE vérité arrive…
		const c = applyIntent(
			p.state,
			"capture l'idée : au catalogue, lister les produits disponibles",
		);
		const k = applyIntent(c.state, "promeus la dernière idée");
		// …la prod de la nouvelle version SANS test → refusée (la version de test est d'hier).
		const r = applyIntent(k.state, "déploie l'application en prod");
		expect(r.events.some((e) => e.kind === "refus")).toBe(true);
		// re-test puis prod → ok.
		const t2 = applyIntent(k.state, "déploie l'application en test");
		const p2 = applyIntent(t2.state, "déploie l'application en prod");
		expect(p2.events.some((e) => e.kind === "deploiement_prod")).toBe(true);
	});
});

describe("DELTA — « voir les deltas » : l'écart CALCULÉ entre l'état courant et un environnement", () => {
	it("sans aucun déploiement : le delta est TOTAL (tout est écart), jamais une erreur", () => {
		const st = withKernel();
		const r = applyIntent(st, "montre le delta depuis la prod");
		expect(r.events.some((e) => e.kind === "delta_calcule")).toBe(true);
	});

	it("après la prod : delta = 0 écart ; une nouvelle promotion → delta = 1 kernel d'écart", () => {
		const st = withKernel();
		const t = applyIntent(st, "déploie l'application en test");
		const p = applyIntent(t.state, "déploie l'application en prod");
		const d0 = applyIntent(p.state, "montre le delta depuis la prod");
		const e0 = d0.events.find((e) => e.kind === "delta_calcule");
		expect(e0?.detail).toContain("0");
		expect(d0.impacts).toHaveLength(0);
		// une nouvelle vérité promue…
		const c = applyIntent(
			p.state,
			"capture l'idée : au catalogue, lister les produits disponibles",
		);
		const k = applyIntent(c.state, "promeus la dernière idée");
		const d1 = applyIntent(k.state, "montre le delta depuis la prod");
		expect(d1.impacts.length).toBe(1);
		expect(d1.impacts[0].type).toBe("kernel");
	});
});
