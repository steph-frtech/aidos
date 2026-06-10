/**
 * WB2-11 — le TWIN PUR du /goal : la transition IDÉE → ÉCRIRE LE MIROIR → /goal → GEL, projetée
 * DÉTERMINISTIQUEMENT (KRD §116 : « promouvoir = écrire le miroir = /goal »).
 *
 * L'écran /v2/goal conduit le FRANCHISSEMENT DU MUR (CLAUDE.md §2). Une idée (WB2-03) PROPOSE :
 * `hasMirror=false`, jamais gelée. La promotion vers la vérité est un CHEMIN OBLIGÉ — jamais une
 * écriture en passant :
 *   1. l'idée seule ne peut PAS être promue (un candidat sans miroir est un vœu, un MONSTRE, §1) ;
 *   2. ÉCRIRE LE MIROIR fait passer `HasMirror false → true` (le franchissement, §116) ;
 *   3. /goal compose alors un KERNEL PROPOSÉ : l'idée DESCEND à sa coordonnée (niveau × facette ×
 *      échelle, reprise verbatim de l'idée) et REÇOIT UNE VERSION GELÉE (content-adressée) ;
 *   4. ce kernel proposé est porté par un CHANGESET DRAFT (S20) — il PROPOSE, il n'APPLIQUE rien :
 *      l'application reste l'approbation humaine (le mur, §2). `wroteKernel` reste TOUJOURS false.
 *
 * LE MUR (CLAUDE.md §2) : une ÉCRITURE-VÉRITÉ DIRECTE (poser un kernel sans passer par idée→miroir→
 * /goal→ChangeSet) est TOUJOURS REFUSÉE — `refuseDirectWrite` renvoie un BlockReason actionnable.
 * C'est le littéral du mur : la seule porte est idée → miroir → /goal → approbation.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : composer la transition est une FONCTION PURE & TOTALE — pas
 * d'horloge, pas d'aléa, pas d'E/S, pas de LLM. La VERSION gelée est le HASH content-adressé du corps
 * canonique (coordonnée + intention + forme de miroir + texte du miroir) → même (idée+miroir) → même
 * version, même ChangeSet id. Le franchissement du mur est CALCULÉ (un miroir manquant → la promotion
 * est refusée), jamais déclaré. Le miroir de reproductibilité lib/v2/goal.test.ts (fast-check) épingle :
 * totalité, le mur (pas de miroir → pas de promotion), HasMirror false→true, la version gelée
 * déterministe, l'idée à sa coordonnée verbatim, wroteKernel toujours false, l'écriture directe
 * toujours refusée.
 *
 * RÉUTILISATION (pas de fork) : l'IDÉE + sa COORDONNÉE viennent du twin WB2-03 (lib/v2/idea) ; la
 * FORME DE MIROIR du jeu clos besoin-completeness (EL10). Ce module ne tient que la LOGIQUE du /goal.
 */

import { isMirrorForm, type MirrorForm } from "../besoin-completeness";
import type { Coordinate, Idea } from "./idea";

/** La longueur minimale du texte d'un miroir (un miroir vide ne prouve rien — un vœu). */
export const MIN_MIRROR_LEN = 3;

/**
 * Le MIROIR écrit pour promouvoir une idée (§116). C'est la SPÉCIFICATION exécutable du comportement,
 * dans sa forme attendue (Gherkin / property / fixture / écran). Écrire ce miroir est l'acte qui fait
 * passer `HasMirror false → true` — le franchissement du mur.
 */
export interface MirrorSpec {
	/** La forme du miroir (jeu clos EL10 : gherkin_n0 / property_n1 / fixture_n2 / screen_fixture). */
	readonly form: MirrorForm;
	/** Le texte du miroir (le Gherkin, la propriété, la fixture…) — non vide (sinon : un vœu). */
	readonly text: string;
}

