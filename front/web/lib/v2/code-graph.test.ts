import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	actionKey,
	anchorSymbols,
	type CodeEdge,
	type CodeNode,
	codePath,
	diffGraphs,
	godNodes,
	impactOf,
	validateCodeGraph,
} from "./code-graph";
import { seedComposes } from "./composition";

/**
 * WB2-26 — le MIROIR du GRAPHE DE CONNAISSANCE DU CODE (ADR 0056, graphify + Bazel).
 *
 * La décomposition fractale CONTINUE sous la feuille : fichier → classe → fonction →
 * version (hash du corps) → lignes. Le graphe (nœuds de code + arêtes calls/imports,
 * taguées extracted|inferred) permet : la DESCENTE (requirement → fonction → ligne),
 * l'IMPACT (« quoi touche quoi » = la clôture des dépendants inverses — la vague de
 * rouge S22 au grain code, le `rdeps` de Bazel), le DIFF (deux instantanés → les
 * symboles changés + leur vague), et la CLÉ D'ACTION content-adressée (Bazel : le hash
 * du corps + des versions des deps directes — toute modification invalide finement).
 */

// ── générateurs : des graphes de code plausibles ───────────────────────────────

/** Un petit graphe synthétique valide : N fonctions dans un fichier, arêtes i→j (i<j) + cycles optionnels. */
function makeGraph(
	n: number,
	calls: readonly (readonly [number, number])[],
): { nodes: CodeNode[]; edges: CodeEdge[] } {
	const file: CodeNode = {
		id: "f0",
		kind: "file",
		name: "a.ts",
		file: "a.ts",
		span: { start: 1, end: 100 },
		version: "v-file",
		parentId: null,
	};
	const fns: CodeNode[] = [];
	for (let i = 0; i < n; i++) {
		fns.push({
			id: `s${i}`,
			kind: "function",
			name: `fn${i}`,
			file: "a.ts",
			span: { start: i * 10 + 1, end: i * 10 + 9 },
			version: `v${i}`,
			parentId: "f0",
		});
	}
	const edges: CodeEdge[] = calls.map(([a, b]) => ({
		from: `s${a}`,
		to: `s${b}`,
		kind: "calls",
		confidence: "extracted",
	}));
	return { nodes: [file, ...fns], edges };
}

const callsArb = (n: number) =>
	fc.array(fc.tuple(fc.nat({ max: n - 1 }), fc.nat({ max: n - 1 })), {
		maxLength: 20,
	});

// ── validation (fail-closed) ──────────────────────────────────────────────────

describe("validateCodeGraph — fail-closed", () => {
	it("un graphe synthétique est valide", () => {
		const { nodes, edges } = makeGraph(4, [
			[0, 1],
			[1, 2],
		]);
		expect(validateCodeGraph(nodes, edges)).toEqual([]);
	});

	it("une arête pendante est refusée", () => {
		const { nodes, edges } = makeGraph(2, []);
		expect(
			validateCodeGraph(nodes, [
				...edges,
				{ from: "s0", to: "zzz", kind: "calls", confidence: "extracted" },
			]),
		).toContain("dangling_edge");
	});

	it("un id dupliqué est refusé", () => {
		const { nodes } = makeGraph(2, []);
		expect(validateCodeGraph([...nodes, nodes[1]], [])).toContain(
			"duplicate_id",
		);
	});

	it("un parentId inconnu est refusé", () => {
		const { nodes } = makeGraph(1, []);
		const bad: CodeNode = { ...nodes[1], id: "sX", parentId: "nulle-part" };
		expect(validateCodeGraph([...nodes, bad], [])).toContain("orphan_node");
	});
});

// ── l'impact : la vague de rouge au grain code (rdeps Bazel) ──────────────────

describe("impactOf — « quoi touche quoi » (la clôture des dépendants inverses)", () => {
	it("l'appelant direct est impacté ; le transitif aussi ; jamais une invention", () => {
		// fn0 → fn1 → fn2 : modifier fn2 impacte fn1 (direct) ET fn0 (transitif).
		const { nodes, edges } = makeGraph(3, [
			[0, 1],
			[1, 2],
		]);
		const wave = impactOf(nodes, edges, "s2");
		const ids = wave.map((w) => w.id);
		expect(ids).toContain("s1");
		expect(ids).toContain("s0");
		expect(ids).not.toContain("s2"); // le modifié n'est pas son propre impact
	});

	it("le fichier CONTENANT un impacté est impacté (la remontée de conteneur)", () => {
		const { nodes, edges } = makeGraph(2, [[0, 1]]);
		const ids = impactOf(nodes, edges, "s1").map((w) => w.id);
		expect(ids).toContain("f0"); // le fichier qui contient fn0 rougit aussi
	});

	it("∀ graphe (cycles inclus) : TOTAL, DÉTERMINISTE, et chaque impacté est MEMBRE", () => {
		fc.assert(
			fc.property(callsArb(6), (calls) => {
				const { nodes, edges } = makeGraph(6, calls);
				const a = impactOf(nodes, edges, "s0");
				const b = impactOf(nodes, edges, "s0");
				expect(a).toEqual(b); // déterminisme (cycles compris — terminaison)
				for (const w of a) expect(nodes.some((n) => n.id === w.id)).toBe(true);
			}),
		);
	});

	it("un cycle d'appels (récursion mutuelle) termine et impacte les deux", () => {
		const { nodes, edges } = makeGraph(2, [
			[0, 1],
			[1, 0],
		]);
		const ids = impactOf(nodes, edges, "s0").map((w) => w.id);
		expect(ids).toContain("s1");
	});

	it("la profondeur de vague est portée (1 = direct, 2 = transitif…)", () => {
		const { nodes, edges } = makeGraph(3, [
			[0, 1],
			[1, 2],
		]);
		const wave = impactOf(nodes, edges, "s2");
		const byId = new Map(wave.map((w) => [w.id, w.depth]));
		expect(byId.get("s1")).toBe(1);
		expect(byId.get("s0")).toBe(2);
	});
});

