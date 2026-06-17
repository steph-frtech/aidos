import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	applyIntent,
	type BuilderState,
	CANONICAL_ACTIONS,
	classifyIntent,
	codeDeltaFor,
	ENV_LADDER,
	INTENT_KINDS,
	initBuilderState,
	LIVE_GESTURES,
	resolveScreen,
	type ScreenRef,
	understand,
} from "./builder";
import type { CodeEdge, CodeNode } from "./code-graph";
import { nodeByPath } from "./composition";
import {
	ALL_SCREENS,
	canonicalOpenPhrase,
	registryHash,
	registryIsTotal,
} from "./screen-registry";
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
	it("le jeu des intentions est déclaré et clos (le cycle de vie ENTIER d'une appli + la navigation totale + les capacités lancées + les LECTURES LIVE + les PROPOSITIONS)", () => {
		// LE NOYAU : le cycle de vie + la nav + les deux capacités lancées (l'ordre déclaré est fixe).
		const noyau = [
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
			// LES CAPACITÉS LANCÉES — le bench de complétude + l'exploration d'évolution :
			// un bouton de cockpit ENVOIE le geste au chat, le réducteur le ROUTE vers son port.
			"lancer_bench",
			"explorer_evolution",
		];
		expect(INTENT_KINDS.slice(0, noyau.length)).toEqual(noyau);
		// LE VOCABULAIRE ÉTENDU (ADR 0092) — chaque geste LIVE/PROPOSE déclaré dans LIVE_GESTURES
		// EST un intent du jeu clos (la bijection table↔jeu), et chaque intent n'apparaît qu'UNE fois.
		for (const g of LIVE_GESTURES) expect(INTENT_KINDS).toContain(g.intent);
		expect(new Set(INTENT_KINDS).size).toBe(INTENT_KINDS.length);
		// Le jeu couvre AU MOINS le noyau + les 25 gestes de capacités V3 (jamais « plein de gestes manquants »).
		expect(INTENT_KINDS.length).toBeGreaterThanOrEqual(noyau.length + 25);
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

// ── LA LOI DE COUVERTURE DES ACTIONS (§1/§5 « pas de monstre » généralisée) ────
//
// Le REGISTRE CANONIQUE (CANONICAL_ACTIONS) liste CHAQUE action que l'OS expose : un
// bouton de cockpit qui ENVOIE un geste au chat, les gestes de cycle de vie. La loi :
// ∀ action exposée, sa phrase canonique s'ACCROCHE à un type de réponse (≠ le fallthrough
// « incomprise »). Une action exposée sans réponse est un MONSTRE — l'inverse d'un miroir
// orphelin. C'est CE registre qui PILOTE le miroir : il itère le registre, jamais une liste
// codée à part (un nouvel écran qui envoie un geste s'ajoute au registre → la loi le couvre).

describe("LA LOI DE COUVERTURE DES ACTIONS — 100 % des actions de l'OS sont COMPRISES", () => {
	it("le registre canonique est clos et non vide (chaque action exposée y figure)", () => {
		expect(CANONICAL_ACTIONS.length).toBeGreaterThan(0);
		// Chaque action vise un intent DU JEU CLOS (jamais un kind inventé).
		for (const a of CANONICAL_ACTIONS) expect(INTENT_KINDS).toContain(a.expect);
		// Les identifiants sont uniques (pas deux fois la même action).
		const ids = CANONICAL_ACTIONS.map((a) => a.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("∀ action canonique : understand(phrase) est COMPRISE et s'accroche au BON type de réponse — JAMAIS « incomprise »", () => {
		const st = initBuilderState([
			// L'écran « idea » est dans le registre V2 ; rien d'autre à injecter.
		]);
		for (const a of CANONICAL_ACTIONS) {
			const u = understand(st, a.phrase);
			expect(u.status, `action ${a.id} : « ${a.phrase} » → ${u.status}`).toBe(
				"comprise",
			);
			expect(u.status).not.toBe("incomprise");
			expect(u.attente, `action ${a.id} doit s'accrocher à ${a.expect}`).toBe(
				a.expect,
			);
		}
	});

	it("∀ action canonique : applyIntent ne produit JAMAIS un événement de refus (l'action est exécutée/routée)", () => {
		// Chaque action est jouée sur un état PRÉPARÉ pour elle (les actions du cycle de vie
		// exigent un substrat — une idée capturée, un kernel promu…). Le registre garantit la
		// COMPRÉHENSION ; ce test garantit qu'aucune action canonique ne RETOMBE en refus.
		const base = applyIntent(
			S(),
			"capture l'idée : au checkout, débiter le compte une seule fois",
		).state;
		const withK = applyIntent(base, "promeus la dernière idée").state;
		// L'état le plus riche (idée + kernel) satisfait les pré-requis de toutes les actions
		// SAUF la promotion (qui consomme « la dernière idée ») — jouée sur l'état à idée seule.
		for (const a of CANONICAL_ACTIONS) {
			const st = a.expect === "promouvoir" ? base : withK;
			const r = applyIntent(st, a.phrase);
			const refus = r.events.find((e) => e.kind === "refus");
			expect(
				refus,
				`action ${a.id} : « ${a.phrase} » a été REFUSÉE : ${refus?.detail ?? ""}`,
			).toBeUndefined();
		}
	});

	it("BENCH DE COMPLÉTUDE : « lance le bench de complétude sur la spec createOrder » → bench_lance vers /v3/bench (jamais incomprise)", () => {
		const r = applyIntent(
			S(),
			"lance le bench de complétude sur la spec createOrder",
		);
		const ev = r.events.find((e) => e.kind === "bench_lance");
		expect(ev, "le bench doit être lancé/routé").toBeDefined();
		expect(ev?.ref).toBe("/v3/bench#createOrder");
		// AUCUN refus, AUCUNE écriture-vérité, AUCUNE mutation d'état (un run below-the-line).
		expect(r.events.some((e) => e.kind === "refus")).toBe(false);
		expect(r.state.kernels).toHaveLength(0);
		expect(r.state.ideas).toHaveLength(0);
		expect(r.impacts).toHaveLength(0);
	});

	it("EXPLORATION D'ÉVOLUTION : « explore l'évolution de la cellule X par self-play » → evolution_exploree vers /v3/evolve (jamais incomprise)", () => {
		const r = applyIntent(
			S(),
			"explore l'évolution de la cellule debit-du-compte par self-play",
		);
		const ev = r.events.find((e) => e.kind === "evolution_exploree");
		expect(ev, "l'exploration doit être lancée/routée").toBeDefined();
		expect(ev?.ref).toBe("/v3/evolve#debit-du-compte");
		expect(r.events.some((e) => e.kind === "refus")).toBe(false);
		expect(r.state.kernels).toHaveLength(0);
		expect(r.impacts).toHaveLength(0);
	});

	it("∀ action canonique : aucune n'écrit la vérité (le MUR tient — bench/évolution PROPOSENT, ne gravent pas)", () => {
		const withK = (() => {
			const a = applyIntent(
				S(),
				"capture l'idée : au checkout, débiter une seule fois",
			).state;
			return applyIntent(a, "promeus la dernière idée").state;
		})();
		for (const a of CANONICAL_ACTIONS) {
			const r = applyIntent(withK, a.phrase);
			for (const k of r.state.kernels) expect(k.wroteKernel).toBe(false);
			for (const i of r.state.ideas) expect(i.hasMirror).toBe(false);
			// les capacités lancées ne mutent RIEN sauf le journal (append-only §9) : un run
			// below-the-line projeté — l'arbre, les idées, les kernels, les envs sont intacts.
			const live = LIVE_GESTURES.some((g) => g.intent === a.expect);
			if (
				a.expect === "lancer_bench" ||
				a.expect === "explorer_evolution" ||
				live
			) {
				expect(r.state.tree).toEqual(withK.tree);
				expect(r.state.ideas).toEqual(withK.ideas);
				expect(r.state.kernels).toEqual(withK.kernels);
				expect(r.state.envs).toEqual(withK.envs);
				expect(r.impacts).toEqual([]);
			}
		}
	});
});

// ── LE VOCABULAIRE ÉTENDU (ADR 0092) : LES LECTURES LIVE + LES PROPOSITIONS ────
//
// L'utilisateur : « il manque toujours plein de gestes ». Le vocabulaire du chat doit
// couvrir TOUTES les capacités V3 (les serveurs DISPATCHÉS par la passerelle), pas 12.
// LIVE_GESTURES est la table FERMÉE, déclarée (§8) qui mappe chaque geste à son intent +
// son serveur dispatché + son outil + la nature (lecture live / proposition). Le miroir
// prouve trois lois :
//   (NO-LIE §8)  ∀ geste DÉCLARÉ → un kind TRAITÉ par le réducteur (bijection geste↔kind ;
//                un geste qui parse mais ne produit rien = un mensonge, interdit) ;
//   (ADR 0092)   une LECTURE pointe son serveur dispatché (via → readVia en aval ; le moteur
//                Go est la SOURCE — jamais une logique réimplémentée dans le réducteur) ;
//   (LE MUR §2)  une PROPOSITION atteste une idée/ChangeSet DRAFT — JAMAIS une écriture-vérité.

describe("LE VOCABULAIRE ÉTENDU — chaque capacité V3 a SON geste, SON kind, SON serveur (ADR 0092)", () => {
	it("la table LIVE_GESTURES est close et bien formée (intents uniques, serveur/outil/ancre non vides)", () => {
		expect(LIVE_GESTURES.length).toBeGreaterThanOrEqual(25);
		const intents = LIVE_GESTURES.map((g) => g.intent);
		expect(new Set(intents).size, "un intent par geste, jamais dupliqué").toBe(
			intents.length,
		);
		for (const g of LIVE_GESTURES) {
			expect(INTENT_KINDS, `${g.intent} hors du jeu clos`).toContain(g.intent);
			expect(g.server.length).toBeGreaterThan(0);
			expect(g.tool.length).toBeGreaterThan(0);
			expect(g.anchor.length).toBeGreaterThan(0);
			expect(g.argKey.length).toBeGreaterThan(0);
			expect(g.fallback.length).toBeGreaterThan(0);
			expect(g.route.startsWith("/"), `route ${g.route}`).toBe(true);
			expect([false, "idee", "changeset"]).toContain(g.propose);
		}
	});

	it("NO-LIE (§8) : ∀ geste DÉCLARÉ dans CANONICAL_ACTIONS, le réducteur PRODUIT un événement (jamais un parse sans réponse)", () => {
		// La BIJECTION geste↔kind-traité : chaque action canonique → understand comprise →
		// applyIntent produit AU MOINS un événement ≠ refus. Un geste qui parse mais ne produit
		// rien (ou retombe en refus) serait un MENSONGE (§8). On joue chaque geste sur l'état
		// PRÉPARÉ pour lui (les actions de cycle de vie exigent un substrat).
		const base = applyIntent(
			S(),
			"capture l'idée : au checkout, débiter le compte une seule fois",
		).state;
		const withK = applyIntent(base, "promeus la dernière idée").state;
		for (const a of CANONICAL_ACTIONS) {
			const st = a.expect === "promouvoir" ? base : withK;
			const u = understand(st, a.phrase);
			expect(u.attente, `geste ${a.id} non compris`).toBe(a.expect);
			const r = applyIntent(st, a.phrase);
			expect(
				r.events.length,
				`geste ${a.id} ne produit AUCUN événement (un mensonge §8)`,
			).toBeGreaterThan(0);
			expect(
				r.events.some((e) => e.kind === "refus"),
				`geste ${a.id} retombe en refus`,
			).toBe(false);
		}
	});

	it("NO-LIE (bijection) : ∀ geste LIVE/PROPOSE, son intent est TRAITÉ → un événement lecture_live|proposition (jamais incompris/refus)", () => {
		const st = S();
		// Une phrase canonique MINIMALE par geste (le verbe d'ancrage + la cible) — chaque
		// intent du jeu clos a son cas dans le réducteur (la couverture, l'inverse d'un monstre).
		const phraseFor: Record<string, string> = {};
		for (const a of CANONICAL_ACTIONS) phraseFor[a.expect] = a.phrase;
		for (const g of LIVE_GESTURES) {
			const phrase = phraseFor[g.intent];
			expect(phrase, `geste ${g.intent} sans phrase canonique`).toBeDefined();
			const u = understand(st, phrase);
			expect(u.attente, `« ${phrase} » → ${u.attente}`).toBe(g.intent);
			const r = applyIntent(st, phrase);
			const ev = r.events[0];
			const expectedKind = g.propose === false ? "lecture_live" : "proposition";
			expect(ev.kind, `geste ${g.intent} kind`).toBe(expectedKind);
		}
	});

	it("ADR 0092 : ∀ LECTURE live → un événement lecture_live qui POINTE le serveur dispatché (via.server/via.tool), aval = readVia", () => {
		const st = S();
		const byIntent: Record<string, string> = {};
		for (const a of CANONICAL_ACTIONS) byIntent[a.expect] = a.phrase;
		for (const g of LIVE_GESTURES.filter((x) => x.propose === false)) {
			const r = applyIntent(st, byIntent[g.intent]);
			const ev = r.events.find((e) => e.kind === "lecture_live");
			expect(ev, `lecture ${g.intent} absente`).toBeDefined();
			expect(ev?.via?.server, `${g.intent} via.server`).toBe(g.server);
			expect(ev?.via?.tool, `${g.intent} via.tool`).toBe(g.tool);
			// la cible extraite est passée en argument (la clé déclarée) — VERBATIM.
			expect(ev?.via?.args[g.argKey]).toBeDefined();
			// AUCUNE proposition (propose absent) — une lecture ne change pas la vérité.
			expect(ev?.propose).toBeUndefined();
			expect(ev?.ref?.startsWith(g.route)).toBe(true);
		}
	});

	it("LE MUR (§2) : ∀ PROPOSITION → un événement proposition DRAFT (idee|changeset), JAMAIS une écriture-vérité", () => {
		const st = S();
		const byIntent: Record<string, string> = {};
		for (const a of CANONICAL_ACTIONS) byIntent[a.expect] = a.phrase;
		for (const g of LIVE_GESTURES.filter((x) => x.propose !== false)) {
			const r = applyIntent(st, byIntent[g.intent]);
			const ev = r.events.find((e) => e.kind === "proposition");
			expect(ev, `proposition ${g.intent} absente`).toBeDefined();
			expect(ev?.propose, `${g.intent} nature`).toBe(g.propose);
			expect(ev?.via?.server).toBe(g.server);
			// AUCUNE écriture : ni idée gravée avec miroir, ni kernel — l'état est intact.
			expect(r.state.ideas).toEqual(st.ideas);
			expect(r.state.kernels).toEqual(st.kernels);
			expect(r.state.envs).toEqual(st.envs);
		}
	});

	it("∀ geste LIVE/PROPOSE est DÉTERMINISTE : même message → même événement (le réducteur reste PUR, aucun I/O)", () => {
		const st = S();
		for (const a of CANONICAL_ACTIONS.filter((x) =>
			LIVE_GESTURES.some((g) => g.intent === x.expect),
		)) {
			const a1 = applyIntent(st, a.phrase);
			const a2 = applyIntent(st, a.phrase);
			expect(a1.events).toEqual(a2.events);
			expect(a1.state).toEqual(a2.state);
		}
	});

	it("la cible est reprise VERBATIM (casse préservée) — « createOrder » reste « createOrder », jamais « createorder »", () => {
		const st = S();
		const r = applyIntent(st, "auto-certifie la batterie createOrder");
		const ev = r.events.find((e) => e.kind === "lecture_live");
		expect(ev?.via?.args.spec).toBe("createOrder");
		const r2 = applyIntent(st, "inspecte la forme de l'entité Commande");
		expect(
			r2.events.find((e) => e.kind === "lecture_live")?.via?.args.entity,
		).toBe("Commande");
	});

	it("un geste de LECTURE sans cible citée tombe sur la CANONIQUE de repli (fail-soft, jamais un crash, l'écran porte la spec)", () => {
		const st = S();
		// « mesure la conformité architecturale » sans cible → la lecture part quand même.
		const r = applyIntent(st, "mesure la conformité architecturale du projet");
		const ev = r.events.find((e) => e.kind === "lecture_live");
		expect(ev?.via?.server).toBe("arch-fitness");
		expect(ev?.via?.args.scope.length).toBeGreaterThan(0);
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

// ── LE REGISTRE D'ÉCRANS COMPLET PILOTE LA LOI DE COUVERTURE DE LA NAV ─────────
//
// L'EXTENSION (au-delà des phrases que les écrans émettent). Le registre canonique que le
// miroir itère n'est plus le seul registre V2 (22 écrans) : c'est ALL_SCREENS — TOUTES les
// capacités de la nav, déclarées en données (racine V1 + V2 + V3, 209 écrans). La loi de
// couverture s'applique à CHACUNE : « ouvre <écran> » s'accroche au type de réponse `ouvrir`
// et resolveScreen résout l'écran vers SA route — JAMAIS le fallthrough « incomprise »/« écran
// introuvable ». Une capacité de la nav que le chat ne sait pas atteindre serait un MONSTRE
// (l'inverse d'un miroir orphelin) ; ce miroir l'attrape par construction.
//
// NON TAUTOLOGIQUE. Le miroir n'est pas « le code prouve le code » : la propriété dédiée RETIRE
// une entrée de l'inventaire passé à resolveScreen et exige que le miroir ROUGISSE en NOMMANT
// l'écran devenu inatteignable. La couverture est donc une vraie contrainte, pas une identité.

/** Récupère un écran du registre par sa route (jette si absent — la cible du test DOIT exister). */
function screenAt(route: string): ScreenRef {
	const sc = ALL_SCREENS.find((s) => s.route === route);
	if (sc === undefined) throw new Error(`écran ${route} absent du registre`);
	return sc;
}

describe("LE REGISTRE D'ÉCRANS COMPLET — l'autorité que le miroir itère", () => {
	it("le registre est TOTAL : route non vide, route UNIQUE, label non vide (pas de monstre structurel)", () => {
		expect(registryIsTotal()).toBe(true);
		expect(ALL_SCREENS.length).toBeGreaterThan(100); // racine + V2 + V3 (toute la nav)
		const routes = ALL_SCREENS.map((s) => s.route);
		expect(new Set(routes).size).toBe(routes.length);
	});

	it("le registre est content-adressé STABLE (déterministe — même registre → même empreinte)", () => {
		expect(registryHash()).toBe(registryHash());
	});

	it("le registre V2 déclaré (SCREENS) est INCLUS dans le registre complet (aucun écran V2 perdu)", () => {
		const routes = new Set(ALL_SCREENS.map((s) => s.route));
		for (const e of SCREENS)
			expect(routes.has(`/v2/${e.slug}`), `V2 /${e.slug} absent`).toBe(true);
	});
});

describe("OUVRIR — ∀ capacité de la nav (le registre COMPLET) est atteignable depuis le chat", () => {
	it("LA LOI DE COUVERTURE (registre COMPLET) : ∀ écran de ALL_SCREENS, sa phrase canonique s'accroche à `ouvrir` ET résout vers SA route — JAMAIS le fallthrough", () => {
		const st = S();
		// L'inventaire du réducteur EST le registre complet (initBuilderState le prend par défaut).
		const inventory = new Set(st.screens.map((s) => s.route));
		for (const sc of ALL_SCREENS) {
			expect(inventory.has(sc.route), `écran ${sc.route} hors inventaire`).toBe(
				true,
			);
			const phrase = canonicalOpenPhrase(sc);
			// (a) la phrase s'accroche au type de réponse `ouvrir` (jamais « incomprise »/« ambigue »).
			const u = understand(st, phrase);
			expect(u.status, `« ${phrase} » → ${u.status}`).toBe("comprise");
			expect(u.attente).toBe("ouvrir");
			// (b) le réducteur OUVRE l'écran (jamais un refus), vers SA route.
			const r = applyIntent(st, phrase);
			const ev = r.events.find((e) => e.kind === "ecran_ouvert");
			expect(
				ev,
				`écran ${sc.route} inatteignable (« ${phrase} »)`,
			).toBeDefined();
			expect(ev?.ref, `« ${phrase} » devait ouvrir ${sc.route}`).toBe(sc.route);
			expect(r.events.some((e) => e.kind === "refus")).toBe(false);
		}
	});

	it("LA PREUVE DE NON-TAUTOLOGIE : retirer une entrée de l'inventaire fait ROUGIR le miroir en NOMMANT l'écran inatteignable", () => {
		// On choisit un écran-cible (une capacité réelle de la nav), on l'OTE de l'inventaire,
		// et on vérifie que la loi de couverture ÉCHOUE précisément sur lui (resolveScreen ne
		// retourne plus SA route). Si le miroir restait vert malgré le retrait, il serait tautologique.
		const target = screenAt("/v3/code");
		const reduced: ScreenRef[] = ALL_SCREENS.filter(
			(s) => s.route !== target.route,
		);
		// L'écran retiré n'est plus résolu vers SA route (la couverture est BRISÉE → le miroir rougirait).
		const got = resolveScreen(reduced, canonicalOpenPhrase(target));
		expect(
			got?.route,
			`/v3/code ne devrait plus résoudre vers lui-même une fois retiré (got ${got?.route ?? "null"})`,
		).not.toBe("/v3/code");
		// Et la LOI complète, rejouée sur l'inventaire amputé, échoue EN NOMMANT l'écran manquant.
		const offenders = ALL_SCREENS.filter((sc) => {
			const r = resolveScreen(reduced, canonicalOpenPhrase(sc));
			return r === null || r.route !== sc.route;
		}).map((s) => s.route);
		expect(offenders, "le retrait DOIT casser la couverture").toContain(
			"/v3/code",
		);
	});

	it("les écrans V3 (sous-routes /v3/*, JAMAIS énumérées par le scan plat) sont atteignables — l'angle mort comblé", () => {
		const st = S();
		for (const route of ["/v3/code", "/v3/bench", "/v3/evolve", "/v3/design"]) {
			const r = applyIntent(st, canonicalOpenPhrase(screenAt(route)));
			const ev = r.events.find((e) => e.kind === "ecran_ouvert");
			expect(ev?.ref, `${route} inatteignable`).toBe(route);
		}
	});

	it("les HOMONYMES sont DÉPARTAGÉS déterministiquement (/v2/code ≠ /v3/code ≠ … via le préfixe de section)", () => {
		const st = S();
		const pairs: [string, string][] = [
			["/v2/code", "/v3/code"],
			["/goal", "/v2/goal"],
			["/conscience", "/v2/conscience"],
			["/policy", "/v2/policy"],
			["/deploy", "/v2/deploy"],
			["/operation", "/v3/operation"],
			["/ai-lab", "/v2/ai-lab"],
		];
		const openedRoute = (route: string): string | undefined =>
			applyIntent(st, canonicalOpenPhrase(screenAt(route))).events.find(
				(e) => e.kind === "ecran_ouvert",
			)?.ref;
		for (const [a, b] of pairs) {
			expect(openedRoute(a)).toBe(a);
			expect(openedRoute(b)).toBe(b);
		}
	});

	it("OUVRIR n'écrit JAMAIS la vérité (le MUR : ouvrir ROUTE, n'exécute aucune écriture-vérité)", () => {
		const st = S();
		for (const sc of ALL_SCREENS.slice(0, 20)) {
			const r = applyIntent(st, canonicalOpenPhrase(sc));
			// aucune mutation : pas d'idée, pas de kernel, pas d'env touché ; seul le journal grandit.
			expect(r.state.ideas).toEqual(st.ideas);
			expect(r.state.kernels).toEqual(st.kernels);
			expect(r.state.envs).toEqual(st.envs);
			expect(r.impacts).toEqual([]);
		}
	});

	it("le registre V2 déclaré reste atteignable par sa SECTION + son SLUG (la rétrocompat de WB2-25, honnête)", () => {
		// HONNÊTETÉ (le coût documenté de la couverture totale) : maintenant que les écrans-RACINE
		// cohabitent dans l'inventaire, un TITRE FR EN PROSE est parfois AMBIGU — « …d'opération »
		// (titre de /v2/workflows) accroche le token « operation » de la route-racine /operation
		// (qui touche en plus le bonus de slug exact), et un homonyme exact (« conscience »,
		// « deploy ») se départage par l'ordre de route (la racine < /v2/…). Ce n'est PAS un défaut :
		// la phrase NON ambiguë cite la SECTION + le SLUG — l'adresse canonique d'un écran (le slug
		// est le segment terminal de sa route, ce que la nav V2 lie de toute façon : /v2/<slug>).
		// Chaque écran V2 résout alors vers SA route, sans collision avec la racine.
		const st = S();
		for (const entry of SCREENS) {
			const r = applyIntent(st, `ouvre v2 ${entry.slug}`);
			const ev = r.events.find((e) => e.kind === "ecran_ouvert");
			expect(ev, `écran v2/${entry.slug} inatteignable`).toBeDefined();
			expect(ev?.ref).toBe(`/v2/${entry.slug}`);
		}
	});

	it("les écrans injectés runtime (extraScreens) restent atteignables (l'inventaire reste une donnée extensible)", () => {
		const st = initBuilderState([
			{
				route: "/dynamic-screen",
				label: "dynamic screen écran dynamique injecté",
			},
		]);
		const r = applyIntent(st, "ouvre dynamic screen");
		const ev = r.events.find((e) => e.kind === "ecran_ouvert");
		expect(ev?.ref).toBe("/dynamic-screen");
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

	it("ouvrir un écran introuvable → refus (fail-closed — une route INVENTÉE n'existe jamais)", () => {
		const r = applyIntent(S(), "ouvre l'écran zzzqqq");
		expect(r.events.some((e) => e.kind === "refus")).toBe(true);
	});

	it("une capacité qui ÉCRIT LA VÉRITÉ reste routée par le MUR (idée → /goal), jamais exécutée par « ouvrir »", () => {
		// « promouvoir » est le seul intent qui approche la vérité — il PROPOSE un ChangeSet DRAFT,
		// jamais une écriture. Le miroir prouve : même la capacité d'écriture passe par la porte.
		const base = applyIntent(
			S(),
			"capture l'idée : au checkout, débiter une seule fois",
		).state;
		const r = applyIntent(base, "promeus la dernière idée");
		const k = r.events.find((e) => e.kind === "kernel_propose");
		expect(k).toBeDefined();
		expect(r.state.kernels[0].wroteKernel).toBe(false);
		expect(r.state.kernels[0].changeSet.status).toBe("DRAFT");
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
