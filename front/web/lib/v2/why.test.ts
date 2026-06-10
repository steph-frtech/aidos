/**
 * WB2-19 — le MIROIR DE REPRODUCTIBILITÉ du twin du WhyTree (Vitest + fast-check).
 *
 * Critère de done WB2-19 : « twin — remontée pure + property (déterministe) ; un WhyTree sans miroir
 * terminal refusé ; e2e — un symptôme → arbre ». Ce miroir épingle le twin :
 *   - `whyTree(symptom, edges, opts)` est DÉTERMINISTE : deux appels → arbre byte-identique (ids "w…",
 *     ordre, statut) ;
 *   - la REMONTÉE de l'arbre == la chaîne `trace` (FK12) : l'ensemble des causes de l'arbre est
 *     exactement l'ensemble atteignable vers le haut (aucune cause inventée, aucune oubliée) ;
 *   - un CYCLE atteignable depuis le symptôme ⇒ refus ERR_CYCLE (jamais un arbre partiel) ;
 *   - un WhyTree SANS miroir terminal ⇒ refus WHYTREE_NO_MIRROR (la terminaison obligatoire) ;
 *   - une cause HORS-graphe REJETÉE est ÉLAGUÉE (jamais retenue — anti-confabulation §8) ; une cause
 *     REPRODUITE est GREFFÉE sous son parent ;
 *   - `arboristWhyTree` projette la même structure, content-adressée ; `whyTally` est cohérent ;
 *   - le registre `WHY_CASES` est CLOS et chaque cas se comporte comme attendu (arbre | refus).
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : aucune horloge, aucun aléa, aucun LLM — tout est pur. Le seul
 * morceau LLM (le « pourquoi » hors-graphe) n'entre QUE déjà vérifié, et le code juge la STRUCTURE.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	arboristWhyTree,
	caseWhyTree,
	type Edge,
	ERR_CYCLE,
	type Ref,
	WHY_CASES,
	WHYTREE_NO_MIRROR,
	type WhyNode,
	whyCaseById,
	whyCaseIds,
	whyTally,
	whyTree,
} from "./why";

const NODES = ["n0", "n1", "n2", "n3", "n4"] as const;
const refArb: fc.Arbitrary<Ref> = fc.record({
	id: fc.constantFrom(...NODES),
	version: fc.constant("v1"),
});
const edgeArb: fc.Arbitrary<Edge> = fc.record({ from: refArb, to: refArb });
const edgesArb: fc.Arbitrary<Edge[]> = fc.array(edgeArb, { maxLength: 8 });
const symptomArb = fc.constantFrom(...NODES);

const TERMINAL = { mirrorId: "m-terminal", covers: "root" } as const;

/** Collect every cause id present in the WhyTree (excluding the symptom root). */
function causeIds(root: WhyNode): Set<string> {
	const out = new Set<string>();
	const walk = (n: WhyNode, isRoot: boolean): void => {
		if (!isRoot) out.add(n.cause);
		for (const c of n.children) walk(c, false);
	};
	walk(root, true);
	return out;
}

describe("WB2-19 — whyTree : déterminisme + remontée == trace", () => {
	it("est DÉTERMINISTE : (symptom, edges, opts) → arbre byte-identique", () => {
		fc.assert(
			fc.property(symptomArb, edgesArb, (symptom, edges) => {
				const a = whyTree(symptom, edges, { terminal: TERMINAL });
				const b = whyTree(symptom, edges, { terminal: TERMINAL });
				expect(JSON.stringify(a)).toBe(JSON.stringify(b));
			}),
		);
	});

	it("la REMONTÉE de l'arbre == la chaîne trace (acyclique) — aucune cause inventée ni oubliée", () => {
		fc.assert(
			fc.property(symptomArb, edgesArb, (symptom, edges) => {
				const r = whyTree(symptom, edges, { terminal: TERMINAL });
				if (!r.ok) return; // cycle → l'autre property couvre le refus
				const fromTree = causeIds(r.root);
				const fromChain = new Set(r.chain.causes);
				expect(fromTree).toEqual(fromChain);
			}),
		);
	});

	it("l'arbre ne contient JAMAIS le symptôme comme cause", () => {
		fc.assert(
			fc.property(symptomArb, edgesArb, (symptom, edges) => {
				const r = whyTree(symptom, edges, { terminal: TERMINAL });
				if (!r.ok) return;
				expect(causeIds(r.root).has(symptom)).toBe(false);
			}),
		);
	});

	it("les profondeurs croissent (parent.depth + 1 == enfant.depth)", () => {
		fc.assert(
			fc.property(symptomArb, edgesArb, (symptom, edges) => {
				const r = whyTree(symptom, edges, { terminal: TERMINAL });
				if (!r.ok) return;
				const walk = (n: WhyNode): void => {
					for (const c of n.children) {
						expect(c.depth).toBe(n.depth + 1);
						walk(c);
					}
				};
				walk(r.root);
			}),
		);
	});
});

describe("WB2-19 — refus de cycle (jamais un arbre partiel)", () => {
	it("un cycle atteignable depuis le symptôme ⇒ ERR_CYCLE", () => {
		const ref = (id: string): Ref => ({ id, version: "v1" });
		const r = whyTree(
			"a",
			[
				{ from: ref("a"), to: ref("b") },
				{ from: ref("b"), to: ref("a") },
			],
			{ terminal: TERMINAL },
		);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toBe(ERR_CYCLE);
	});
});

