/**
 * WB2-21 — le TWIN PUR des « émetteurs » (S34/S35 ; CLAUDE.md §3 N3 ; ADR 0007 no-fork ; KRD §23).
 * `/v2/emetteurs` montre L'ÉMISSION DEPUIS LES ENTITÉS : à partir d'une source d'entité (nom + attributs
 * ORDONNÉS, typés sur le jeu scalaire fermé), AIDOS rend DÉTERMINISTIQUEMENT ses trois projections —
 * le DDL Postgres (CREATE TABLE), le struct Go (sqlc) et le type TypeScript — plus son CONTRAT (les
 * champs que les trois cibles DOIVENT partager : ni ajout, ni retrait, ni renommage). Une seule source →
 * N projections, jamais doublement typée.
 *
 * RÉUTILISATION (pas de fork, ADR 0007) : le cœur émetteur est `emit`/`project` de `lib/entity-source.ts`
 * (S35, lui-même miroir byte-identique du Go `back/kernel/entities`) — des FONCTIONS PURES & TOTALES
 * (mêmes attributs → mêmes octets, même header protégé, même empreinte content-adressée). Ce module ne
 * RE-ÉMET RIEN par lui-même : il RÉ-EXPORTE `emit`/`project`/`entityId` VERBATIM et il ajoute la seule
 * chose neuve de WB2-21 — la VUE V2 par CIBLE :
 *   - `ENTITY_CASES` — le registre CLOS des entités d'exemple (Order complet · Order amputé du discount),
 *     réutilisant `ENTITY_ORDER`/`ENTITY_ORDER_CHANGED` (S35), aucune entité inventée (honnêteté) ;
 *   - `emitView(entity)` — l'émission groupée : une `EmittedTarget` par cible (DDL · Go · TS) avec ses
 *     octets, son chemin, son output_hash, et le CONTRAT partagé (`contract` = le jeu d'attributs en
 *     ordre source que les trois cibles épinglent) ; un AST malformé → un `BlockReason` (jamais un champ
 *     deviné) ;
 *   - `reEmitStable(entity, rounds)` — la PREUVE de re-émission byte-identique : ré-émettre la MÊME source
 *     N fois et confirmer que chaque cible est byte-identique au premier tour (un émetteur pur n'a aucun
 *     état caché → sa sortie est fonction de sa seule entrée) ;
 *   - `appPreview(entity)` — l'APERÇU de l'app émise : la table (colonnes + nullabilité + clé primaire)
 *     et le type de la ligne, DÉRIVÉS DÉTERMINISTIQUEMENT du même AST (jamais un rendu LLM) — « la BDD du
 *     résultat codé » que l'écran montre sans rien exécuter.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : tout est PUR (aucune horloge, aucun aléa, aucune I/O, aucun LLM) —
 * mêmes attributs → mêmes octets, mêmes hashes, même aperçu. Le miroir de reproductibilité
 * lib/v2/emetteurs.test.ts épingle : re-émission byte-identique, contrat partagé sans dérive,
 * required⇔NOT NULL⇔non-optionnel, identifiant⇔PRIMARY KEY, registre clos, BlockReason sur AST malformé.
 *
 * LE MUR (CLAUDE.md §2) : l'écran LIT l'AST d'entité (une SOURCE au-dessus de la ligne) et REND ses
 * projections — il n'écrit AUCUNE vérité. Les artefacts émis et l'aperçu sont des PROJECTIONS. Modifier
 * une source d'entité PROPOSE → /goal (idée → miroir → /goal → approbation), jamais une écriture directe.
 */

import {
	type Artifact,
	type Attribute,
	type BlockReason,
	type Entity,
	emit,
	entityId,
	isBlocked,
	PROTECTED_MARKER,
	project,
	SCALAR_TYPES,
	type ScalarType,
	stale,
	TARGETS,
	type Target,
} from "../entity-source";
import { ENTITY_ORDER, ENTITY_ORDER_CHANGED } from "../entity-source-data";

// On RÉ-EXPORTE le cœur émetteur (S35) pour que l'écran V2 importe tout depuis un seul module v2 —
// aucune duplication, aucun nouveau juge, aucun fork (ADR 0007).
export {
	type Artifact,
	type Attribute,
	type BlockReason,
	ENTITY_ORDER,
	ENTITY_ORDER_CHANGED,
	type Entity,
	emit,
	entityId,
	isBlocked,
	PROTECTED_MARKER,
	project,
	SCALAR_TYPES,
	type ScalarType,
	stale,
	TARGETS,
	type Target,
};

