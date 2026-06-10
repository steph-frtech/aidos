/**
 * WB2-04 — le MIROIR DE REPRODUCTIBILITÉ du twin de l'arbre de composition (lib/v2/kernel-tree).
 * mirror record: reflects=WB2-04-kernel-tree, test_kind=property, cert_language=vitest+fast-check,
 * liveness=live, authority=above (projection de lecture, le mur intact).
 *
 * Le twin est PUR & DÉTERMINISTE : ces propriétés (fast-check) épinglent les critères de done :
 *   - AUCUN nœud orphelin (la validation refuse un parentId qui ne résout pas) ;
 *   - le COMPTE est préservé (flatten(buildKernelTree(nodes)).length === nodes.length) ;
 *   - l'ordre est DÉTERMINISTE (même entrée → même arbre, même sérialisation) ;
 *   - la PROFONDEUR est correcte (racine = 0, enfant = parent + 1) ;
 *   - les fratries sont ORDONNÉES (verticale §23 puis id) ;
 *   - la détection de cycle et d'id dupliqué (l'arbre ne se compose pas) ;
 *   - 200+ nœuds (la virtualisation) se composent sans orphelin.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SOURCE_ORDER } from "../besoin-grammar";
import {
	buildKernelTree,
	countNodes,
	flattenTree,
	type KernelNode,
	syntheticComposes,
	type TreeNode,
	validateComposes,
} from "./kernel-tree";

const FACETS = ["F", "I", "S", "B", "R", "V", "M", "X"];

/** Un générateur d'ARBRES VALIDES : un produit racine, puis des enfants attachés à un parent
 *  déjà émis (jamais d'orphelin, jamais de cycle, ids uniques). */
function validForest(): fc.Arbitrary<KernelNode[]> {
	return fc
		.array(
			fc.record({
				level: fc.constantFrom(...SOURCE_ORDER),
				facet: fc.constantFrom(...FACETS),
			}),
			{ minLength: 1, maxLength: 40 },
		)
		.map((rows) => {
			const nodes: KernelNode[] = [];
			rows.forEach((r, i) => {
				// Le nœud i s'attache à un nœud d'index < i (déterministe : i-1) ou est racine (i==0).
				const parentId = i === 0 ? null : `k${i - 1}`;
				nodes.push({
					id: `k${i}`,
					level: r.level,
					facet: r.facet,
					label: `${r.level} ${i}`,
					parentId,
				});
			});
			return nodes;
		});
}

function serialize(roots: TreeNode[]): string {
	return JSON.stringify(
		flattenTree(roots).map((n) => [n.id, n.depth, n.level, n.facet]),
	);
}

describe("WB2-04 buildKernelTree — la projection pure de l'arbre fractal de composition", () => {
	it("aucun nœud orphelin : un parentId qui ne résout pas est REFUSÉ (le critère de done)", () => {
		const orphan: KernelNode[] = [
			{
				id: "a",
				level: "product",
				facet: "F",
				label: "racine",
				parentId: null,
			},
			{
				id: "b",
				level: "view",
				facet: "F",
				label: "orphelin",
				parentId: "ghost",
			},
		];
		const res = buildKernelTree(orphan);
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.errors).toContain("orphan_node");
	});

	it("PROPERTY — un arbre valide se compose toujours (ok), le compte est préservé", () => {
		fc.assert(
			fc.property(validForest(), (nodes) => {
				const res = buildKernelTree(nodes);
				expect(res.ok).toBe(true);
				if (res.ok) {
					expect(countNodes(res.roots)).toBe(nodes.length);
				}
			}),
		);
	});

	it("PROPERTY — déterminisme : même entrée → même arbre (même sérialisation)", () => {
		fc.assert(
			fc.property(validForest(), (nodes) => {
				const a = buildKernelTree(nodes);
				const b = buildKernelTree(nodes);
				expect(a.ok && b.ok).toBe(true);
				if (a.ok && b.ok) {
					expect(serialize(a.roots)).toBe(serialize(b.roots));
				}
			}),
		);
	});

	it("PROPERTY — la profondeur est correcte : racine = 0, enfant = parent + 1", () => {
		fc.assert(
			fc.property(validForest(), (nodes) => {
				const res = buildKernelTree(nodes);
				if (!res.ok) return;
				const check = (n: TreeNode, expected: number) => {
					expect(n.depth).toBe(expected);
					for (const c of n.children) check(c, expected + 1);
				};
				for (const r of res.roots) check(r, 0);
			}),
		);
	});

	it("PROPERTY — chaque fratrie est ordonnée (verticale §23 puis id)", () => {
		fc.assert(
			fc.property(validForest(), (nodes) => {
				const res = buildKernelTree(nodes);
				if (!res.ok) return;
				const rank = (l: string) => {
					const i = SOURCE_ORDER.indexOf(l as never);
					return i < 0 ? SOURCE_ORDER.length : i;
				};
				const checkSiblings = (kids: TreeNode[]) => {
					for (let i = 1; i < kids.length; i++) {
						const a = kids[i - 1];
						const b = kids[i];
						const ok =
							rank(a.level) < rank(b.level) ||
							(rank(a.level) === rank(b.level) && a.id <= b.id);
						expect(ok).toBe(true);
					}
					for (const k of kids) checkSiblings(k.children);
				};
				checkSiblings(res.roots);
			}),
		);
	});

	it("un id dupliqué est refusé (l'identité content-adressée est cassée)", () => {
		const dup: KernelNode[] = [
			{ id: "x", level: "product", facet: "F", label: "un", parentId: null },
			{ id: "x", level: "view", facet: "F", label: "deux", parentId: null },
		];
		const res = buildKernelTree(dup);
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.errors).toContain("duplicate_id");
	});

	it("un cycle dans composes est refusé (l'arbre ne se compose pas)", () => {
		const cyclic: KernelNode[] = [
			{ id: "a", level: "product", facet: "F", label: "a", parentId: "b" },
			{ id: "b", level: "view", facet: "F", label: "b", parentId: "a" },
		];
		const errs = validateComposes(cyclic);
		expect(errs).toContain("cycle");
	});

	it("une coordonnée hors jeu clos (niveau/facette) est refusée", () => {
		const bad: KernelNode[] = [
			{
				id: "a",
				level: "saga" as never,
				facet: "Z",
				label: "hors",
				parentId: null,
			},
		];
		const errs = validateComposes(bad);
		expect(errs).toContain("level_unknown");
		expect(errs).toContain("facet_unknown");
	});

	it("un id vide est refusé (un kernel doit avoir une identité)", () => {
		const empty: KernelNode[] = [
			{ id: "", level: "product", facet: "F", label: "vide", parentId: null },
		];
		const errs = validateComposes(empty);
		expect(errs).toContain("empty_id");
	});

	it("200+ nœuds (la virtualisation) : la relation synthétique se compose sans orphelin", () => {
		const nodes = syntheticComposes(240);
		expect(validateComposes(nodes)).toEqual([]);
		const res = buildKernelTree(nodes);
		expect(res.ok).toBe(true);
		if (res.ok) expect(countNodes(res.roots)).toBe(240);
	});

	it("syntheticComposes est déterministe (même N → même relation)", () => {
		expect(syntheticComposes(50)).toEqual(syntheticComposes(50));
	});
});