// ── la clé d'action content-adressée (Bazel) ──────────────────────────────────

describe("actionKey — l'invalidation fine à la Bazel", () => {
	it("déterministe ; change si MON corps change ; change si une dep DIRECTE change", () => {
		const { nodes, edges } = makeGraph(3, [[0, 1]]);
		const k = actionKey(nodes, edges, "s0");
		expect(actionKey(nodes, edges, "s0")).toBe(k);
		// mon corps change → ma clé change
		const mut = nodes.map((n) => (n.id === "s0" ? { ...n, version: "vX" } : n));
		expect(actionKey(mut, edges, "s0")).not.toBe(k);
		// la dep directe (s1) change → ma clé change aussi (le cœur de Bazel)
		const mutDep = nodes.map((n) =>
			n.id === "s1" ? { ...n, version: "vY" } : n,
		);
		expect(actionKey(mutDep, edges, "s0")).not.toBe(k);
		// un nœud SANS lien avec moi change → ma clé est STABLE
		const mutFar = nodes.map((n) =>
			n.id === "s2" ? { ...n, version: "vZ" } : n,
		);
		expect(actionKey(mutFar, edges, "s0")).toBe(k);
	});
});

// ── le diff de deux instantanés (la modification → sa vague) ──────────────────

describe("diffGraphs — « si on la modifie, quel impact »", () => {
	it("deux instantanés identiques → aucun changement, aucune vague", () => {
		const { nodes, edges } = makeGraph(3, [[0, 1]]);
		const d = diffGraphs(nodes, edges, nodes, edges);
		expect(d.changed).toEqual([]);
		expect(d.added).toEqual([]);
		expect(d.removed).toEqual([]);
		expect(d.redWave).toEqual([]);
	});

	it("changer le corps d'une fonction → elle est « changed » et ses appelants rougissent", () => {
		const { nodes, edges } = makeGraph(3, [
			[0, 1],
			[1, 2],
		]);
		const after = nodes.map((n) =>
			n.id === "s2" ? { ...n, version: "v2-modifie" } : n,
		);
		const d = diffGraphs(nodes, edges, after, edges);
		expect(d.changed).toEqual(["s2"]);
		const wave = d.redWave.map((w) => w.id);
		expect(wave).toContain("s1");
		expect(wave).toContain("s0");
	});

	it("un symbole ajouté/supprimé est classé added/removed", () => {
		const { nodes, edges } = makeGraph(2, []);
		const extra: CodeNode = {
			id: "sN",
			kind: "function",
			name: "neuf",
			file: "a.ts",
			span: { start: 90, end: 95 },
			version: "vn",
			parentId: "f0",
		};
		const d = diffGraphs(nodes, edges, [...nodes, extra], edges);
		expect(d.added).toEqual(["sN"]);
		const d2 = diffGraphs([...nodes, extra], edges, nodes, edges);
		expect(d2.removed).toEqual(["sN"]);
	});
});

// ── la descente & l'ancrage requirement → code ────────────────────────────────

describe("codePath / anchorSymbols — la descente continue sous la feuille", () => {
	it("codePath remonte la chaîne de contenance (fonction → fichier)", () => {
		const { nodes } = makeGraph(2, []);
		expect(codePath(nodes, "s1").map((n) => n.id)).toEqual(["f0", "s1"]);
	});

	it("anchorSymbols : un requirement dont les segments nomment une fonction la classe en tête", () => {
		const tree = seedComposes();
		const { nodes, edges } = makeGraph(2, []);
		const named = nodes.map((n) =>
			n.id === "s1" ? { ...n, name: "debitDuCompte" } : n,
		);
		const ranked = anchorSymbols(
			tree,
			named,
			edges,
			"app/paiement/checkout/debit-du-compte",
		);
		expect(ranked.length).toBeGreaterThan(0);
		expect(ranked[0].nodeId).toBe("s1");
		expect(ranked[0].score).toBeGreaterThan(0);
	});

	it("∀ : anchorSymbols est TOTAL et DÉTERMINISTE (même entrée → même classement)", () => {
		fc.assert(
			fc.property(fc.string(), (path) => {
				const tree = seedComposes();
				const { nodes, edges } = makeGraph(3, [[0, 1]]);
				expect(anchorSymbols(tree, nodes, edges, path)).toEqual(
					anchorSymbols(tree, nodes, edges, path),
				);
			}),
		);
	});
});

// ── les god nodes (graphify) ──────────────────────────────────────────────────

describe("godNodes — les nœuds les plus connectés (graphify)", () => {
	it("classe par degré entrant, départage stable par id", () => {
		const { nodes, edges } = makeGraph(4, [
			[0, 3],
			[1, 3],
			[2, 3],
			[0, 1],
		]);
		const top = godNodes(nodes, edges, 2);
		expect(top[0].id).toBe("s3"); // 3 appelants
		expect(top[0].inDegree).toBe(3);
	});
});
