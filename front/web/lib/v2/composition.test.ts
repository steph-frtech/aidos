import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SOURCE_ORDER } from "../besoin-grammar";
import {
	growComposes,
	nodeByPath,
	nodePath,
	type Position,
	placeIntent,
	positionOf,
	seedComposes,
	slugify,
} from "./composition";
import { validateComposes } from "./kernel-tree";

/**
 * WB2-03bis — le MIROIR de l'ÉCHELLE FRACTALE VIVANTE (§49, §108).
 *
 * L'échelle n'est PAS un jeu clos à trois valeurs : c'est une POSITION dans l'arbre de
 * composition (`composes`), qui POUSSE à chaque ajout et dont la profondeur est illimitée.
 * La position est TOPOLOGIQUE (racine, feuille, profondeur nN) — calculée, jamais stockée ;
 * les niveaux ne portent PAS de nom (chaque nœud est un kernel, §49). Le SYSTÈME identifie où attacher un besoin (placeIntent, déterministe) ; l'humain
 * peut surcharger (§49 : les frontières des cellules sont posées par jugement humain).
 */

// ── générateurs ────────────────────────────────────────────────────────────────

/** Un libellé de nœud plausible (ubiquitous language) : lettres/espaces/accents, 1-24 chars. */
const labelArb = fc
	.stringMatching(/^[a-zA-Zéèêàûôç][a-zA-Zéèêàûôç ]{0,23}$/)
	.filter((s) => s.trim().length > 0);

/** Une suite d'ajouts : chaque entrée attache un libellé sous l'index (modulo) d'un nœud existant. */
const growthArb = fc.array(
	fc.record({ label: labelArb, parentPick: fc.nat() }),
	{ minLength: 0, maxLength: 30 },
);

/** Applique une suite d'ajouts au seed — l'arbre « qui se construit au fur et à mesure ». */
function grown(growth: readonly { label: string; parentPick: number }[]) {
	let nodes = seedComposes();
	for (const g of growth) {
		const parent = nodes[g.parentPick % nodes.length];
		nodes = growComposes(nodes, parent.id, g.label);
	}
	return nodes;
}

// ── la croissance (l'arbre infini, append-only) ───────────────────────────────

describe("growComposes — l'arbre pousse à chaque ajout (§49)", () => {
	it("le seed est un arbre `composes` valide", () => {
		expect(validateComposes(seedComposes())).toEqual([]);
	});

	it("∀ suite d'ajouts : l'arbre reste VALIDE (ni cycle, ni orphelin, ni doublon)", () => {
		fc.assert(
			fc.property(growthArb, (growth) => {
				expect(validateComposes(grown(growth))).toEqual([]);
			}),
		);
	});

	it("∀ ajout : APPEND-ONLY — les nœuds existants sont inchangés, ≤ 1 nœud ajouté", () => {
		fc.assert(
			fc.property(growthArb, labelArb, fc.nat(), (growth, label, pick) => {
				const before = grown(growth);
				const parent = before[pick % before.length];
				const after = growComposes(before, parent.id, label);
				// préfixe intact (append-only, anti-overwrite §9)
				expect(after.slice(0, before.length)).toEqual(before);
				expect(after.length - before.length).toBeLessThanOrEqual(1);
			}),
		);
	});

	it("∀ ajout : IDEMPOTENT — re-greffer le même libellé sous le même parent ne crée rien", () => {
		fc.assert(
			fc.property(growthArb, labelArb, fc.nat(), (growth, label, pick) => {
				const base = grown(growth);
				const parent = base[pick % base.length];
				const once = growComposes(base, parent.id, label);
				const twice = growComposes(once, parent.id, label);
				expect(twice).toEqual(once);
			}),
		);
	});

	it("∀ ajout : DÉTERMINISTE — même (arbre, parent, libellé) → même id content-adressé", () => {
		fc.assert(
			fc.property(growthArb, labelArb, fc.nat(), (growth, label, pick) => {
				const base = grown(growth);
				const parent = base[pick % base.length];
				const a = growComposes(base, parent.id, label);
				const b = growComposes(base, parent.id, label);
				expect(a).toEqual(b);
			}),
		);
	});

	it("la profondeur est ILLIMITÉE : une chaîne de N greffes successives descend N crans", () => {
		const N = 40; // bien au-delà des 3 anciens crans en dur
		let nodes = seedComposes();
		let parentId = nodes[0].id; // la racine
		for (let i = 0; i < N; i++) {
			nodes = growComposes(nodes, parentId, `niveau ${i}`);
			const child = nodeByPath(
				nodes,
				nodePath(nodes, parentId)
					.concat(slugify(`niveau ${i}`))
					.join("/"),
			);
			expect(child).not.toBeNull();
			if (child === null) throw new Error("unreachable");
			parentId = child.id;
		}
		expect(validateComposes(nodes)).toEqual([]);
		expect(nodePath(nodes, parentId).length).toBe(N + 1); // racine + N segments
	});

	it("greffer sous un parent INCONNU ne change rien (total, fail-closed)", () => {
		const nodes = seedComposes();
		expect(growComposes(nodes, "id-inexistant", "x")).toEqual(nodes);
	});
});

