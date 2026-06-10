/**
 * WB2-13 — le MIROIR DE REPRODUCTIBILITÉ du twin du PIPELINE FKE-3 (Vitest + fast-check).
 *
 * Critère de done WB2-13 : « twin (graphe pur depuis la fixture) + property ». Ce miroir l'épingle :
 *   - `workflowGraph(fixture)` est DÉTERMINISTE : deux appels → graphe byte-identique (ids, kinds, positions) ;
 *   - le pipeline est BIEN FORMÉ : exactement un `start`, ≥ 1 `end`, le `authorize` devient un `gate` SUIVI
 *     d'une `decision` qui branche allow/deny ; chaque verbe non-gate devient un `step` ;
 *   - le DENY court-circuit §93 est dessiné : une branche `deny` mène toujours à un `end{denied}` ;
 *   - `moveNode` est PURE & IMMUABLE : le graphe d'origine reste INTACT, seul le nœud visé bouge, un id
 *     inconnu laisse le graphe inchangé (totalité) — déplacer ne PROPOSE qu'un layout, n'écrit aucune vérité ;
 *   - le routage slug↔id est une bijection (mêmes règles que WB2-12 : pas de « / » dans le slug).
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : aucune horloge, aucun aléa, aucun LLM — tout est pur.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	moveNode,
	nodeKindCounts,
	WORKFLOW_DENIED,
	WORKFLOW_HAPPY,
	WORKFLOWS,
	workflowBySlug,
	workflowGraph,
	workflowSlug,
	workflowSlugs,
} from "./workflows";

const ALL = Object.values(WORKFLOWS);

describe("WB2-13 workflowGraph — pipeline pur & déterministe", () => {
	it("deux appels donnent le MÊME graphe (déterminisme : mêmes ids, kinds, positions)", () => {
		for (const f of ALL) {
			expect(workflowGraph(f)).toEqual(workflowGraph(f));
		}
	});

	it("le graphe porte exactement un `start` et au moins un `end`", () => {
		for (const f of ALL) {
			const c = nodeKindCounts(workflowGraph(f));
			expect(c.start).toBe(1);
			expect(c.end).toBeGreaterThanOrEqual(1);
		}
	});

	it("le `authorize` devient un GATE suivi d'une DÉCISION qui branche allow/deny", () => {
		const g = workflowGraph(WORKFLOW_HAPPY);
		const c = nodeKindCounts(g);
		// createOrder a un seul authorize → un gate + une décision.
		expect(c.gate).toBe(1);
		expect(c.decision).toBe(1);
		// la décision a une sortie « allow » ET une sortie « deny ».
		const dec = g.nodes.find((n) => n.kind === "decision");
		expect(dec).toBeDefined();
		const out = g.edges.filter((e) => e.source === dec?.id);
		const branches = out
			.map((e) => e.branch)
			.filter(Boolean)
			.sort();
		expect(branches).toEqual(["allow", "deny"]);
	});

	it("la branche `deny` mène TOUJOURS à un end{denied} (court-circuit §93)", () => {
		for (const f of ALL) {
			const g = workflowGraph(f);
			const denyEdge = g.edges.find((e) => e.branch === "deny");
			expect(denyEdge).toBeDefined();
			const target = g.nodes.find((n) => n.id === denyEdge?.target);
			expect(target?.kind).toBe("end");
			expect(target?.outcome).toBe("denied");
		}
	});

	it("chaque arête référence des nœuds EXISTANTS (graphe cohérent, totalité)", () => {
		for (const f of ALL) {
			const g = workflowGraph(f);
			const ids = new Set(g.nodes.map((n) => n.id));
			for (const e of g.edges) {
				expect(ids.has(e.source)).toBe(true);
				expect(ids.has(e.target)).toBe(true);
			}
		}
	});

	it("les ids de nœuds sont UNIQUES et content-adressés (w0, w1, …)", () => {
		for (const f of ALL) {
			const g = workflowGraph(f);
			const ids = g.nodes.map((n) => n.id);
			expect(new Set(ids).size).toBe(ids.length);
			for (const id of ids) expect(id).toMatch(/^w\d+$/);
		}
	});

	it("le scénario heureux porte les étapes (validate/read/mutate/return) + le succès", () => {
		const g = workflowGraph(WORKFLOW_HAPPY);
		const c = nodeKindCounts(g);
		// createOrder/happy : validate, read, 2× mutate, return = 5 steps.
		expect(c.step).toBe(5);
		// un end{success} existe.
		expect(
			g.nodes.some((n) => n.kind === "end" && n.outcome === "success"),
		).toBe(true);
	});
});

describe("WB2-13 moveNode — édition PROPOSÉE pure & immuable (le mur intact)", () => {
	it("déplacer un nœud renvoie un NOUVEAU graphe, l'original INTACT", () => {
		const g = workflowGraph(WORKFLOW_HAPPY);
		const before = structuredClone(g);
		const moved = moveNode(g, "w0", { x: 999, y: 888 });
		// l'original n'a pas bougé (immuabilité — aucune écriture).
		expect(g).toEqual(before);
		// le nouveau graphe porte la nouvelle position du seul nœud visé.
		expect(moved.nodes.find((n) => n.id === "w0")?.position).toEqual({
			x: 999,
			y: 888,
		});
		// les autres nœuds inchangés.
		for (const n of g.nodes) {
			if (n.id !== "w0") {
				expect(moved.nodes.find((m) => m.id === n.id)?.position).toEqual(
					n.position,
				);
			}
		}
	});

	it("un id inconnu laisse le graphe inchangé (totalité, pas d'écriture muette)", () => {
		const g = workflowGraph(WORKFLOW_DENIED);
		const moved = moveNode(g, "w-does-not-exist", { x: 1, y: 1 });
		expect(moved.nodes).toEqual(g.nodes);
	});

	it("PROPERTY — déplacer un nœud existant ne change QUE sa position (le reste byte-identique)", () => {
		const g = workflowGraph(WORKFLOW_HAPPY);
		const ids = g.nodes.map((n) => n.id);
		fc.assert(
			fc.property(
				fc.constantFrom(...ids),
				fc.integer({ min: -500, max: 500 }),
				fc.integer({ min: -500, max: 500 }),
				(id, x, y) => {
					const moved = moveNode(g, id, { x, y });
					expect(moved.edges).toEqual(g.edges);
					expect(moved.fixtureId).toBe(g.fixtureId);
					for (const n of moved.nodes) {
						const orig = g.nodes.find((o) => o.id === n.id);
						if (n.id === id) {
							expect(n.position).toEqual({ x, y });
							expect(n.kind).toBe(orig?.kind);
							expect(n.label).toBe(orig?.label);
						} else {
							expect(n).toEqual(orig);
						}
					}
				},
			),
		);
	});
});

describe("WB2-13 routage slug↔id — bijection totale (mêmes règles que WB2-12)", () => {
	it("workflowBySlug ∘ workflowSlug = identité pour chaque scénario", () => {
		for (const id of Object.keys(WORKFLOWS)) {
			const slug = workflowSlug(id);
			expect(slug).not.toContain("/");
			expect(workflowBySlug(slug)?.id).toBe(id);
		}
	});

	it("un slug inconnu → undefined (totalité → 404 côté écran)", () => {
		expect(workflowBySlug("nope--nope")).toBeUndefined();
	});

	it("workflowSlugs liste tous les scénarios", () => {
		expect(workflowSlugs().sort()).toEqual(
			Object.keys(WORKFLOWS).map(workflowSlug).sort(),
		);
	});
});