describe("WB2-19 — terminaison OBLIGATOIRE en miroir", () => {
	it("un WhyTree SANS miroir terminal ⇒ WHYTREE_NO_MIRROR", () => {
		const ref = (id: string): Ref => ({ id, version: "v1" });
		const r = whyTree("a", [{ from: ref("a"), to: ref("b") }], {});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toBe(WHYTREE_NO_MIRROR);
	});

	it("un miroir terminal à mirrorId vide ⇒ WHYTREE_NO_MIRROR", () => {
		const ref = (id: string): Ref => ({ id, version: "v1" });
		const r = whyTree("a", [{ from: ref("a"), to: ref("b") }], {
			terminal: { mirrorId: "  ", covers: "b" },
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toBe(WHYTREE_NO_MIRROR);
	});

	it("avec un miroir terminal valide ⇒ l'arbre est construit + terminal porté", () => {
		const ref = (id: string): Ref => ({ id, version: "v1" });
		const r = whyTree("a", [{ from: ref("a"), to: ref("b") }], {
			terminal: TERMINAL,
		});
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.terminal.mirrorId).toBe("m-terminal");
	});
});

describe("WB2-19 — causes hors-graphe : reproduite gardée, rejetée élaguée (anti-confabulation §8)", () => {
	const ref = (id: string): Ref => ({ id, version: "v1" });
	const base: Edge[] = [{ from: ref("sym"), to: ref("cause1") }];

	it("une cause hors-graphe REPRODUITE est greffée sous son parent", () => {
		const r = whyTree("sym", base, {
			terminal: TERMINAL,
			offGraph: [
				{
					id: "off-ok",
					why: "reproduit",
					verdict: "reproduced",
					under: "cause1",
				},
			],
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(causeIds(r.root).has("off-ok")).toBe(true);
			expect(r.pruned).toEqual([]);
		}
	});

	it("une cause hors-graphe REJETÉE est élaguée (jamais retenue) + listée dans pruned", () => {
		const r = whyTree("sym", base, {
			terminal: TERMINAL,
			offGraph: [
				{
					id: "off-bad",
					why: "non reproduit",
					verdict: "rejected",
					under: "cause1",
				},
			],
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(causeIds(r.root).has("off-bad")).toBe(false);
			expect(r.pruned).toEqual(["off-bad"]);
		}
	});

	it("une cause reproduite porte le verdict 'reproduced' et son why", () => {
		const r = whyTree("sym", base, {
			terminal: TERMINAL,
			offGraph: [
				{
					id: "off-ok",
					why: "le pool était saturé",
					verdict: "reproduced",
					under: "cause1",
				},
			],
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			const find = (n: WhyNode): WhyNode | undefined => {
				if (n.cause === "off-ok") return n;
				for (const c of n.children) {
					const f = find(c);
					if (f) return f;
				}
				return undefined;
			};
			const node = find(r.root);
			expect(node?.verdict).toBe("reproduced");
			expect(node?.why).toBe("le pool était saturé");
		}
	});
});

describe("WB2-19 — arboristWhyTree + whyTally (cohérence)", () => {
	it("arboristWhyTree projette la même structure (mêmes ids, content-adressés)", () => {
		const chain = whyCaseById("chain");
		if (chain === undefined) throw new Error("cas 'chain' introuvable");
		const r = caseWhyTree(chain);
		expect(r.ok).toBe(true);
		if (r.ok) {
			const forest = arboristWhyTree(r.root);
			expect(forest).toHaveLength(1);
			expect(forest[0].id).toBe("w0");
			expect(forest[0].cause).toBe("checkout-accept");
		}
	});

	it("whyTally compte nœuds/feuilles/hors-graphe de façon cohérente", () => {
		const offGraph = whyCaseById("off-graph");
		if (offGraph === undefined) throw new Error("cas 'off-graph' introuvable");
		const r = caseWhyTree(offGraph);
		expect(r.ok).toBe(true);
		if (r.ok) {
			const t = whyTally(r.root);
			expect(t.nodes).toBeGreaterThan(0);
			expect(t.offGraph).toBe(1); // pgx-pool-exhausted reproduite (moon-phase élaguée)
			expect(t.maxDepth).toBeGreaterThanOrEqual(1);
		}
	});
});

describe("WB2-19 — le registre clos WHY_CASES", () => {
	it("les ids sont uniques et résolubles", () => {
		const ids = whyCaseIds();
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(whyCaseById(id)).toBeDefined();
	});

	it("chaque cas se comporte comme son expectRefusal le dit", () => {
		for (const c of WHY_CASES) {
			const r = caseWhyTree(c);
			if (c.expectRefusal === undefined) {
				expect(r.ok).toBe(true);
			} else {
				expect(r.ok).toBe(false);
				if (!r.ok) expect(r.error).toBe(c.expectRefusal);
			}
		}
	});

	it("le cas off-graph garde la cause reproduite et élague la rejetée", () => {
		const offGraph = whyCaseById("off-graph");
		if (offGraph === undefined) throw new Error("cas 'off-graph' introuvable");
		const r = caseWhyTree(offGraph);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(causeIds(r.root).has("pgx-pool-exhausted")).toBe(true);
			expect(r.pruned).toEqual(["moon-phase"]);
		}
	});
});
