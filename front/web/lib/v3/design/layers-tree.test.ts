/**
 * Design Lab — TRANCHE 2 : le MIROIR du twin layers + du mur structurel (ADR 0071 × ADR 0055).
 * fast-check + exemples DÉTERMINISTES :
 *   (a) deriveLayersTree REFLÈTE la hiérarchie fractale : master → 3 enfants (web/mobile/desktop)
 *       → sections (une par entité) → champs/actions (depuis le bridge) ;
 *   (b) la source-kind est LA SOURCE KERNEL, jamais devinée (entité→composant liste,
 *       contrôle→composant bouton, champ→champ) ;
 *   (c) la dérivation est PURE & TOTALE & DÉTERMINISTE (même (app,coords) → même arbre,
 *       mêmes ids, même ordre canonique) ;
 *   (d) hors iframe (bridge vide) → les sections seules sous chaque enfant (utilisable sans déploiement) ;
 *   (e) LE MUR STRUCTUREL : routeStructuralGesture → « capture l'idée : … » (JAMAIS un ScreenDesign) ;
 *       classifyGesture(toGestureInput(g)) === "structural" TOUJOURS (la garde §8/BA12) ;
 *   (f) le besoin structurel libellé → composeIdea produit une idée hasMirror=false (la porte du mur).
 *
 *   reflects: front.v3.design.layers-tree (le panneau layers + le mur structurel)
 *   · test_kind: property + example · cert_language: fast-check/vitest · authority: below
 *   · liveness: live
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bareTree, growComposes } from "../../v2/composition";
import { composeIdea } from "../../v2/idea";
import type { KernelNode } from "../../v2/kernel-tree";
import {
	addressableLayers,
	componentKindKey,
	deriveLayersTree,
	flattenLayers,
	type LayersAppView,
} from "./layers-tree";
import {
	classifyGesture,
	coordRef,
	routeStructuralGesture,
	type ScreenCoord,
	STRUCTURAL_KINDS,
	type StructuralGesture,
	structuralNeed,
	toGestureInput,
} from "./screen-design";

const APP: LayersAppView = {
	version: "app:deadbeef",
	entities: [{ name: "produit" }, { name: "client" }],
};

const BRIDGE: ScreenCoord[] = [
	{ kind: "section", entity: "produit" },
	{ kind: "field", entity: "produit", field: "nom" },
	{ kind: "field", entity: "produit", field: "prix" },
	{ kind: "action", entity: "produit", control: "ajouter-au-panier" },
];

describe("(a) deriveLayersTree — REFLÈTE master → 3 enfants → sections → champs/actions", () => {
	it("la racine est la MAÎTRE, ses enfants sont les 3 plateformes (ordre déclaré)", () => {
		const root = deriveLayersTree(APP, BRIDGE);
		expect(root.sourceKind).toBe("master");
		expect(root.depth).toBe(0);
		expect(root.coord).toBeNull();
		expect(root.children.map((c) => c.label)).toEqual([
			"web",
			"mobile",
			"desktop",
		]);
		for (const child of root.children) {
			expect(child.sourceKind).toBe("child");
			expect(child.depth).toBe(1);
			expect(child.coord).toBeNull();
		}
	});

	it("chaque enfant porte les SECTIONS (une par entité, triées) → ses champs + actions", () => {
		const root = deriveLayersTree(APP, BRIDGE);
		const web = root.children[0];
		// produit + client → triées : client avant produit
		expect(web.children.map((s) => s.label)).toEqual(["client", "produit"]);
		const produit = web.children.find((s) => s.label === "produit");
		expect(produit?.sourceKind).toBe("entity");
		expect(produit?.coord).toEqual({ kind: "section", entity: "produit" });
		// produit a 2 champs (nom, prix) puis 1 action (sections avant champs avant actions)
		expect(produit?.children.map((c) => c.sourceKind)).toEqual([
			"field",
			"field",
			"control",
		]);
		expect(produit?.children.map((c) => c.label)).toEqual([
			"nom",
			"prix",
			"ajouter-au-panier",
		]);
	});

	it("flattenLayers : master(1) + 3 enfants + 3×(2 sections) + produit×3 ×3 enfants", () => {
		const root = deriveLayersTree(APP, BRIDGE);
		const flat = flattenLayers(root);
		// 1 master + 3 child + 3*(2 sections + 3 produit-enfants) = 1+3+3*5 = 19
		expect(flat).toHaveLength(19);
	});
});

describe("(b) la source-kind est LA SOURCE KERNEL (la détection de composants, jamais devinée)", () => {
	it("entité → composant liste · contrôle → composant bouton · champ → champ", () => {
		expect(componentKindKey("entity")).toBe("designComponentList");
		expect(componentKindKey("control")).toBe("designComponentButton");
		expect(componentKindKey("field")).toBe("designComponentField");
		// master / child sont organisationnels (aucun composant)
		expect(componentKindKey("master")).toBeNull();
		expect(componentKindKey("child")).toBeNull();
	});

	it("∀ nœud adressable : sa coordonnée correspond à sa source-kind", () => {
		const root = deriveLayersTree(APP, BRIDGE);
		for (const n of addressableLayers(root)) {
			expect(n.coord).not.toBeNull();
			const c = n.coord as ScreenCoord;
			if (n.sourceKind === "entity") expect(c.kind).toBe("section");
			else if (n.sourceKind === "field") expect(c.kind).toBe("field");
			else if (n.sourceKind === "control") expect(c.kind).toBe("action");
		}
	});
});

describe("(c) la dérivation est PURE & TOTALE & DÉTERMINISTE (même entrée → même arbre)", () => {
	it("idempotence : même (app, coords) → mêmes ids, même ordre, même structure", () => {
		const a = deriveLayersTree(APP, BRIDGE);
		const b = deriveLayersTree(APP, [...BRIDGE].reverse()); // ordre d'entrée indifférent
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});

	it("∀ entrée arbitraire (app + coords) → un arbre valide, jamais une exception", () => {
		fc.assert(
			fc.property(
				fc.array(fc.string()),
				fc.array(
					fc.record({
						kind: fc.constantFrom("section", "field", "action"),
						entity: fc.string(),
						field: fc.option(fc.string(), { nil: undefined }),
						control: fc.option(fc.string(), { nil: undefined }),
					}),
				),
				(names, rawCoords) => {
					const app: LayersAppView = {
						version: "app:x",
						entities: names.map((name) => ({ name })),
					};
					const root = deriveLayersTree(app, rawCoords as ScreenCoord[]);
					expect(root.sourceKind).toBe("master");
					expect(root.children).toHaveLength(3); // toujours les 3 enfants
					// le compte aplati est fini & cohérent (même structure des deux côtés)
					const flat = flattenLayers(root);
					expect(flat[0]).toBe(root);
				},
			),
		);
	});
});

describe("(d) hors iframe (bridge vide) → les sections seules sous chaque enfant", () => {
	it("sans coords bridge, chaque enfant rend les entités émises comme sections (sans enfant)", () => {
		const root = deriveLayersTree(APP, []);
		const web = root.children[0];
		expect(web.children.map((s) => s.label)).toEqual(["client", "produit"]);
		for (const section of web.children) {
			expect(section.sourceKind).toBe("entity");
			expect(section.children).toHaveLength(0); // pas de champ/action hors iframe
		}
	});

	it("app vide ∧ bridge vide → la maître + 3 enfants vides (jamais une exception)", () => {
		const root = deriveLayersTree({ version: "app:empty", entities: [] }, []);
		expect(root.children).toHaveLength(3);
		for (const child of root.children) expect(child.children).toHaveLength(0);
	});
});

describe("(e) LE MUR STRUCTUREL : routeStructuralGesture → idée, JAMAIS un ScreenDesign", () => {
	it("un ajout de champ → « capture l'idée : ajouter un champ à <coord> »", () => {
		const g: StructuralGesture = {
			kind: "add-field",
			coord: { kind: "section", entity: "produit" },
		};
		const phrase = routeStructuralGesture(g);
		expect(phrase.startsWith("capture l'idée :")).toBe(true);
		expect(phrase).toContain("ajouter un champ à");
		expect(phrase).toContain(coordRef(g.coord));
	});

	it("∀ geste structurel : classifyGesture(toGestureInput(g)) === structural (la garde §8/BA12)", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...STRUCTURAL_KINDS),
				fc.constantFrom("section", "field", "action"),
				fc.string(),
				(kind, ckind, entity) => {
					const g: StructuralGesture = {
						kind,
						coord: { kind: ckind, entity } as ScreenCoord,
					};
					// le routage prend TOUJOURS la porte de l'idée (jamais « adapte … »)
					expect(routeStructuralGesture(g).startsWith("capture l'idée :")).toBe(
						true,
					);
					// et la nature est TOUJOURS structural (jamais styling — pas de smuggling)
					expect(classifyGesture(toGestureInput(g))).toBe("structural");
				},
			),
		);
	});

	it("le besoin structurel est libellé en français clair (le mur expliqué)", () => {
		expect(
			structuralNeed({
				kind: "remove-section",
				coord: { kind: "section", entity: "client" },
			}),
		).toBe("retirer la section client");
	});
});

describe("(f) le besoin structurel → composeIdea produit une idée hasMirror=false (la porte du mur)", () => {
	it("« capture l'idée : ajouter un champ … » devient une idée, jamais une vérité écrite", () => {
		// L'arbre composes vivant (le seed nu + une greffe — la coordonnée d'attache existe).
		let tree: readonly KernelNode[] = bareTree();
		tree = growComposes(tree, tree[0].id, "produit");
		const need = structuralNeed({
			kind: "add-field",
			coord: { kind: "section", entity: "produit" },
		});
		const r = composeIdea(
			{
				intent: need,
				level: "entity",
				facet: "F",
				scale: "app/produit",
				provenance: "humain",
			},
			tree,
		);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.idea.hasMirror).toBe(false);
			expect(r.idea.wroteKernel).toBe(false);
			expect(r.idea.intent).toBe(need); // le besoin repris VERBATIM
		}
	});
});
