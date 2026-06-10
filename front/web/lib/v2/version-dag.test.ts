/**
 * WB2-07 — le MIROIR DE REPRODUCTIBILITÉ du twin du VERSION DAG (lib/v2/version-dag) : l'espace des
 * versions est un DAG content-addressé, append-only (S24, §120-§125).
 * mirror record: reflects=WB2-07-version-dag, test_kind=property, cert_language=vitest+fast-check,
 * liveness=live, authority=above (projection de lecture, le mur intact).
 *
 * Le twin est PUR & DÉTERMINISTE : ces propriétés (fast-check) épinglent les critères de done :
 *   - HASH STABLE (content-addressing) : même corps (label+parents+strate) → même id ; l'ordre des
 *     parents n'affecte PAS l'identité (corps canonique) ;
 *   - ACYCLIQUE : pour toute séquence de mouvements, le DAG reste un DAG (validateDag sans "cycle"),
 *     isReachable irréflexif (un nœud ne s'atteint pas lui-même) ;
 *   - APPEND-ONLY (le cas-clé S24) : branch/checkout_ancestor/rebranch ne font que CROÎTRE — jamais
 *     un nœud ni une arête supprimé ; checkout_ancestor ne touche AUCUNE arête (head-flag move) ;
 *   - TOPO-TRIÉ cohérent : un parent précède TOUJOURS son enfant ; tri déterministe ;
 *   - DÉTERMINISME : même séquence → même DAG (même sérialisation) ;
 *   - le DAG canonique §120 est VALIDE, acyclique, v0 atteint v2a, la ligne abandonnée v2 présente.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	ancestors,
	branch,
	checkoutAncestor,
	type DagNode,
	heads,
	isReachable,
	rebranch,
	syntheticDag,
	topoSort,
	type VersionDag,
	validateDag,
	versionHash,
} from "./version-dag";

function serialize(dag: VersionDag): string {
	return JSON.stringify(dag);
}

/** Un mouvement appliqué au DAG, choisi déterministiquement par fast-check. */
type Move =
	| { kind: "branch"; label: string }
	| { kind: "checkout"; idx: number }
	| { kind: "rebranch"; label: string };

function moveArb(): fc.Arbitrary<Move> {
	return fc.oneof(
		fc.record({
			kind: fc.constant("branch" as const),
			label: fc.string({ minLength: 1, maxLength: 6 }),
		}),
		fc.record({
			kind: fc.constant("checkout" as const),
			idx: fc.nat({ max: 50 }),
		}),
		fc.record({
			kind: fc.constant("rebranch" as const),
			label: fc.string({ minLength: 1, maxLength: 6 }),
		}),
	);
}

/** Rejoue une séquence de mouvements sur le DAG canonique (l'index choisit un nœud cible existant). */
function play(moves: readonly Move[]): VersionDag {
	let { dag } = syntheticDag();
	let cs = 1000;
	for (const m of moves) {
		const headId = heads(dag)[0]?.id ?? dag.nodes[0]?.id ?? "";
		if (m.kind === "branch") {
			dag = branch(dag, headId, m.label, `cs-${cs++}`);
		} else if (m.kind === "rebranch") {
			dag = rebranch(dag, headId, m.label, `cs-${cs++}`);
		} else {
			const target = dag.nodes[m.idx % dag.nodes.length].id;
			dag = checkoutAncestor(dag, target);
		}
	}
	return dag;
}

