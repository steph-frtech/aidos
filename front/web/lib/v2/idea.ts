/**
 * WB2-03 — le TWIN PUR de l'IDÉE (le candidat-vérité, §115-116), projeté DÉTERMINISTIQUEMENT.
 *
 * L'écran /v2/idee capture un BESOIN au-dessus du mur : un texte (l'intention) + sa COORDONNÉE
 * cible (niveau × facette × échelle) + sa PROVENANCE (humain|incident) + la FORME DE MIROIR
 * attendue. L'ÉCHELLE est une POSITION dans l'arbre de composition `composes` (§49/§108,
 * ADR 0055) : un CHEMIN de slugs (« app/paiement/checkout »), profondeur ILLIMITÉE — l'arbre
 * POUSSE à chaque ajout ; racine/cellule/kernel/feuille sont des RÔLES DÉRIVÉS de la position
 * (lib/v2/composition), JAMAIS un jeu clos stocké (l'ancien enum fermé était FAUX). Le résultat
 * est une IDÉE : `hasMirror=false`, jamais gelée, jamais écrite — elle PROPOSE (le mur,
 * CLAUDE.md §2). La promotion reste idée → miroir → /goal.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : composer une idée depuis un besoin est une FONCTION
 * PURE & TOTALE — pas d'horloge, pas d'aléa, pas d'E/S, pas de LLM. Le niveau gouverne la forme
 * de miroir attendue (table DÉCLARÉE, jamais apprise) ; l'échelle est validée FAIL-CLOSED contre
 * l'arbre composes (nodeByPath — un chemin qui ne résout aucun nœud MEMBRE est refusé) ;
 * l'identité est content-adressée (FNV-1a sur la coordonnée canonique) → même besoin → même
 * idée, même empreinte. Le miroir de reproductibilité lib/v2/idea.test.ts (fast-check) épingle :
 * totalité de la coordonnée, forme de miroir = la table EL10, chemin membre ⇒ ok / chemin hors
 * arbre ⇒ scale_unknown, hasMirror toujours faux, déterminisme de l'empreinte.
 *
 * RÉUTILISATION (pas de fork) : les NIVEAUX viennent de la grammaire besoin (SOURCE_ORDER +
 * bands), les FACETTES de lib/facets (FKE-1.3), la FORME DE MIROIR de levelMirrorForm (EL10),
 * l'ÉCHELLE VIVANTE (chemins, rôles dérivés, croissance) de lib/v2/composition (WB2-03bis).
 * Le glossaire V2 reste la source des libellés d'écran ; ce module ne tient que la LOGIQUE.
 */

import { levelMirrorForm, type MirrorForm } from "../besoin-completeness";
import {
	allLevels,
	isLevel,
	type Level,
	SOURCE_ORDER,
} from "../besoin-grammar";
import { FACETS } from "../facets";
import { nodeByPath } from "./composition";
import type { KernelNode } from "./kernel-tree";

/** La PROVENANCE d'un besoin : qui l'a voulu (§115 — humain ou un incident de la réalité). */
export type Provenance = "humain" | "incident";

/** Le jeu CLOS des provenances légales. Déclaré, jamais inventé. */
export const PROVENANCES: readonly Provenance[] = [
	"humain",
	"incident",
] as const;

export function isProvenance(p: string): p is Provenance {
	return PROVENANCES.includes(p as Provenance);
}

/** Les huit lettres de facette canoniques (FKE-1.3), réutilisées de lib/facets. */
export const FACET_LETTERS: readonly string[] = FACETS.map((f) => f.letter);

export function isFacetLetter(letter: string): boolean {
	return FACET_LETTERS.includes(letter);
}

/** Le BESOIN brut saisi par le wizard, avant projection en idée. */
export interface Besoin {
	/** Le texte de l'intention (« je veux que… »). */
	readonly intent: string;
	/** Le niveau cible de la verticale (§23) ou une band. */
	readonly level: string;
	/** La lettre de facette cible (FKE-1.3). */
	readonly facet: string;
	/**
	 * L'échelle cible : un CHEMIN dans l'arbre composes (§49/§108, ADR 0055 — ex.
	 * « app/paiement/checkout »). Profondeur illimitée ; rôles dérivés par lib/v2/composition.
	 */
	readonly scale: string;
	/** La provenance (humain|incident). */
	readonly provenance: string;
}

/** La COORDONNÉE cible canonique d'un besoin : niveau × facette × échelle (la position §49). */
export interface Coordinate {
	readonly level: Level;
	readonly facet: string;
	/**
	 * La POSITION dans l'arbre composes (chemin de slugs, §49/§108, ADR 0055) — JAMAIS un jeu
	 * clos : l'arbre pousse, racine/cellule/kernel/feuille sont des LECTURES (roleOf), pas un type.
	 */
	readonly scale: string;
}

/**
 * L'IDÉE projetée : un candidat-vérité (§115). hasMirror est TOUJOURS faux (au-dessus du mur,
 * pas de miroir) ; wroteKernel TOUJOURS faux (le mur — aucune écriture-vérité). L'id est
 * content-adressé. La forme de miroir est ATTENDUE (annexée), jamais un miroir écrit.
 */
