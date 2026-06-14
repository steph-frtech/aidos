/**
 * Design Lab — TRANCHE 2 : le TWIN PUR de l'ARBRE LAYERS (ADR 0071 × ADR 0055, l'échelle
 * fractale `composes`). Le panneau « Layers » d'Onlook, INVERSÉ : il ne lit pas la source,
 * il DÉRIVE l'arbre de composition des coordonnées-requirement déjà émises (les data-aidos-*).
 *
 * L'ARBRE (§49 fractale, ADR 0040 multi-plateforme) — la MAÎTRE (le parent unique) →
 * les 3 ENFANTS (web / mobile / desktop, les projections de la maître) → les SECTIONS
 * (une par entité S35) → les CHAMPS (un par attribut) / les ACTIONS (un par contrôle→opération
 * S11). DÉRIVÉ PUREMENT de l'AppProjection (emitApp) ENRICHIE par les coordonnées du bridge
 * (les éléments réellement présents dans l'iframe live) — jamais une détection heuristique.
 *
 * LA DÉTECTION DE COMPOSANTS (ADR 0071 §5) : chaque nœud porte sa SOURCE-KIND — la SOURCE
 * KERNEL dont il relève, jamais devinée. Une entité (S35) EST un « composant liste » ; un
 * contrôle→action (S11) EST un « composant bouton ». Les composants AIDOS SONT les sources
 * kernel : la lentille affiche le composant dont relève chaque élément en LISANT la coordonnée.
 *
 * DÉTERMINISME-FIRST (§6/§8) : derive l'arbre est une FONCTION PURE & TOTALE — pas d'horloge,
 * pas d'aléa, pas d'E/S, pas de LLM. Même (app, coords) → même arbre (même ordre, mêmes ids,
 * mêmes source-kinds). L'ordre est CANONIQUE (entités par nom, champs/actions par coordKey),
 * jamais appris. Le miroir layers-tree.test.ts (fast-check) épingle : reflet master→enfants→
 * sections→champs/actions, totalité, déterminisme, source-kind par coordonnée.
 *
 * LE MUR (§2) : ce module PROJETTE une lecture — il n'écrit AUCUNE vérité. L'arbre est une
 * projection de coordonnées (below-the-line) ; un geste STRUCTUREL (ajout/retrait/réordre) ne
 * mute JAMAIS l'arbre ici — il passe par la voie idée→miroir→/goal (routeStructuralGesture).
 *
 * RÉUTILISE, NE RÉINVENTE PAS : la coordonnée (ScreenCoord), sa clé (coordKey), sa référence
 * (coordRef), les cibles enfants (CHILD_TARGETS) viennent du twin screen-design.ts ; le drift
 * d'attributs est déjà normalisé en amont (ATTR_TO_KIND du bridge). Ce module ne tient que la
 * LOGIQUE de l'arbre layers.
 */

import {
	CHILD_TARGETS,
	type ChildTarget,
	coordKey,
	coordRef,
	type ScreenCoord,
} from "./screen-design";

/**
 * La SOURCE-KIND d'un nœud layers — la SOURCE KERNEL dont relève l'élément, JEU CLOS,
 * jamais devinée. C'est la « détection de composants » d'Onlook, mais lue de la vérité :
 *   - `master`  : la vue MAÎTRE (le parent unique, ADR 0055) — la racine de l'arbre ;
 *   - `child`   : une projection plateforme (web/mobile/desktop, ADR 0040) ;
 *   - `entity`  : une entité S35 — un « composant liste » (la section qui rend la collection) ;
 *   - `field`   : un attribut d'entité — une colonne/un champ DU composant liste ;
 *   - `control` : un contrôle→action S11 — un « composant bouton » (le contrôle borné à l'op).
 */
export type SourceKind = "master" | "child" | "entity" | "field" | "control";

export const SOURCE_KINDS: readonly SourceKind[] = [
	"master",
	"child",
	"entity",
	"field",
	"control",
] as const;

/**
 * Le NOM AFFICHABLE du composant dont relève une source-kind (la détection de composants
 * rendue lisible). DÉCLARÉ (clé i18n via componentKindKey côté lentille), jamais inventé.
 * Une entité = un composant liste ; un contrôle = un composant bouton ; les nœuds
 * organisationnels (master/child) ne portent pas de « composant » (null).
 */