describe("WB2-07 version-dag twin — DAG content-addressé, append-only (S24 §120)", () => {
	it("HASH STABLE — même corps → même id ; l'ordre des parents n'affecte pas l'identité", () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1, maxLength: 8 }),
				fc.array(fc.string({ minLength: 1, maxLength: 4 }), { maxLength: 5 }),
				(label, parents) => {
					const a = versionHash(label, parents, "above");
					const b = versionHash(label, parents, "above");
					expect(a).toBe(b); // déterministe
					expect(a.startsWith("v:")).toBe(true);
					// L'ordre des parents ne change pas l'identité (corps canonique trié).
					const shuffled = [...parents].reverse();
					expect(versionHash(label, shuffled, "above")).toBe(a);
				},
			),
		);
	});

	it("DÉTERMINISME — même séquence de mouvements → même DAG (sérialisation identique)", () => {
		fc.assert(
			fc.property(fc.array(moveArb(), { maxLength: 12 }), (moves) => {
				expect(serialize(play(moves))).toBe(serialize(play(moves)));
			}),
		);
	});

	it("ACYCLIQUE — toute séquence de mouvements laisse un DAG valide sans cycle ; isReachable irréflexif", () => {
		fc.assert(
			fc.property(fc.array(moveArb(), { maxLength: 12 }), (moves) => {
				const dag = play(moves);
				const errors = validateDag(dag);
				expect(errors).not.toContain("cycle");
				expect(errors).not.toContain("dangling_parent");
				expect(errors).not.toContain("dangling_edge");
				// Irréflexivité : aucun nœud ne s'atteint lui-même.
				for (const n of dag.nodes)
					expect(isReachable(dag, n.id, n.id)).toBe(false);
			}),
		);
	});

	it("APPEND-ONLY — branch/rebranch ne font que CROÎTRE (aucun nœud/arête supprimé)", () => {
		fc.assert(
			fc.property(fc.array(moveArb(), { maxLength: 12 }), (moves) => {
				let { dag } = syntheticDag();
				let cs = 2000;
				for (const m of moves) {
					const before = { nodes: dag.nodes.length, edges: dag.edges.length };
					const headId = heads(dag)[0]?.id ?? dag.nodes[0].id;
					if (m.kind === "branch")
						dag = branch(dag, headId, m.label, `cs-${cs++}`);
					else if (m.kind === "rebranch")
						dag = rebranch(dag, headId, m.label, `cs-${cs++}`);
					else
						dag = checkoutAncestor(dag, dag.nodes[m.idx % dag.nodes.length].id);
					// Monotone non-décroissant : append-only, jamais une suppression.
					expect(dag.nodes.length).toBeGreaterThanOrEqual(before.nodes);
					expect(dag.edges.length).toBeGreaterThanOrEqual(before.edges);
				}
			}),
		);
	});

	it("CHECKOUT_ANCESTOR — head-flag move : aucune arête touchée, tous les nœuds présents, exactement la cible en tête", () => {
		fc.assert(
			fc.property(fc.nat({ max: 50 }), (idx) => {
				const { dag } = syntheticDag();
				const target = dag.nodes[idx % dag.nodes.length].id;
				const after = checkoutAncestor(dag, target);
				// Aucune arête touchée.
				expect(serialize({ nodes: [], edges: [...after.edges] })).toBe(
					serialize({ nodes: [], edges: [...dag.edges] }),
				);
				// Tous les nœuds présents (append-only / abandoned line never destroyed).
				expect(after.nodes.length).toBe(dag.nodes.length);
				// Exactement la cible en tête.
				const hs = heads(after);
				expect(hs).toHaveLength(1);
				expect(hs[0].id).toBe(target);
			}),
		);
	});

	it("TOPO-TRIÉ — un parent précède TOUJOURS son enfant (ordre déterministe)", () => {
		fc.assert(
			fc.property(fc.array(moveArb(), { maxLength: 12 }), (moves) => {
				const dag = play(moves);
				const sorted = topoSort(dag);
				expect(sorted).toHaveLength(dag.nodes.length); // pas de cycle perdu
				const pos = new Map<string, number>();
				sorted.forEach((n: DagNode, i: number) => {
					pos.set(n.id, i);
				});
				for (const n of dag.nodes)
					for (const p of n.parentIds)
						expect(pos.get(p) ?? -1).toBeLessThan(pos.get(n.id) ?? -1);
			}),
		);
	});

	it("le DAG CANONIQUE §120 — valide, acyclique, v0 atteint v2a, la ligne abandonnée v2 présente", () => {
		const { dag, labelToId } = syntheticDag();
		expect(validateDag(dag)).toEqual([]); // valide (acyclique, ≥1 head, aucun pendant)
		// La tête est sur v1 (after checkout_ancestor) — un seul head actif ici.
		const hs = heads(dag);
		expect(hs).toHaveLength(1);
		expect(hs[0].label).toBe("v1");
		// La ligne abandonnée v2 est PRÉSENTE (jamais détruite — le cas-clé S24).
		expect(dag.nodes.some((n) => n.label === "v2")).toBe(true);
		// v0 atteint v2a (la branche rebranch est reachable depuis la racine).
		expect(isReachable(dag, labelToId.v0, labelToId.v2a)).toBe(true);
		// Les deux bandes de la ligne de flottaison sont présentes (above ∧ below).
		expect(dag.nodes.some((n) => n.stratum === "above")).toBe(true);
		expect(dag.nodes.some((n) => n.stratum === "below")).toBe(true);
		// w1 et v2a sont parentés sur v1 (les ancêtres incluent v1 et v0).
		expect(ancestors(dag, labelToId.w1)).toContain(labelToId.v1);
		expect(ancestors(dag, labelToId.v2a)).toContain(labelToId.v0);
	});

	it("REJET — un DAG hors jeu clos est refusé (id vide, dupliqué, strate inconnue, cycle, sans tête)", () => {
		// id vide.
		expect(
			validateDag({
				nodes: [
					{ id: "  ", label: "x", parentIds: [], head: true, stratum: "above" },
				],
				edges: [],
			}),
		).toContain("empty_node_id");
		// id dupliqué.
		expect(
			validateDag({
				nodes: [
					{ id: "a", label: "x", parentIds: [], head: true, stratum: "above" },
					{ id: "a", label: "y", parentIds: [], head: false, stratum: "above" },
				],
				edges: [],
			}),
		).toContain("duplicate_node_id");
		// strate inconnue.
		expect(
			validateDag({
				nodes: [
					{
						id: "a",
						label: "x",
						parentIds: [],
						head: true,
						stratum: "sideways" as never,
					},
				],
				edges: [],
			}),
		).toContain("stratum_unknown");
		// cycle (a→b→a via parentIds).
		expect(
			validateDag({
				nodes: [
					{
						id: "a",
						label: "x",
						parentIds: ["b"],
						head: true,
						stratum: "above",
					},
					{
						id: "b",
						label: "y",
						parentIds: ["a"],
						head: false,
						stratum: "above",
					},
				],
				edges: [],
			}),
		).toContain("cycle");
		// sans tête.
		expect(
			validateDag({
				nodes: [
					{ id: "a", label: "x", parentIds: [], head: false, stratum: "above" },
				],
				edges: [],
			}),
		).toContain("no_head");
	});
});
