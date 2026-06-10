/**
 * WB2-22 — le MIROIR DE REPRODUCTIBILITÉ du twin du « déploiement » (Vitest + fast-check).
 *
 * Critère de done WB2-22 : « e2e — déploiement → URL live + aperçu ; le bouton refuse sans auth (gate) ;
 * le mur (action sous la ligne) ». Ce miroir épingle le twin (réutilise emitView/appPreview/entityId de
 * WB2-21, ADR 0007 no-fork) :
 *   - PLAN REPRODUCTIBLE : `buildDeployPlan` est PUR — la MÊME source + la même garde N fois → même planId,
 *     même URL, même appHash (`reDeployStable` le prouve déterministiquement) ;
 *   - LA GARDE SÉCURITÉ d'ADR 0052, fail-closed & ordonnée : non authentifié → DEPLOY_GATE_UNAUTHENTICATED ;
 *     authentifié sous quota → autorisé ; quota atteint → DEPLOY_GATE_RATE_LIMITED ; le bouton ne planifie
 *     QUE si la garde passe (garde refusée → BlockReason, AUCUN plan) ;
 *   - l'URL est DÉRIVÉE de la table émise : `subdomainOf(table)`.`BASE_DOMAIN` → `https://…` ;
 *   - les SERVICES conteneurisés sont le jeu CLOS déclaré (postgres · app · traefik) ;
 *   - l'APERÇU LIVE = l'aperçu émis (`appPreview`) : la table back-office que l'app servirait ;
 *   - un AST malformé → un `BlockReason` (jamais une URL devinée, jamais un déploiement silencieux).
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : aucune horloge, aucun aléa, aucun LLM — la planification est une
 * fonction pure de l'AST + la garde. LE MUR (§2) : le twin LIT l'AST et REND un plan ; il n'écrit rien.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ScalarType } from "../entity-source";
import {
	BASE_DOMAIN,
	buildDeployPlan,
	CONTAINER_SERVICES,
	DEFAULT_RATE_LIMIT,
	type DeployGateContext,
	deployGate,
	ENTITY_CASES,
	type Entity,
	type GateVerdict,
	isBlockedPlan,
	reDeployStable,
	subdomainOf,
} from "./deploy";
import {
	appPreview,
	ENTITY_ORDER,
	ENTITY_ORDER_CHANGED,
	emitView,
	isBlockedView,
	SCALAR_TYPES,
} from "./emetteurs";

// Une garde AUTORISÉE (authentifié, sous quota) — le cas nominal partagé par les tests.
const ALLOW: GateVerdict = deployGate({
	authenticated: true,
	deploysInWindow: 0,
	rateLimitPerWindow: DEFAULT_RATE_LIMIT,
});

// Un générateur d'entité bien formée (le même patron que le miroir emetteurs) : nom non vide, ≥1 attribut
// typé sur le jeu fermé, noms uniques, au plus un identifiant.
const arbEntity = (): fc.Arbitrary<Entity> =>
	fc
		.record({
			name: fc
				.stringMatching(/^[A-Za-z][A-Za-z0-9]{0,9}$/)
				.filter((s) => s.length > 0),
			attrs: fc.array(
				fc.record({
					name: fc
						.stringMatching(/^[a-z][a-z0-9_]{0,9}$/)
						.filter((s) => s.length > 0),
					type: fc.constantFrom(...(SCALAR_TYPES as readonly ScalarType[])),
					required: fc.boolean(),
				}),
				{ minLength: 1, maxLength: 6 },
			),
			idIdx: fc.nat(),
		})
		.map(({ name, attrs, idIdx }) => {
			const seen = new Set<string>();
			const uniq = attrs.filter((a) => {
				if (seen.has(a.name)) return false;
				seen.add(a.name);
				return true;
			});
			const id = idIdx % uniq.length;
			return {
				name,
				attributes: uniq.map((a, i) => ({
					name: a.name,
					type: a.type,
					required: a.required,
					identifier: i === id,
				})),
			};
		});

describe("WB2-22 lib/v2/deploy — le déploiement de l'app émise (twin pur, ADR 0052 · 0007)", () => {
	// (1) PLAN REPRODUCTIBLE — le critère de done property.
	it("plan reproductible : la même source + garde N fois → même planId, URL, appHash", () => {
		fc.assert(
			fc.property(arbEntity(), (e) => {
				const report = reDeployStable(e, ALLOW, 12);
				expect(report.stable).toBe(true);
				expect(report.planId).not.toBe("");
				expect(report.url).not.toBe("");
				expect(report.appHash).not.toBe("");
			}),
		);
	});

	// (2) buildDeployPlan lui-même est pur : deux appels → plan identique.
	it("buildDeployPlan est pur : deux appels sur la même source → planId + URL identiques", () => {
		fc.assert(
			fc.property(arbEntity(), (e) => {
				const a = buildDeployPlan(e, ALLOW);
				const b = buildDeployPlan(e, ALLOW);
				expect(isBlockedPlan(a)).toBe(false);
				expect(isBlockedPlan(b)).toBe(false);
				if (!isBlockedPlan(a) && !isBlockedPlan(b)) {
					expect(a.planId).toBe(b.planId);
					expect(a.route.url).toBe(b.route.url);
					expect(a.appHash).toBe(b.appHash);
				}
			}),
		);
	});

	// (3) LA GARDE : non authentifié → refus DEPLOY_GATE_UNAUTHENTICATED (fail-closed).
	it("garde : non authentifié → refus DEPLOY_GATE_UNAUTHENTICATED", () => {
		const v = deployGate({
			authenticated: false,
			deploysInWindow: 0,
			rateLimitPerWindow: DEFAULT_RATE_LIMIT,
		});
		expect(v.allowed).toBe(false);
		expect(v.reason?.code).toBe("DEPLOY_GATE_UNAUTHENTICATED");
		expect(v.reason?.severity).toBe("blocking");
		expect(v.reason?.how_to_fix.length).toBeGreaterThan(0);
	});

	// (4) LA GARDE : authentifié, sous quota → autorisé (aucun BlockReason).
	it("garde : authentifié sous quota → autorisé", () => {
		const v = deployGate({
			authenticated: true,
			deploysInWindow: 1,
			rateLimitPerWindow: DEFAULT_RATE_LIMIT,
		});
		expect(v.allowed).toBe(true);
		expect(v.reason).toBe(null);
	});

	// (5) LA GARDE : quota atteint → refus DEPLOY_GATE_RATE_LIMITED (le rate-limit).
	it("garde : quota atteint → refus DEPLOY_GATE_RATE_LIMITED", () => {
		const v = deployGate({
			authenticated: true,
			deploysInWindow: DEFAULT_RATE_LIMIT,
			rateLimitPerWindow: DEFAULT_RATE_LIMIT,
		});
		expect(v.allowed).toBe(false);
		expect(v.reason?.code).toBe("DEPLOY_GATE_RATE_LIMITED");
	});

	// (6) LA GARDE est ORDONNÉE (auth d'abord) : non authentifié ∧ quota dépassé → c'est l'auth qui parle.
	it("garde ordonnée : non authentifié ∧ quota dépassé → DEPLOY_GATE_UNAUTHENTICATED (auth d'abord)", () => {
		const v = deployGate({
			authenticated: false,
			deploysInWindow: 999,
			rateLimitPerWindow: DEFAULT_RATE_LIMIT,
		});
		expect(v.reason?.code).toBe("DEPLOY_GATE_UNAUTHENTICATED");
	});

	// (7) LE BOUTON ne planifie QUE si la garde passe : garde refusée → le BlockReason de la garde, AUCUN plan.
	it("garde refusée → buildDeployPlan renvoie le BlockReason de la garde (aucun plan)", () => {
		const refused = deployGate({
			authenticated: false,
			deploysInWindow: 0,
			rateLimitPerWindow: DEFAULT_RATE_LIMIT,
		});
		const plan = buildDeployPlan(ENTITY_ORDER, refused);
		expect(isBlockedPlan(plan)).toBe(true);
		if (isBlockedPlan(plan)) {
			expect(plan.code).toBe("DEPLOY_GATE_UNAUTHENTICATED");
		}
	});

	// (8) Garde refusée → reDeployStable n'est PAS stable (pas de plan à comparer ; fail-closed).
	it("garde refusée → reDeployStable.stable = false (fail-closed)", () => {
		const refused = deployGate({
			authenticated: false,
			deploysInWindow: 0,
			rateLimitPerWindow: DEFAULT_RATE_LIMIT,
		});
		const report = reDeployStable(ENTITY_ORDER, refused, 8);
		expect(report.stable).toBe(false);
		expect(report.planId).toBe("");
	});

	// (9) L'URL est DÉRIVÉE de la table émise : subdomainOf(table).BASE_DOMAIN → https://…
	it("URL dérivée de la table : https://<subdomain>.<BASE_DOMAIN>", () => {
		fc.assert(
			fc.property(arbEntity(), (e) => {
				const plan = buildDeployPlan(e, ALLOW);
				expect(isBlockedPlan(plan)).toBe(false);
				if (!isBlockedPlan(plan)) {
					const expectedSub = subdomainOf(appPreview(e).table);
					expect(plan.route.subdomain).toBe(expectedSub);
					expect(plan.route.host).toBe(`${expectedSub}.${BASE_DOMAIN}`);
					expect(plan.route.url).toBe(`https://${expectedSub}.${BASE_DOMAIN}`);
				}
			}),
		);
	});

	// (10) subdomainOf est TOTAL : une table vide/dégénérée → « app » (jamais un sous-domaine vide).
	it("subdomainOf total : table vide/dégénérée → « app »", () => {
		expect(subdomainOf("")).toBe("app");
		expect(subdomainOf("___")).toBe("app");
		expect(subdomainOf("Order")).toBe("order");
		expect(subdomainOf("My Cart!")).toBe("my-cart");
	});

	// (11) Les SERVICES conteneurisés = le jeu CLOS déclaré (postgres · app · traefik).
	it("services conteneurisés = le jeu clos déclaré (postgres · app · traefik)", () => {
		const plan = buildDeployPlan(ENTITY_ORDER, ALLOW);
		expect(isBlockedPlan(plan)).toBe(false);
		if (!isBlockedPlan(plan)) {
			expect(plan.services).toEqual(CONTAINER_SERVICES);
			expect(plan.services.map((s) => s.name)).toEqual([
				"postgres",
				"app",
				"traefik",
			]);
		}
	});

	// (12) L'APERÇU LIVE = l'aperçu émis (appPreview) : la table back-office que l'app servirait.
	it("aperçu live = appPreview (la table back-office de l'app servie)", () => {
		fc.assert(
			fc.property(arbEntity(), (e) => {
				const plan = buildDeployPlan(e, ALLOW);
				if (!isBlockedPlan(plan)) {
					expect(plan.preview).toEqual(appPreview(e));
				}
			}),
		);
	});

	// (13) Le plan déploie l'ÉMISSION : view = emitView (les trois projections, le contrat partagé).
	it("le plan déploie l'émission : view = emitView (DDL · Go · TS)", () => {
		const plan = buildDeployPlan(ENTITY_ORDER, ALLOW);
		expect(isBlockedPlan(plan)).toBe(false);
		if (!isBlockedPlan(plan)) {
			const v = emitView(ENTITY_ORDER);
			expect(isBlockedView(v)).toBe(false);
			if (!isBlockedView(v)) {
				expect(plan.view.targets.map((t) => t.target)).toEqual(
					v.targets.map((t) => t.target),
				);
				expect(plan.view.contract).toEqual(v.contract);
				expect(plan.sourceHash).toBe(v.sourceHash);
			}
		}
	});

	// (14) Le registre ENTITY_CASES est CLOS et chaque cas (garde OK) produit un plan content-adressé.
	it("registre clos : chaque cas → un planId d-… reproductible", () => {
		for (const c of ENTITY_CASES) {
			const plan = buildDeployPlan(c.entity, ALLOW);
			expect(isBlockedPlan(plan)).toBe(false);
			if (!isBlockedPlan(plan)) {
				expect(plan.planId).toMatch(/^d-[0-9a-f]{8}$/);
				const again = reDeployStable(c.entity, ALLOW, 8);
				expect(again.stable).toBe(true);
				expect(again.planId).toBe(plan.planId);
			}
		}
	});

	// (15) AST malformé (type hors jeu) → un BlockReason (jamais une URL devinée).
	it("AST malformé (type inconnu) → BlockReason (aucun plan, aucune URL)", () => {
		const bad = {
			name: "Bad",
			attributes: [
				{
					name: "id",
					type: "uuid" as ScalarType,
					required: true,
					identifier: true,
				},
			],
		} as Entity;
		const plan = buildDeployPlan(bad, ALLOW);
		expect(isBlockedPlan(plan)).toBe(true);
	});

	// (16) Order amputé du discount → un appHash/planId DISTINCT (la source suit la source à la lettre).
	it("Order amputé du discount → appHash + planId distincts d'Order complet", () => {
		const full = buildDeployPlan(ENTITY_ORDER, ALLOW);
		const cut = buildDeployPlan(ENTITY_ORDER_CHANGED, ALLOW);
		expect(isBlockedPlan(full)).toBe(false);
		expect(isBlockedPlan(cut)).toBe(false);
		if (!isBlockedPlan(full) && !isBlockedPlan(cut)) {
			expect(full.appHash).not.toBe(cut.appHash);
			expect(full.planId).not.toBe(cut.planId);
		}
	});
});