export function componentKindKey(kind: SourceKind): string | null {
	switch (kind) {
		case "entity":
			return "designComponentList"; // « composant liste »
		case "control":
			return "designComponentButton"; // « composant bouton »
		case "field":
			return "designComponentField"; // « champ »
		default:
			return null; // master / child : organisationnel, aucun composant
	}
}

/**
 * Un NŒUD de l'arbre layers — ce que le panneau rend (id stable + enfants ordonnés) augmenté
 * de sa SOURCE-KIND (le composant dont il relève) et, pour les nœuds adressables (section/
 * champ/action), de sa COORDONNÉE (cliquer → send(select) à l'iframe). Les nœuds
 * organisationnels (master/child) n'ont PAS de coordonnée (coord === null).
 */
export interface LayerNode {
	/** L'id stable, content-adressé du nœud (déterministe — même arbre → mêmes ids). */
	readonly id: string;
	/** La source-kind — la source kernel dont relève l'élément (jamais devinée). */
	readonly sourceKind: SourceKind;
	/** Le libellé court (le nom d'entité, le nom de champ, la référence de contrôle, la cible enfant). */
	readonly label: string;
	/** La coordonnée adressable (section/champ/action) — null pour master/child (organisationnel). */
	readonly coord: ScreenCoord | null;
	/** La profondeur (0 = master), calculée, jamais déclarée. */
	readonly depth: number;
	/** Les enfants composés, ORDONNÉS (canonique). */
	readonly children: readonly LayerNode[];
}

/** Le sous-ensemble d'AppProjection que l'arbre layers consomme (les entités émises). */
export interface LayersAppView {
	/** La version content-adressée de l'app (l'adresse de la maître). */
	readonly version: string;
	/** Une entité émise par section (nommée du grain feuille de sa coordonnée). */
	readonly entities: readonly { readonly name: string }[];
}