// ── la position (jamais nommée par niveau : l'arbre est illimité) ─────────────

describe("positionOf — la position est TOPOLOGIQUE (racine, feuille, profondeur), jamais un nom de niveau", () => {
	it("∀ arbre poussé : isRoot ⇔ profondeur 0, isLeaf ⇔ aucun enfant, depth = la profondeur réelle", () => {
		fc.assert(
			fc.property(growthArb, (growth) => {
				const nodes = grown(growth);
				const children = new Map<string | null, number>();
				for (const n of nodes)
					children.set(n.parentId, (children.get(n.parentId) ?? 0) + 1);
				for (const n of nodes) {
					const depth = nodePath(nodes, n.id).length - 1;
					const isLeaf = (children.get(n.id) ?? 0) === 0;
					const pos: Position = positionOf(nodes, n.id);
					expect(pos.depth).toBe(depth);
					expect(pos.isRoot).toBe(depth === 0);
					expect(pos.isLeaf).toBe(isLeaf);
				}
			}),
		);
	});

	it("la position CHANGE quand l'arbre pousse : une feuille qui reçoit un enfant cesse d'être feuille (recalculé, pas stocké)", () => {
		let nodes = seedComposes();
		// fabriquer une feuille profonde
		const root = nodes[0];
		nodes = growComposes(nodes, root.id, "zone");
		const zone = nodeByPath(
			nodes,
			`${nodePath(nodes, root.id).join("/")}/zone`,
		);
		if (zone === null) throw new Error("zone absente");
		nodes = growComposes(nodes, zone.id, "grain");
		const grain = nodeByPath(
			nodes,
			`${nodePath(nodes, zone.id).join("/")}/grain`,
		);
		if (grain === null) throw new Error("grain absent");
		expect(positionOf(nodes, grain.id).isLeaf).toBe(true);
		nodes = growComposes(nodes, grain.id, "sous-grain");
		const pos = positionOf(nodes, grain.id);
		expect(pos.isLeaf).toBe(false); // la MÊME donnée, une lecture recalculée
		expect(pos.depth).toBe(2); // la profondeur, elle, n'a pas bougé
	});

	it("la profondeur est ILLIMITÉE et la position la porte telle quelle (n40 : pas de plafond de nommage)", () => {
		let nodes = seedComposes();
		let parentId = nodes[0].id;
		for (let i = 0; i < 40; i++) {
			nodes = growComposes(nodes, parentId, `etage ${i}`);
			const child = nodeByPath(
				nodes,
				nodePath(nodes, parentId)
					.concat(slugify(`etage ${i}`))
					.join("/"),
			);
			if (child === null) throw new Error("unreachable");
			parentId = child.id;
		}
		expect(positionOf(nodes, parentId).depth).toBe(40);
	});
});

// ── les chemins (l'adresse canonique d'une échelle) ───────────────────────────