/** Les états du cycle de vie de la promotion — VISIBLES par le wizard XState. Jeu CLOS, ordonné. */
export type GoalStage =
	| "idea" // l'idée seule (hasMirror=false) — au-dessus du mur, PROPOSE
	| "mirror_written" // le miroir écrit (hasMirror=true) — le mur franchi
	| "frozen"; // /goal a gelé une version dans un ChangeSet DRAFT (proposé, non appliqué)

export const GOAL_STAGES: readonly GoalStage[] = [
	"idea",
	"mirror_written",
	"frozen",
] as const;

/** Le statut d'un ChangeSet (S20) — append-only. Au /goal, il naît DRAFT (proposé, jamais appliqué). */
export type ChangeSetStatus = "DRAFT" | "APPLIED" | "REVERTED";

/**
 * Le KERNEL PROPOSÉ : l'idée descendue à sa coordonnée + le miroir écrit + la version gelée, porté
 * par un ChangeSet DRAFT. Il PROPOSE (le mur) : `wroteKernel` est TOUJOURS false — l'application est
 * une décision humaine séparée (approbation). C'est le résultat du franchissement.
 */
export interface ProposedKernel {
	/** L'id content-adressé de l'idée d'origine (la provenance — d'où vient ce kernel). */
	readonly ideaId: string;
	/** L'intention de l'idée, reprise VERBATIM (jamais reformulée par un LLM). */
	readonly intent: string;
	/** La COORDONNÉE cible (l'idée descend à sa coordonnée : niveau × facette × échelle). */
	readonly coordinate: Coordinate;
	/** Le miroir écrit (sa forme + son texte) — la preuve qui franchit le mur. */
	readonly mirror: MirrorSpec;
	/** §116 : APRÈS l'écriture du miroir, HasMirror est passé à true (le mur franchi). Invariant : true. */
	readonly hasMirror: true;
	/** La VERSION GELÉE (content-adressée) reçue au /goal — l'identité stable du kernel proposé. */
	readonly version: string;
	/** Le ChangeSet (S20) qui PORTE la proposition : id content-adressé + statut DRAFT. */
	readonly changeSet: {
		readonly id: string;
		readonly status: ChangeSetStatus;
	};
	/** Le mur (§2) : /goal PROPOSE, il n'APPLIQUE pas. Invariant : toujours false (jamais une écriture). */
	readonly wroteKernel: false;
}

/** Le diagnostic d'une promotion refusée (par cause), pour l'affichage wizard. */
export type PromoteError =
	| "mirror_form_unknown" // la forme du miroir n'est pas du jeu clos EL10
	| "mirror_text_empty" // le miroir n'a pas de texte (un vœu, pas une preuve)
	| "mirror_form_mismatch"; // la forme écrite ≠ la forme attendue par la coordonnée de l'idée

export type PromoteResult =
	| { ok: true; proposed: ProposedKernel }
	| { ok: false; errors: PromoteError[] };

/**
 * Un BlockReason actionnable (CLAUDE.md §2 / skill explain-block) — la forme du refus du mur :
 * code · sévérité · explication · comment-faire. Déterministe, jamais un texte de LLM.
 */
export interface BlockReason {
	readonly code: string;
	readonly severity: "error";
	readonly explanation: string;
	readonly howToFix: readonly string[];
}

/** La sérialisation canonique d'une coordonnée (clé content-adressée stable) — alignée sur WB2-03. */
function canonCoordinate(c: Coordinate): string {
	return `${c.level}×${c.facet}×${c.scale}`;
}

/**
 * Le HASH content-adressé (FNV-1a 32 bits, hex) d'un corps canonique — déterministe, aligné sur les
 * twins WB2-03/WB2-07. Même corps → même hash ; toute mutation le change. AUCUN aléa, AUCUNE horloge.
 */
