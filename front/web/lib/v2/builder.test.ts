import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	applyIntent,
	type BuilderState,
	classifyIntent,
	codeDeltaFor,
	ENV_LADDER,
	INTENT_KINDS,
	initBuilderState,
	resolveScreen,
	understand,
} from "./builder";
import type { CodeEdge, CodeNode } from "./code-graph";
import { nodeByPath } from "./composition";
import { SCREENS } from "./screens";

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
	it("le jeu des intentions est déclaré et clos (le cycle de vie ENTIER d'une appli + la navigation totale)", () => {
		expect(INTENT_KINDS).toEqual([
			"capturer_idee",
			"greffer",
			"promouvoir",
			"generer",
			"deployer",
			"delta",
			"impacter",
			"interroger",
			"ouvrir",
			"adapter",
		]);
	});

	it("l'ÉCHELLE D'ENVIRONNEMENTS est déclarée, close, ordonnée (le cliquet généralisé)", () => {
		expect(ENV_LADDER).toEqual(["dev", "staging", "prod"]);
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

describe("DÉPLOYER — l'ÉCHELLE déclarée test → staging → prod : le CLIQUET généralisé", () => {
	const deployedTo = (
		r: ReturnType<typeof applyIntent>,
		env: string,
	): boolean => r.events.some((e) => e.kind === "deploiement" && e.env === env);

	it("déployer en dev sans kernel → refus (rien à déployer)", () => {
		const r = applyIntent(S(), "déploie l'application en dev");
		expect(r.events.some((e) => e.kind === "refus")).toBe(true);
		expect(r.state.envs.dev).toBeNull();
	});

	it("∀ barreau > 1 : SAUTER UN BARREAU EST REFUSÉ (prod directe, staging directe, test→prod)", () => {
		const st = withKernel();
		// prod directe
		expect(
			applyIntent(st, "déploie l'application en prod").events.some(
				(e) => e.kind === "refus",
			),
		).toBe(true);
		// staging directe
		expect(
			applyIntent(st, "déploie l'application en staging").events.some(
				(e) => e.kind === "refus",
			),
		).toBe(true);
		// test puis prod en sautant staging
		const t = applyIntent(st, "déploie l'application en dev");
		const r = applyIntent(t.state, "déploie l'application en prod");
		expect(r.events.some((e) => e.kind === "refus")).toBe(true);
		expect(r.state.envs.prod).toBeNull();
	});

	it("le chemin légal : test → staging → prod — la MÊME version monte chaque barreau", () => {
		const st = withKernel();
		const t = applyIntent(st, "déploie l'application en dev");
		expect(deployedTo(t, "dev")).toBe(true);
		const s = applyIntent(t.state, "déploie l'application en staging");
		expect(deployedTo(s, "staging")).toBe(true);
		const p = applyIntent(s.state, "déploie l'application en prod");
		expect(deployedTo(p, "prod")).toBe(true);
		expect(p.state.envs.prod?.version).toBe(t.state.envs.dev?.version);
		expect(p.state.envs.staging?.version).toBe(t.state.envs.dev?.version);
	});

	it("LE CLIQUET RE-MORD sur TOUTE l'échelle : une promotion invalide chaque barreau supérieur", () => {
		const st = withKernel();
		const t = applyIntent(st, "déploie l'application en dev");
		const s = applyIntent(t.state, "déploie l'application en staging");
		const p = applyIntent(s.state, "déploie l'application en prod");
		// une NOUVELLE vérité arrive…
		const c = applyIntent(
			p.state,
			"capture l'idée : au catalogue, lister les produits disponibles",
		);
		const k = applyIntent(c.state, "promeus la dernière idée");
		// …staging ET prod de la nouvelle version sont refusés tant que le barreau précédent n'a pas re-validé.
		expect(
			applyIntent(k.state, "déploie l'application en staging").events.some(
				(e) => e.kind === "refus",
			),
		).toBe(true);
		expect(
			applyIntent(k.state, "déploie l'application en prod").events.some(
				(e) => e.kind === "refus",
			),
		).toBe(true);
		// la remontée complète re-passe.
		const t2 = applyIntent(k.state, "déploie l'application en dev");
		const s2 = applyIntent(t2.state, "déploie l'application en staging");
		const p2 = applyIntent(s2.state, "déploie l'application en prod");
		expect(deployedTo(p2, "prod")).toBe(true);
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
		const t = applyIntent(st, "déploie l'application en dev");
		const sg = applyIntent(t.state, "déploie l'application en staging");
		const p = applyIntent(sg.state, "déploie l'application en prod");
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

// ── OUVRIR — la couverture TOTALE du Workbench (« il sait tout faire ») ───────

describe("OUVRIR — chaque écran du Workbench est atteignable depuis le chat", () => {
	it("LA LOI DE COUVERTURE : ∀ écran du registre V2, « ouvre <titre> » résout vers SA route", () => {
		const st = S();
		for (const entry of SCREENS) {
			const r = applyIntent(st, `ouvre ${entry.fr.title}`);
			const ev = r.events.find((e) => e.kind === "ecran_ouvert");
			expect(ev, `écran ${entry.slug} inatteignable`).toBeDefined();
			expect(ev?.ref).toBe(`/v2/${entry.slug}`);
		}
	});

	it("les écrans V1 injectés sont atteignables aussi (l'inventaire est une donnée, pas du code)", () => {
		const st = initBuilderState([
			{ route: "/why-tree", label: "why-tree l'arbre des pourquoi" },
			{ route: "/agents", label: "agents la couche agent" },
		]);
		const r = applyIntent(st, "ouvre l'écran why-tree");
		const ev = r.events.find((e) => e.kind === "ecran_ouvert");
		expect(ev?.ref).toBe("/why-tree");
	});

	it("∀ texte : resolveScreen est TOTAL et DÉTERMINISTE ; aucune accroche → null (jamais une invention)", () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 60 }), (txt) => {
				const st = S();
				const a = resolveScreen(st.screens, txt);
				expect(a).toEqual(resolveScreen(st.screens, txt));
			}),
		);
		expect(resolveScreen(S().screens, "zzz qqq www")).toBeNull();
	});

	it("ouvrir un écran introuvable → refus (fail-closed)", () => {
		const r = applyIntent(S(), "ouvre l'écran zzzqqq");
		expect(r.events.some((e) => e.kind === "refus")).toBe(true);
	});
});

// ── le DELTA AU GRAIN CODE (ADR 0056 × ADR 0058) ──────────────────────────────

describe("codeDeltaFor — « quelles fonctions exactes » derrière un écart de kernel", () => {
	const codeFixture = (): { nodes: CodeNode[]; edges: CodeEdge[] } => {
		const file: CodeNode = {
			id: "f0",
			kind: "file",
			name: "src/caisse.ts",
			file: "src/caisse.ts",
			span: { start: 1, end: 60 },
			version: "vf",
			parentId: null,
		};
		const fn: CodeNode = {
			id: "s0",
			kind: "function",
			name: "debitDuCompte",
			file: "src/caisse.ts",
			span: { start: 10, end: 20 },
			version: "v0",
			parentId: "f0",
		};
		const caller: CodeNode = {
			id: "s1",
			kind: "function",
			name: "checkoutFlow",
			file: "src/caisse.ts",
			span: { start: 30, end: 40 },
			version: "v1",
			parentId: "f0",
		};
		return {
			nodes: [file, fn, caller],
			edges: [{ from: "s1", to: "s0", kind: "calls", confidence: "extracted" }],
		};
	};

	it("un kernel d'écart s'ANCRE sur ses fonctions (nom lexical) + la taille de sa vague", () => {
		const st = withKernel(); // scale = app/paiement/checkout/debit-du-compte
		const { nodes, edges } = codeFixture();
		const d = codeDeltaFor(st.kernels, st.tree, nodes, edges);
		expect(d).toHaveLength(1);
		expect(d[0].anchors.length).toBeGreaterThan(0);
		expect(d[0].anchors[0].name).toBe("debitDuCompte");
		expect(d[0].waveSize).toBeGreaterThan(0); // checkoutFlow + le fichier rougissent
	});

	it("TOTAL & DÉTERMINISTE : graphe de code vide → ancres vides, jamais une erreur", () => {
		const st = withKernel();
		const a = codeDeltaFor(st.kernels, st.tree, [], []);
		expect(a).toEqual(codeDeltaFor(st.kernels, st.tree, [], []));
		expect(a[0].anchors).toEqual([]);
		expect(a[0].waveSize).toBe(0);
	});
});

describe("L'ÉCHELLE PARAMÉTRABLE — le cliquet tient sur N'IMPORTE QUELLE échelle déclarée", () => {
	it("une échelle sur mesure (dev → preprod → prod) : chaque barreau exige le précédent", () => {
		const ladder = ["dev", "preprod", "prod"];
		let st = initBuilderState([], undefined, ladder);
		expect(st.ladder).toEqual(ladder);
		expect(Object.keys(st.envs)).toEqual(ladder);
		st = applyIntent(
			st,
			"capture l'idée : au checkout, débiter une seule fois",
		).state;
		st = applyIntent(st, "promeus la dernière idée").state;
		// preprod direct → refusé (dev d'abord)
		expect(
			applyIntent(st, "déploie l'application en preprod").events.some(
				(e) => e.kind === "refus",
			),
		).toBe(true);
		// dev → preprod → prod : la même version monte chaque barreau déclaré
		const d = applyIntent(st, "déploie l'application en dev");
		const pp = applyIntent(d.state, "déploie l'application en preprod");
		expect(
			pp.events.some((e) => e.kind === "deploiement" && e.env === "preprod"),
		).toBe(true);
		const pr = applyIntent(pp.state, "déploie l'application en prod");
		expect(pr.state.envs.prod?.version).toBe(d.state.envs.dev?.version);
	});
});