describe("nodePath / nodeByPath — l'échelle est un CHEMIN dans l'arbre", () => {
	it("∀ nœud : aller-retour chemin → nœud → chemin (bijection sur l'arbre)", () => {
		fc.assert(
			fc.property(growthArb, fc.nat(), (growth, pick) => {
				const nodes = grown(growth);
				const n = nodes[pick % nodes.length];
				const path = nodePath(nodes, n.id).join("/");
				const back = nodeByPath(nodes, path);
				expect(back).not.toBeNull();
				if (back === null) throw new Error("unreachable");
				expect(back.id).toBe(n.id);
			}),
		);
	});

	it("un chemin inconnu → null (total, fail-closed)", () => {
		expect(nodeByPath(seedComposes(), "nulle/part")).toBeNull();
		expect(nodeByPath(seedComposes(), "")).toBeNull();
	});

	it("slugify est déterministe, ascii, stable (accents pliés, espaces → tirets)", () => {
		expect(slugify("Débit du compte")).toBe("debit-du-compte");
		expect(slugify("  Paiement  ")).toBe("paiement");
		fc.assert(
			fc.property(labelArb, (l) => {
				const s = slugify(l);
				expect(s).toMatch(/^[a-z0-9-]*$/);
				expect(slugify(l)).toBe(s);
			}),
		);
	});
});

// ── le placement calculé (« le système identifie où ajouter ») ────────────────

describe("placeIntent — le système identifie le point d'attache (déterministe, §6/§8)", () => {
	it("∀ (arbre, intention) : TOTAL — renvoie toujours un nœud MEMBRE de l'arbre", () => {
		fc.assert(
			fc.property(growthArb, fc.string(), (growth, intent) => {
				const nodes = grown(growth);
				const p = placeIntent(nodes, intent);
				expect(nodes.some((n) => n.id === p.nodeId)).toBe(true);
			}),
		);
	});

	it("∀ (arbre, intention) : DÉTERMINISTE — même entrée → même placement", () => {
		fc.assert(
			fc.property(growthArb, fc.string(), (growth, intent) => {
				const nodes = grown(growth);
				expect(placeIntent(nodes, intent)).toEqual(placeIntent(nodes, intent));
			}),
		);
	});

	it("une intention qui nomme un nœud profond atterrit sur LUI (le plus spécifique gagne)", () => {
		let nodes = seedComposes();
		const root = nodes[0];
		nodes = growComposes(nodes, root.id, "paiement xyz");
		const cell = nodeByPath(
			nodes,
			`${nodePath(nodes, root.id).join("/")}/paiement-xyz`,
		);
		if (cell === null) throw new Error("cellule absente");
		nodes = growComposes(nodes, cell.id, "remboursement qst");
		const leafPath = `${nodePath(nodes, cell.id).join("/")}/remboursement-qst`;
		const leaf = nodeByPath(nodes, leafPath);
		if (leaf === null) throw new Error("feuille absente");
		const p = placeIntent(nodes, "le remboursement qst doit être idempotent");
		expect(p.nodeId).toBe(leaf.id);
		expect(p.position.isLeaf).toBe(true);
	});

	it("une intention sans AUCUNE accroche atterrit à la racine avec score 0 (proposer une nouvelle branche)", () => {
		const nodes = seedComposes();
		const p = placeIntent(nodes, "zzz qqq www");
		expect(p.score).toBe(0);
		expect(p.position.isRoot).toBe(true);
		expect(p.position.depth).toBe(0);
	});

	it("le placement porte le chemin et la position dérivée (l'écran n'invente rien)", () => {
		fc.assert(
			fc.property(growthArb, fc.string(), (growth, intent) => {
				const nodes = grown(growth);
				const p = placeIntent(nodes, intent);
				expect(p.path).toBe(nodePath(nodes, p.nodeId).join("/"));
				expect(p.position).toEqual(positionOf(nodes, p.nodeId));
			}),
		);
	});
});

// ── la verticale reste déclarée sur les nœuds greffés ─────────────────────────

describe("growComposes — le niveau du nœud greffé descend la verticale (§23, déclaré)", () => {
	it("un enfant greffé porte le rang SUIVANT de la verticale (clampé à l'entité)", () => {
		let nodes = seedComposes();
		const root = nodes[0];
		nodes = growComposes(nodes, root.id, "alpha");
		const child = nodeByPath(
			nodes,
			`${nodePath(nodes, root.id).join("/")}/alpha`,
		);
		if (child === null) throw new Error("alpha absent");
		const rootRank = SOURCE_ORDER.indexOf(root.level);
		const childRank = SOURCE_ORDER.indexOf(child.level);
		expect(childRank).toBe(Math.min(rootRank + 1, SOURCE_ORDER.length - 1));
	});
});