function fnv1a(canon: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < canon.length; i++) {
		h ^= canon.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

/**
 * La VERSION GELÉE d'un kernel proposé : le hash content-adressé de son corps canonique (coordonnée +
 * intention + forme de miroir + texte du miroir). PURE & TOTALE : même (idée+miroir) → même version.
 * Le préfixe `k:` marque l'espace de noms kernel (jamais confondu avec un hash d'idée ou de version DAG).
 */
export function frozenVersion(
	intent: string,
	coordinate: Coordinate,
	mirror: MirrorSpec,
): string {
	const canon = [
		canonCoordinate(coordinate),
		intent.trim(),
		mirror.form,
		mirror.text.trim(),
	].join("|");
	return `k:${fnv1a(canon)}`;
}

/**
 * L'id content-adressé du ChangeSet (S20) qui porte la proposition. PURE & TOTALE : dérivé de l'id de
 * l'idée + la version gelée → même promotion → même ChangeSet id (idempotent). Préfixe `cs:`.
 */
export function changeSetId(ideaId: string, version: string): string {
	return `cs:${fnv1a(`${ideaId}|${version}`)}`;
}

/**
 * VALIDE un miroir relativement à l'idée qu'il promeut. PURE & TOTALE — même entrée → mêmes erreurs.
 * Le mur (§116) : le miroir doit être de la FORME ATTENDUE par la coordonnée de l'idée (un miroir de
 * la mauvaise forme ne prouve pas le bon comportement). Renvoie la liste (ordonnée, stable) des erreurs.
 */
export function validateMirror(idea: Idea, mirror: MirrorSpec): PromoteError[] {
	const errors: PromoteError[] = [];
	if (!isMirrorForm(mirror.form)) errors.push("mirror_form_unknown");
	if (mirror.text.trim().length < MIN_MIRROR_LEN)
		errors.push("mirror_text_empty");
	// La forme écrite doit correspondre à la forme attendue par la coordonnée de l'idée (EL10), si
	// l'idée en annexe une. Si le niveau n'attend pas de forme (expectedMirrorForm null), on n'impose rien.
	if (
		isMirrorForm(mirror.form) &&
		idea.expectedMirrorForm !== null &&
		mirror.form !== idea.expectedMirrorForm
	)
		errors.push("mirror_form_mismatch");
	return errors;
}

/**
 * PROMEUT une idée en kernel proposé en ÉCRIVANT son miroir — le cœur du twin (§116). PURE & TOTALE &
 * DÉTERMINISTE :
 *   1. valide le miroir contre l'idée (forme du jeu clos, texte non vide, forme = la forme attendue) ;
 *      sinon → { ok:false, errors } (le mur : un candidat mal-prouvé n'est pas promu) ;
 *   2. fait passer HasMirror false → true (le franchissement — l'écriture du miroir EST le /goal) ;
 *   3. fait DESCENDRE l'idée à sa coordonnée (reprise verbatim de l'idée — jamais réinventée) ;
 *   4. GÈLE une version (frozenVersion — content-adressée) ;
 *   5. compose le ChangeSet DRAFT qui PORTE la proposition (changeSetId) ;
 *   6. pose l'invariant du mur : wroteKernel=false (PROPOSE, n'APPLIQUE pas).
 * Aucune écriture, aucun LLM, aucune horloge. Même (idée+miroir) → même kernel proposé.
 */
export function promoteIdea(idea: Idea, mirror: MirrorSpec): PromoteResult {
	const errors = validateMirror(idea, mirror);
	if (errors.length > 0) return { ok: false, errors };

	const cleanMirror: MirrorSpec = {
		form: mirror.form,
		text: mirror.text.trim(),
	};
	const version = frozenVersion(idea.intent, idea.coordinate, cleanMirror);

	return {
		ok: true,
		proposed: {
			ideaId: idea.id,
			intent: idea.intent,
			coordinate: idea.coordinate,
			mirror: cleanMirror,
			hasMirror: true,
			version,
			changeSet: {
				id: changeSetId(idea.id, version),
				status: "DRAFT",
			},
			wroteKernel: false,
		},
	};
}

/**
 * LE MUR (CLAUDE.md §2, littéral) : une tentative d'ÉCRITURE-VÉRITÉ DIRECTE (poser un kernel sans
 * passer par idée → miroir → /goal → ChangeSet → approbation) est TOUJOURS REFUSÉE. PURE & TOTALE :
 * renvoie un BlockReason actionnable — JAMAIS un succès. C'est le défense-en-profondeur côté écran :
 * l'écran ne peut pas écrire la vérité, il ne peut que PROPOSER (promoteIdea → ChangeSet DRAFT).
 *
 * Invariant épinglé par le miroir : pour TOUTE entrée, refuseDirectWrite refuse (jamais d'exception).
 */
export function refuseDirectWrite(targetKernel: string): BlockReason {
	return {
		code: "WALL_DIRECT_TRUTH_WRITE_FORBIDDEN",
		severity: "error",
		explanation:
			`L'écriture-vérité directe du kernel « ${targetKernel.trim() || "(sans cible)"} » est refusée : ` +
			"le kernel (schéma Postgres au-dessus de la ligne) n'est jamais écrit en passant (le mur, §2).",
		howToFix: [
			"Capturer une idée (le candidat-vérité, au-dessus du mur).",
			"Écrire son miroir (HasMirror false → true) — le franchissement.",
			"Ouvrir un /goal : l'idée descend à sa coordonnée et reçoit une version gelée (ChangeSet DRAFT).",
			"Faire approuver le ChangeSet par l'autorité humaine — la seule porte qui applique la vérité.",
		],
	};
}

/**
 * COMPUTE le stade de la promotion (le cycle de vie), pour le stepper de l'écran. PURE & TOTALE :
 *   - pas encore de miroir écrit → "idea" (au-dessus du mur, PROPOSE) ;
 *   - un miroir écrit mais pas encore /goal → "mirror_written" (le mur franchi) ;
 *   - un kernel proposé (version gelée) → "frozen".
 * Le stade est CALCULÉ depuis l'état, jamais déclaré.
 */
export function goalStage(
	mirrorWritten: boolean,
	proposed: ProposedKernel | null,
): GoalStage {
	if (proposed !== null) return "frozen";
	if (mirrorWritten) return "mirror_written";
	return "idea";
}

/**
 * Une IDÉE de démonstration CANONIQUE (déterministe) pour seeder l'écran tant que le store ne sert pas
 * d'idée live (OpenQuestion documentée, ne bloque pas) : une idée au niveau « operation » (forme
 * attendue fixture_n2), à une coordonnée stable, hasMirror=false.
 */
export function syntheticIdea(): Idea {
	// Construit comme le twin WB2-03 le produirait — id content-adressé aligné sur ideaHash.
	const intent =
		"Au paiement, débiter le compte exactement une fois (idempotent), sinon refuser.";
	const coordinate: Coordinate = {
		level: "operation",
		facet: "F",
		scale: "feuille",
	};
	// L'id et expectedMirrorForm sont ceux que composeIdea(WB2-03) calculerait pour ce besoin.
	return {
		id: fnv1a(`${intent}|${canonCoordinate(coordinate)}|humain`),
		intent,
		coordinate,
		provenance: "humain",
		expectedMirrorForm: "fixture_n2",
		hasMirror: false,
		wroteKernel: false,
	};
}

/**
 * Un MIROIR de démonstration CANONIQUE (déterministe) qui promeut l'idée synthétique : une fixture N2
 * (état → commande → events) de la bonne forme (fixture_n2). Affûte le parcours du wizard.
 */
export function syntheticMirror(): MirrorSpec {
	return {
		form: "fixture_n2",
		text: "state: compte non débité ; command: payer ; events: [compte débité une fois]",
	};
}

/** Le slug d'étape canonique de WB2-11 (pour la seed de doc de l'écran). */
export const STEP_SLUG = "wb2-11-goal";