/**
 * isBlockedView — le garde de type qui discrimine un `BlockReason` d'une vue émise (`EmitView`). Le
 * `isBlocked` de S35 ne narrow que `Artifact | Artifact[]`, pas `EmitView` ; ce garde, lui, sait
 * reconnaître le `code` d'un BlockReason face à un `EmitView`. Pur, total.
 */
export function isBlockedView(x: EmitView | BlockReason): x is BlockReason {
	return (x as BlockReason).code !== undefined;
}

/** Le libellé humain (et l'extension de fichier) d'une cible — un mapping CLOS, jamais un jugement. */
export const TARGET_META: Record<
	Target,
	{ label: string; lang: string; ext: string }
> = {
	"pg-ddl": { label: "DDL Postgres", lang: "sql", ext: "sql" },
	"go-sqlc": { label: "Struct Go (sqlc)", lang: "go", ext: "go" },
	"ts-types": { label: "Type TypeScript", lang: "ts", ext: "ts" },
} as const;

/**
 * L'ORDRE d'AFFICHAGE des cibles (DDL d'abord — la vérité de stockage, puis Go, puis TS). Distinct de
 * l'ordre canonique d'émission `TARGETS` (Go, TS, DDL) — l'affichage met le DDL en tête car c'est « voir
 * le DDL » qui ouvre le critère de done. Déterministe (déclaré, jamais dérivé du parcours d'objet).
 */
export const DISPLAY_TARGETS: readonly Target[] = [
	"pg-ddl",
	"go-sqlc",
	"ts-types",
] as const;

/** Un cas d'entité du registre clos : un id stable, sa clé i18n de libellé, et son AST source. */
export interface EntityCase {
	readonly id: string;
	readonly labelKey: string;
	readonly entity: Entity;
}

/**
 * LE REGISTRE CLOS des entités d'exemple — réutilise les sources S35 (`ENTITY_ORDER`,
 * `ENTITY_ORDER_CHANGED`). L'agent n'invente AUCUNE entité (honnêteté) ; ce sont les mêmes que le Go
 * pinne (back/kernel/entities/example.go). Order complet (cinq attributs) et Order amputé du `discount`
 * (la source a bougé) — pour montrer que l'émission suit la source à la lettre.
 */
export const ENTITY_CASES: readonly EntityCase[] = [
	{ id: "order", labelKey: "caseOrder", entity: ENTITY_ORDER },
	{
		id: "order-changed",
		labelKey: "caseOrderChanged",
		entity: ENTITY_ORDER_CHANGED,
	},
] as const;

/** Une cible émise dans la vue V2 : sa cible, ses méta, ses octets rendus, son chemin, son output_hash. */
export interface EmittedTarget {
	readonly target: Target;
	readonly label: string;
	readonly lang: string;
	readonly path: string;
	readonly bytes: string;
	readonly outputHash: string;
}

/**
 * La VUE V2 d'une émission : la source content-adressée (`sourceHash`), le CONTRAT partagé (les noms
 * d'attributs en ordre source que les trois cibles DOIVENT épingler — ni ajout, ni retrait, ni
 * renommage), et la liste ordonnée des cibles émises. Une projection pure de l'AST.
 */
export interface EmitView {
	readonly entity: Entity;
	readonly sourceHash: string;
	readonly contract: readonly string[];
	readonly targets: readonly EmittedTarget[];
}

/**
 * emitView — l'émission groupée d'une entité à travers les trois cibles, dans l'ORDRE D'AFFICHAGE (DDL,
 * Go, TS). Délègue à `emit` (S35, byte-identique au Go) ; le CONTRAT est le jeu d'attributs en ordre
 * source (la même chose que les trois cibles rendent). PURE & TOTALE : un AST malformé renvoie le
 * `BlockReason` S13 (jamais un champ deviné, jamais un fallback silencieux). Mêmes attributs → même vue.
 */
export function emitView(entity: Entity): EmitView | BlockReason {
	// Le contrat = les noms d'attributs en ordre source ; émis une fois, comparé par les cibles.
	const contract = entity.attributes.map((a) => a.name);
	const targets: EmittedTarget[] = [];
	for (const target of DISPLAY_TARGETS) {
		const art = emit(entity, target);
		if (isBlocked(art)) return art;
		targets.push({
			target,
			label: TARGET_META[target].label,
			lang: TARGET_META[target].lang,
			path: art.path,
			bytes: art.bytes,
			outputHash: art.output_hash,
		});
	}
	const sourceHash = entityId(entity);
	return { entity, sourceHash, contract, targets };
}

