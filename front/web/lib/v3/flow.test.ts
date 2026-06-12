import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { growComposes, nodeByPath, seedComposes } from "../v2/composition";
import { composesToFlow } from "./flow";

/**
 * V3 — le MIROIR de la PROJECTION GRAPHE des parcours (ADR 0060) : l'écran
 * « Parcours produit » affiche les scénarios en GRAPHES (React Flow, ADR 0053).
 * La DONNÉE du graphe est une PROJECTION PURE de l'arbre composes — la lib ne
 * fait que rendre (déterminisme-first : positions calculées, jamais d'aléa).
 */

const grownArb = fc
	.array(
		fc.record({
			label: fc.stringMatching(/^[a-z]{2,10}$/),
			parentPick: fc.nat(),
		}),
		{ maxLength: 12 },
	)
	.map((growth) => {
		let nodes = seedComposes();
		for (const g of growth) {
			const parent = nodes[g.parentPick % nodes.length];
			nodes = growComposes(nodes, parent.id, g.label);
		}
		return nodes;
	});

describe("composesToFlow — l'arbre composes devient un graphe rendu (projection pure)", () => {
	it("∀ arbre : BIJECTION — un nœud de flow par nœud d'arbre, une arête par lien composes", () => {
		fc.assert(
			fc.property(grownArb, (tree) => {
				const f = composesToFlow(tree, null);
				expect(f.nodes).toHaveLength(tree.length);
				expect(f.edges).toHaveLength(
					tree.filter((n) => n.parentId !== null).length,
				);
				for (const e of f.edges) {
					expect(f.nodes.some((n) => n.id === e.source)).toBe(true);
					expect(f.nodes.some((n) => n.id === e.target)).toBe(true);
				}
			}),
		);
	});

	it("∀ arbre : DÉTERMINISTE — mêmes positions, même ordre (le rendu est rejouable)", () => {
		fc.assert(
			fc.property(grownArb, (tree) => {
				expect(composesToFlow(tree, null)).toEqual(composesToFlow(tree, null));
			}),
		);
	});

	it("∀ arbre : les positions sont FINIES et DISTINCTES (aucun nœud empilé sur un autre)", () => {
		fc.assert(
			fc.property(grownArb, (tree) => {
				const f = composesToFlow(tree, null);
				const seen = new Set<string>();
				for (const n of f.nodes) {
					expect(Number.isFinite(n.x)).toBe(true);
					expect(Number.isFinite(n.y)).toBe(true);
					const key = `${n.x}:${n.y}`;
					expect(seen.has(key)).toBe(false);
					seen.add(key);
				}
			}),
		);
	});

	it("le FOCUS sur un parcours ne projette QUE son sous-arbre (la racine du focus incluse)", () => {
		const tree = seedComposes();
		const paiement = nodeByPath(tree, "app/paiement");
		if (paiement === null) throw new Error("seed inattendu");
		const f = composesToFlow(tree, "app/paiement");
		// app/paiement + checkout + débit = 3 nœuds ; catalogue et la racine exclus.
		expect(f.nodes).toHaveLength(3);
		expect(f.nodes.some((n) => n.id === paiement.id)).toBe(true);
		expect(f.nodes.every((n) => n.label !== "catalogue")).toBe(true);
	});

	it("un focus INCONNU est TOTAL : graphe vide (fail-closed, jamais une invention)", () => {
		expect(composesToFlow(seedComposes(), "nulle/part").nodes).toHaveLength(0);
	});

	it("la profondeur gouverne X, la fratrie gouverne Y (lisible de gauche à droite)", () => {
		const f = composesToFlow(seedComposes(), null);
		const byLabel = new Map(f.nodes.map((n) => [n.label, n]));
		const root = byLabel.get("app");
		const cell = byLabel.get("paiement");
		const leaf = byLabel.get("débit du compte");
		if (!root || !cell || !leaf) throw new Error("seed inattendu");
		expect(root.x).toBeLessThan(cell.x);
		expect(cell.x).toBeLessThan(leaf.x);
	});
});