export interface Idea {
	/** L'empreinte content-adressée (l'identité stable de l'idée). */
	readonly id: string;
	/** Le texte de l'intention, repris verbatim (jamais reformulé par un LLM). */
	readonly intent: string;
	/** La coordonnée cible canonique. */
	readonly coordinate: Coordinate;
	/** La provenance. */
	readonly provenance: Provenance;
	/** La forme de miroir ATTENDUE (table EL10), null si le niveau n'en porte pas. */
	readonly expectedMirrorForm: MirrorForm | null;
	/** §115 : une idée n'a JAMAIS de miroir (au-dessus du mur). Invariant : toujours false. */
	readonly hasMirror: false;
	/** Le mur (§2) : composer une idée n'écrit AUCUNE vérité. Invariant : toujours false. */
	readonly wroteKernel: false;
}

/** Le diagnostic d'un besoin invalide (par champ), pour l'affichage wizard. */
export type BesoinError =
	| "intent_too_short"
	| "level_unknown"
	| "facet_unknown"
	| "scale_unknown"
	| "provenance_unknown";

export type ComposeResult =
	| { ok: true; idea: Idea }
	| { ok: false; errors: BesoinError[] };

/** La longueur minimale de l'intention (un besoin vide n'est pas falsifiable). */
export const MIN_INTENT_LEN = 3;

/** Les niveaux proposables par le wizard : les 7 rungs SOURCE + les bands (réutilisés). */
export function selectableLevels(): Level[] {
	return allLevels();
}

/** Les rungs SOURCE de la verticale, dans l'ordre §23 (pour l'étape « coordonnée »). */
export function verticaleOrder(): Level[] {
	return [...SOURCE_ORDER];
}

/**
 * VALIDE un besoin contre l'arbre composes et renvoie la liste (ordonnée, stable) de ses erreurs.
 * PURE & TOTALE : même (besoin, arbre) → mêmes erreurs. Aucun effet de bord. L'échelle est valide
 * ssi son chemin RÉSOUT un nœud MEMBRE de l'arbre (nodeByPath, ADR 0055) — FAIL-CLOSED : un
 * chemin vide ou inconnu ⇒ scale_unknown (jamais composé en douce).
 */
export function validateBesoin(
	b: Besoin,
	tree: readonly KernelNode[],
): BesoinError[] {
	const errors: BesoinError[] = [];
	if (b.intent.trim().length < MIN_INTENT_LEN) errors.push("intent_too_short");
	if (!isLevel(b.level)) errors.push("level_unknown");
	if (!isFacetLetter(b.facet)) errors.push("facet_unknown");
	if (nodeByPath(tree, b.scale) === null) errors.push("scale_unknown");
	if (!isProvenance(b.provenance)) errors.push("provenance_unknown");
	return errors;
}

/** La sérialisation canonique d'une coordonnée (clé content-adressée stable). */
function canonCoordinate(c: Coordinate): string {
	return `${c.level}×${c.facet}×${c.scale}`;
}

/**
 * L'empreinte content-adressée d'une idée (FNV-1a 32 bits, hex) — déterministe. Même intention
 * + même coordonnée + même provenance → même empreinte ; toute mutation la change.
 */
export function ideaHash(
	intent: string,
	coordinate: Coordinate,
	provenance: Provenance,
): string {
	const canon = `${intent.trim()}|${canonCoordinate(coordinate)}|${provenance}`;
	let h = 0x811c9dc5;
	for (let i = 0; i < canon.length; i++) {
		h ^= canon.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

/**
 * COMPOSE une idée depuis un besoin — le cœur du twin. PURE & TOTALE & DÉTERMINISTE :
 *   1. valide le besoin contre l'arbre composes (les cinq champs — l'échelle doit résoudre un
 *      nœud MEMBRE de l'arbre, ADR 0055) ; sinon → { ok:false, errors } ;
 *   2. fige la coordonnée cible (niveau × facette × échelle = la position dans l'arbre) ;
 *   3. ANNEXE la forme de miroir attendue (levelMirrorForm, EL10 — jamais inventée) ;
 *   4. content-adresse l'identité (ideaHash) ;
 *   5. pose les invariants du mur : hasMirror=false, wroteKernel=false.
 * Aucune écriture, aucun LLM, aucune horloge. Même (besoin, arbre) → même idée.
 */
export function composeIdea(
	b: Besoin,
	tree: readonly KernelNode[],
): ComposeResult {
	const errors = validateBesoin(b, tree);
	if (errors.length > 0) return { ok: false, errors };

	// Sûr après validation : les gardes ci-dessus ont prouvé chaque membre.
	const coordinate: Coordinate = {
		level: b.level as Level,
		facet: b.facet,
		scale: b.scale,
	};
	const provenance = b.provenance as Provenance;
	const intent = b.intent.trim();

	return {
		ok: true,
		idea: {
			id: ideaHash(intent, coordinate, provenance),
			intent,
			coordinate,
			provenance,
			expectedMirrorForm: levelMirrorForm(coordinate.level),
			hasMirror: false,
			wroteKernel: false,
		},
	};
}
