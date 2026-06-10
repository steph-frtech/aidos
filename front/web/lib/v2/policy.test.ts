/**
 * WB2-14 — le MIROIR DE REPRODUCTIBILITÉ du twin de la POLICY DSL (Vitest + fast-check).
 *
 * Critère de done WB2-14 : « twin — l'évaluateur de policy est pur + property (DENY domine) ;
 * e2e — l'arbre se déplie, un cas évalue ». Ce miroir épingle le twin :
 *   - `evalTree(rule, ctx)` est DÉTERMINISTE : deux appels → arbre tracé byte-identique (ids, verdicts) ;
 *   - la TRACE est COHÉRENTE avec l'évaluateur de vérité S09 : le `held` de la racine == `holds(rule, ctx)` ;
 *   - les ids sont content-adressés par la position ("p0", "p0.0", …) → uniques, stables, déterministes ;
 *   - la LOI §93 « DENY DOMINE » (property fast-check) : pour un effet DENY, dès que la règle tient
 *     la décision est DENY — et dans une combinaison, n'importe quel DENY l'emporte (any de DENY → DENY,
 *     all de ALLOW → ALLOW) ; un not est une involution (not(not(r)) ≡ r) ;
 *   - `arboristTree` projette la même structure avec/sans contexte, content-adressée ;
 *   - l'ensemble des scopes/règles est CLOS (mêmes que S09 / le Go) ; la bijection slug↔nom.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : aucune horloge, aucun aléa, aucun LLM — tout est pur.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	arboristTree,
	CAN_PLACE_ORDER,
	type CtxData,
	DENY_SECRET_FIELD,
	decisionFor,
	evalTree,
	evaluate,
	holds,
	nodeCounts,
	POLICIES,
	policyBySlug,
	policySlug,
	policySlugs,
	RULE_KINDS,
	type Rule,
	SCOPES,
	samplesFor,
} from "./policy";

const ALL = Object.values(POLICIES);

describe("WB2-14 evalTree — évaluation tracée pure & déterministe", () => {
	it("deux appels donnent le MÊME arbre tracé (déterminisme : ids, kinds, verdicts)", () => {
		const samples = samplesFor("canPlaceOrder");
		for (const s of samples) {
			expect(evalTree(CAN_PLACE_ORDER.rule, s.ctx)).toEqual(
				evalTree(CAN_PLACE_ORDER.rule, s.ctx),
			);
		}
	});

	it("la racine tracée porte le MÊME verdict que holds(rule, ctx) (cohérence S09)", () => {
		for (const p of ALL) {
			for (const s of samplesFor(p.name)) {
				const t = evalTree(p.rule, s.ctx);
				expect(t.held).toBe(holds(p.rule, s.ctx));
			}
		}
	});

	it("les ids sont content-adressés par la position : uniques, racine 'p0', enfants 'p0.i'", () => {
		const t = evalTree(CAN_PLACE_ORDER.rule, {
			auth: { user: { id: "u1" } },
			cart: { userId: "u1", items: [{ id: 1 }] },
		});
		expect(t.id).toBe("p0");
		const ids: string[] = [];
		const collect = (n: typeof t): void => {
			ids.push(n.id);
			for (const c of n.children) collect(c);
		};
		collect(t);
		// uniques
		expect(new Set(ids).size).toBe(ids.length);
		// les enfants de la racine `all` sont p0.0, p0.1, p0.2 (3 conditions §93).
		expect(t.children.map((c) => c.id)).toEqual(["p0.0", "p0.1", "p0.2"]);
	});

	it("chaque nœud tracé porte le held de SON sous-arbre (cohérence récursive avec holds)", () => {
		const ctx: CtxData = {
			auth: { user: { id: "u1" } },
			cart: { userId: "uX", items: [{ id: 1 }] }, // userId ne matche pas → la 2e condition échoue
		};
		const t = evalTree(CAN_PLACE_ORDER.rule, ctx);
		// all → false (une condition échoue)
		expect(t.held).toBe(false);
		// exists($.auth.user) tient ; eq(userId, user.id) échoue ; gt(items.length, 0) tient.
		expect(t.children.map((c) => c.held)).toEqual([true, false, true]);
	});
});

describe("WB2-14 la loi §93 — tout ALLOW passe, n'importe quel DENY bloque", () => {
	it("canPlaceOrder (ALLOW) : ALLOW ssi la règle tient, sinon DENY", () => {
		for (const s of samplesFor("canPlaceOrder")) {
			const dec = evaluate(CAN_PLACE_ORDER, s.ctx);
			expect(dec).toBe(holds(CAN_PLACE_ORDER.rule, s.ctx) ? "ALLOW" : "DENY");
		}
	});

	it("denySecretField (DENY) : DENY ssi la règle tient, sinon ALLOW (DENY domine)", () => {
		for (const s of samplesFor("denySecretField")) {
			const dec = evaluate(DENY_SECRET_FIELD, s.ctx);
			expect(dec).toBe(holds(DENY_SECRET_FIELD.rule, s.ctx) ? "DENY" : "ALLOW");
		}
		// le cas « secret » bloque, le cas ordinaire passe.
		expect(
			decisionFor("denySecretField", { field: "secretNote", role: "user" }),
		).toBe("DENY");
		expect(
			decisionFor("denySecretField", { field: "label", role: "user" }),
		).toBe("ALLOW");
	});

	// property : pour un effet DENY, la décision est DENY EXACTEMENT quand la règle tient — la
	// domination du DENY (dès que la règle « interdite » fire, ça bloque).
	it("property — DENY DOMINE : effet DENY ⇒ (décision == DENY ⇔ règle tient)", () => {
		fc.assert(
			fc.property(fc.boolean(), fc.string(), (roleIsGuest, fieldName) => {
				const ctx: CtxData = {
					field: fieldName,
					role: roleIsGuest ? "guest" : "user",
				};
				const dec = evaluate(DENY_SECRET_FIELD, ctx);
				const held = holds(DENY_SECRET_FIELD.rule, ctx);
				return dec === (held ? "DENY" : "ALLOW");
			}),
		);
	});

	// property : n'importe quel DENY l'emporte — un `all` ALLOW reste ALLOW ; un `any` qui contient
	// une règle qui fire dans une policy DENY → DENY. On le prouve via la structure de l'arbre tracé :
	// pour un `all`, held == (tous les enfants held) ; pour un `any`, held == (au moins un enfant held).
	it("property — combinateurs : all == ∧ des enfants, any == ∨ des enfants (sur l'arbre tracé)", () => {
		const leafGen = (): fc.Arbitrary<Rule> =>
			fc.boolean().map(
				(b): Rule => ({
					kind: "eq",
					left: { kind: "lit", value: b ? 1 : 0 },
					right: { kind: "lit", value: 1 },
				}),
			);
		fc.assert(
			fc.property(
				fc.array(leafGen(), { minLength: 1, maxLength: 6 }),
				(leaves) => {
					const allRule: Rule = { kind: "all", children: leaves };
					const anyRule: Rule = { kind: "any", children: leaves };
					const emptyCtx: CtxData = {};
					const tAll = evalTree(allRule, emptyCtx);
					const tAny = evalTree(anyRule, emptyCtx);
					const childHeld = tAll.children.map((c) => c.held);
					return (
						tAll.held === childHeld.every(Boolean) &&
						tAny.held === childHeld.some(Boolean)
					);
				},
			),
		);
	});

	// property : `not` est une involution — not(not(r)) ≡ r (sous tout contexte).
	it("property — not est une involution : not(not(r)).held == r.held", () => {
		fc.assert(
			fc.property(fc.boolean(), (b) => {
				const leaf: Rule = {
					kind: "eq",
					left: { kind: "lit", value: b ? 1 : 0 },
					right: { kind: "lit", value: 1 },
				};
				const notNot: Rule = {
					kind: "not",
					child: { kind: "not", child: leaf },
				};
				return evalTree(notNot, {}).held === evalTree(leaf, {}).held;
			}),
		);
	});
});

describe("WB2-14 arboristTree — projection React Arborist déterministe", () => {
	it("sans contexte : la structure seule (id, name, kind, children), pas de held", () => {
		const forest = arboristTree(CAN_PLACE_ORDER.rule);
		expect(forest).toHaveLength(1);
		const root = forest[0];
		expect(root.id).toBe("p0");
		expect(root.kind).toBe("all");
		expect(root.held).toBeUndefined();
		expect(root.children).toHaveLength(3);
	});

	it("avec contexte : chaque nœud porte son held (l'arbre est évalué)", () => {
		const forest = arboristTree(CAN_PLACE_ORDER.rule, {
			auth: { user: { id: "u1" } },
			cart: { userId: "u1", items: [{ id: 1 }] },
		});
		const root = forest[0];
		expect(root.held).toBe(true);
		expect(root.children?.every((c) => c.held === true)).toBe(true);
	});

	it("déterminisme : deux projections identiques (avec et sans contexte)", () => {
		expect(arboristTree(CAN_PLACE_ORDER.rule)).toEqual(
			arboristTree(CAN_PLACE_ORDER.rule),
		);
		const ctx: CtxData = { auth: {}, cart: { userId: "u1", items: [] } };
		expect(arboristTree(CAN_PLACE_ORDER.rule, ctx)).toEqual(
			arboristTree(CAN_PLACE_ORDER.rule, ctx),
		);
	});
});

describe("WB2-14 nodeCounts — comptes purs combinateurs/feuilles", () => {
	it("canPlaceOrder : 1 combinateur (all) + 3 feuilles", () => {
		expect(nodeCounts(CAN_PLACE_ORDER.rule)).toEqual({
			combinators: 1,
			leaves: 3,
			total: 4,
		});
	});

	it("denySecretField : 1 combinateur (any) + 2 feuilles", () => {
		expect(nodeCounts(DENY_SECRET_FIELD.rule)).toEqual({
			combinators: 1,
			leaves: 2,
			total: 3,
		});
	});
});

describe("WB2-14 registre & routage — bijection slug↔nom, ensembles clos", () => {
	it("le routage slug↔nom est une bijection (slug = nom, pas de « / »)", () => {
		for (const name of Object.keys(POLICIES)) {
			const slug = policySlug(name);
			expect(slug).not.toContain("/");
			expect(policyBySlug(slug)?.name).toBe(name);
		}
	});

	it("policySlugs liste exactement les policies connues ; un slug inconnu → undefined", () => {
		expect(new Set(policySlugs())).toEqual(new Set(Object.keys(POLICIES)));
		expect(policyBySlug("nope")).toBeUndefined();
	});

	it("les scopes utilisés sont dans l'ensemble CLOS (S09 / le Go)", () => {
		for (const p of ALL) {
			expect(SCOPES).toContain(p.scope);
		}
	});

	it("les règles utilisées sont dans l'ensemble CLOS des huit kinds", () => {
		const seen = new Set<string>();
		const walk = (r: Rule): void => {
			seen.add(r.kind);
			if (r.kind === "all" || r.kind === "any")
				for (const c of r.children) walk(c);
			else if (r.kind === "not") walk(r.child);
		};
		for (const p of ALL) walk(p.rule);
		for (const k of seen)
			expect(RULE_KINDS).toContain(k as (typeof RULE_KINDS)[number]);
	});

	it("samplesFor renvoie des échantillons pour chaque policy, [] pour un inconnu", () => {
		for (const name of Object.keys(POLICIES)) {
			expect(samplesFor(name).length).toBeGreaterThan(0);
		}
		expect(samplesFor("nope")).toEqual([]);
	});
});