/** Le rapport d'une cible re-émise N fois : son output_hash, et si tous les tours sont byte-identiques. */
export interface ReEmitTargetReport {
	readonly target: Target;
	readonly label: string;
	readonly outputHash: string;
	readonly byteStable: boolean;
}

/** Le rapport global de re-émission : le nombre de tours, par-cible, et le verdict d'ensemble. */
export interface ReEmitReport {
	readonly rounds: number;
	readonly targets: readonly ReEmitTargetReport[];
	readonly allStable: boolean;
}

/**
 * reEmitStable — la PREUVE de re-émission BYTE-IDENTIQUE (le critère de done WB2-21 « re-émission
 * byte-identique »). Ré-émet la MÊME source `rounds` fois et confirme que chaque cible est byte-identique
 * au premier tour : un émetteur pur n'a aucun état caché, donc sa sortie est fonction de sa SEULE entrée.
 * DÉTERMINISTE, jamais un jugement LLM « est-ce reproductible ? » (§8). Fail-closed : un AST malformé ou
 * la moindre divergence d'octets rend byteStable=false. Le twin de la propriété de pureté du Go S34/S35.
 */
export function reEmitStable(entity: Entity, rounds = 16): ReEmitReport {
	const targets: ReEmitTargetReport[] = [];
	let allStable = true;
	for (const target of DISPLAY_TARGETS) {
		const first = emit(entity, target);
		if (isBlocked(first)) {
			targets.push({
				target,
				label: TARGET_META[target].label,
				outputHash: "",
				byteStable: false,
			});
			allStable = false;
			continue;
		}
		let byteStable = true;
		for (let r = 0; r < rounds; r++) {
			const again = emit(entity, target);
			if (isBlocked(again) || again.bytes !== first.bytes) {
				byteStable = false;
				break;
			}
		}
		targets.push({
			target,
			label: TARGET_META[target].label,
			outputHash: first.output_hash,
			byteStable,
		});
		if (!byteStable) allStable = false;
	}
	return { rounds, targets, allStable };
}

/** Le mapping (CLOS) d'un scalaire vers son type d'aperçu d'app (le type que la ligne expose au front). */
const PREVIEW_TS: Record<ScalarType, string> = {
	string: "string",
	int: "number",
	decimal: "string",
	bool: "boolean",
	timestamptz: "string",
};

/** Le mapping (CLOS) d'un scalaire vers son type de colonne SQL — pour l'aperçu de la table émise. */
const PREVIEW_SQL: Record<ScalarType, string> = {
	string: "TEXT",
	int: "BIGINT",
	decimal: "NUMERIC",
	bool: "BOOLEAN",
	timestamptz: "TIMESTAMPTZ",
};

/** Une colonne de l'aperçu de la table émise : son nom, son type SQL, sa nullabilité, si c'est la PK. */
export interface PreviewColumn {
	readonly name: string;
	readonly sqlType: string;
	readonly tsType: string;
	readonly nullable: boolean;
	readonly primaryKey: boolean;
}

/**
 * L'APERÇU de l'app émise : le nom de la table, ses colonnes (en ordre source), et le nom de la PK. C'est
 * « la BDD du résultat codé » — ce que l'app émise stockerait, dérivé du même AST, sans rien exécuter.
 */
export interface AppPreview {
	readonly table: string;
	readonly columns: readonly PreviewColumn[];
	readonly primaryKey: string | null;
}

/**
 * appPreview — l'aperçu DÉTERMINISTE de l'app que ces projections composent : la table émise (colonnes +
 * nullabilité + clé primaire) et le type de chaque colonne. DÉRIVÉ du MÊME AST que les émetteurs (jamais
 * un rendu LLM, §8) : required → NOT NULL (non nullable) ; identifier → PRIMARY KEY. Total : un AST sans
 * attribut donne une table vide bien formée (jamais une exception, jamais une colonne inventée). L'ordre
 * source est préservé (l'ordre est sémantique, comme dans le DDL/Go).
 */
export function appPreview(entity: Entity): AppPreview {
	const idAttr = entity.attributes.find((a) => a.identifier === true);
	const columns: PreviewColumn[] = entity.attributes.map((a: Attribute) => ({
		name: a.name,
		sqlType: PREVIEW_SQL[a.type],
		tsType: PREVIEW_TS[a.type],
		nullable: !a.required,
		primaryKey: a.identifier === true,
	}));
	return {
		table: entity.name.toLowerCase(),
		columns,
		primaryKey: idAttr ? idAttr.name : null,
	};
}