/** FNV-1a 32 bits (hex) — le schéma content-adressé partagé par les twins (idea/composition/goal). */
function fnv1a(canon: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < canon.length; i++) {
		h ^= canon.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

/** L'ordre canonique d'une coordonnée enfant : section avant field avant action, puis coordKey. */
const KIND_RANK: Record<ScreenCoord["kind"], number> = {
	section: 0,
	field: 1,
	action: 2,
};

function compareCoords(a: ScreenCoord, b: ScreenCoord): number {
	const ra = KIND_RANK[a.kind];
	const rb = KIND_RANK[b.kind];
	if (ra !== rb) return ra - rb;
	const ka = coordKey(a);
	const kb = coordKey(b);
	return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * deriveLayersTree — le cœur du twin. PURE & TOTALE & DÉTERMINISTE : compose l'arbre fractal
 *   MAÎTRE → 3 ENFANTS → SECTIONS → CHAMPS/ACTIONS
 * depuis l'AppProjection (les sections = les entités émises) ENRICHIE par les coordonnées du
 * bridge (les champs/actions réellement présents dans l'iframe live, déjà drift-normalisés).
 *
 * La fusion des SECTIONS : l'UNION (dédupliquée par nom d'entité) des entités émises ET des
 * coordonnées `section` du bridge — l'app projetée donne les sections hors iframe, le bridge
 * les confirme/enrichit live. Chaque section reçoit ses CHAMPS (coords `field` de la même
 * entité) et ses ACTIONS (coords `action` de la même entité), triés canonique. Tout est
 * content-adressé (id = fnv1a du chemin) → même (app, coords, target) → mêmes ids.
 *
 * `bridgeCoords` est vide hors iframe live : l'arbre rend alors les sections seules (la
 * structure que l'app PIN), utilisable même sans déploiement (l'e2e hermétique s'appuie dessus).
 */
export function deriveLayersTree(
	app: LayersAppView,
	bridgeCoords: readonly ScreenCoord[],
): LayerNode {
	// Les SECTIONS : l'union (par nom d'entité) des entités émises + des coords `section` du bridge.
	const sectionNames = new Set<string>();
	for (const e of app.entities) if (e.name !== "") sectionNames.add(e.name);
	for (const c of bridgeCoords)
		if (c.kind === "section" && c.entity !== "") sectionNames.add(c.entity);

	// Les CHAMPS et les ACTIONS par entité (depuis le bridge — l'iframe les pin réellement).
	const fieldsByEntity = new Map<string, ScreenCoord[]>();
	const actionsByEntity = new Map<string, ScreenCoord[]>();
	for (const c of bridgeCoords) {
		if (c.entity === "") continue;
		if (c.kind === "field") {
			const b = fieldsByEntity.get(c.entity);
			if (b === undefined) fieldsByEntity.set(c.entity, [c]);
			else b.push(c);
			// un champ implique sa section (un champ orphelin de section est rattaché quand même)
			sectionNames.add(c.entity);
		} else if (c.kind === "action") {
			const b = actionsByEntity.get(c.entity);
			if (b === undefined) actionsByEntity.set(c.entity, [c]);
			else b.push(c);
			sectionNames.add(c.entity);
		}
	}

	const sortedSections = [...sectionNames].sort((a, b) =>
		a < b ? -1 : a > b ? 1 : 0,
	);

	// Construit les nœuds SECTION d'UN enfant (target) : la section + ses champs + ses actions.
	const sectionNodesFor = (target: ChildTarget): LayerNode[] =>
		sortedSections.map((entity) => {
			const fields = (fieldsByEntity.get(entity) ?? [])
				.slice()
				.sort(compareCoords);
			const actions = (actionsByEntity.get(entity) ?? [])
				.slice()
				.sort(compareCoords);
			const fieldNodes: LayerNode[] = fields.map((c) => ({
				id: fnv1a(`${target}/${coordKey(c)}`),
				sourceKind: "field" as const,
				label: c.field ?? coordRef(c),
				coord: c,
				depth: 3,
				children: [],
			}));
			const actionNodes: LayerNode[] = actions.map((c) => ({
				id: fnv1a(`${target}/${coordKey(c)}`),
				sourceKind: "control" as const,
				label: c.control ?? coordRef(c),
				coord: c,
				depth: 3,
				children: [],
			}));
			const sectionCoord: ScreenCoord = { kind: "section", entity };
			return {
				id: fnv1a(`${target}/${coordKey(sectionCoord)}`),
				sourceKind: "entity" as const,
				label: entity,
				coord: sectionCoord,
				depth: 2,
				children: [...fieldNodes, ...actionNodes],
			};
		});

	// Les 3 ENFANTS (web/mobile/desktop) — l'ordre est DÉCLARÉ (CHILD_TARGETS), jamais inventé.
	const childNodes: LayerNode[] = CHILD_TARGETS.map((target) => ({
		id: fnv1a(`master/${target}`),
		sourceKind: "child" as const,
		label: target,
		coord: null,
		depth: 1,
		children: sectionNodesFor(target),
	}));

	// La MAÎTRE : la racine unique (ADR 0055), adressée par la version de l'app.
	return {
		id: fnv1a(`master/${app.version}`),
		sourceKind: "master",
		label: app.version,
		coord: null,
		depth: 0,
		children: childNodes,
	};
}

/**
 * APLATIT l'arbre en parcours préfixe (le master puis chaque enfant, dans l'ordre) — l'inverse
 * logique de deriveLayersTree, utilisé par le miroir (le compte est préservé) et par le rendu
 * d'une liste à plat indentée. PURE & TOTALE.
 */
export function flattenLayers(root: LayerNode): LayerNode[] {
	const out: LayerNode[] = [];
	const walk = (n: LayerNode) => {
		out.push(n);
		for (const c of n.children) walk(c);
	};
	walk(root);
	return out;
}

/**
 * Les nœuds ADRESSABLES de l'arbre (ceux qui portent une coordonnée — section/champ/action) :
 * ceux qu'on peut SÉLECTIONNER (send(select) à l'iframe). PURE & TOTALE.
 */
export function addressableLayers(root: LayerNode): LayerNode[] {
	return flattenLayers(root).filter((n) => n.coord !== null);
}
