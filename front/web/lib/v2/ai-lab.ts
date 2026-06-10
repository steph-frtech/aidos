/**
 * WB2-15 — le TWIN PUR de l'AI LAB « modèle corrigé » (ROADMAP-fke FK11, FKE-38). Là où WB2-14
 * montre la RÈGLE d'autorisation (l'arbre ALLOW/DENY), WB2-15 montre le CERVEAU GAUCHE : un besoin en
 * langage naturel (à GAUCHE, le chat Claude) est PLACÉ sur la VERTICALE — chaque morceau du besoin
 * tombe à un (niveau × facette × paire) de l'espace déclaré. Le placement est le SEUL jugement
 * irréductible du LLM ; il est VÉRIFIÉ ici — CLAMPÉ à l'espace déclaré (un niveau/facette/paire
 * inventé est jeté, jamais coercé) — et le mur tient : le chat PROPOSE (ambre), il n'écrit JAMAIS la
 * vérité (la seule porte est idée → miroir → /goal).
 *
 * RÉUTILISATION (pas de fork, ADR 0007) : la SÉMANTIQUE de placement (le clamp `validatePlacements`,
 * le regroupement `placementsByLevel`, le refus au mur `isTruthWriteRequest` → `WallRefusal`, la clé
 * `placementKey`, le fallback déterministe `validateAndDescend`/`deriveNextSpec`) est CELLE de
 * `lib/ai-lab.ts` (FK11). Ce module n'invente AUCUNE règle métier : il RÉUTILISE l'évaluateur v1 et
 * il ajoute la seule chose neuve de WB2-15 :
 *   - `placeNeed(message, raw)` — la porte UNIFIÉE GAUCHE : un message + la sortie BRUTE du cerveau
 *     gauche (le placement proposé) → soit un `WallRefusal` (le message demande une écriture-vérité),
 *     soit la liste CLAMPÉE de placements (chacun à un (niveau, facette, paire) DÉCLARÉ) + leur clé
 *     content-adressée ;
 *   - `fallbackPlacements(message)` — le FALLBACK DÉTERMINISTE (Claude indisponible) : un placement
 *     par défaut, PUR (pas d'aléa, pas d'horloge, pas de LLM) ;
 *   - `placementSlug` / `PLACEMENT_SPACE` — le routage + l'espace déclaré (7 niveaux × 8 facettes ×
 *     6 paires-miroir), réutilisé pour l'index de l'écran.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : le CLAMP est une FONCTION PURE & TOTALE (aucune horloge,
 * aucun aléa, aucune E/S, aucun LLM) — `placeNeed(m, r)` deux fois → la MÊME liste. Le placement
 * NL→cellule est le jugement LLM irréductible (la seule exception gated) ; sa STRUCTURE (la cellule,
 * l'id) est VÉRIFIÉE par ce code, jamais déléguée. Le miroir de reproductibilité lib/v2/ai-lab.test.ts
 * épingle : déterminisme, le clamp (∀ placement gardé est dans l'espace déclaré), le refus au mur
 * (∀ message d'écriture-vérité → WallRefusal, jamais un placement), le fallback déterministe, la
 * bijection slug↔cellule, le multi-niveaux (un besoin fan-out sur plusieurs niveaux).
 *
 * LE MUR (CLAUDE.md §2) : placer un besoin n'écrit AUCUNE vérité — le placement est ambre (proposé),
 * la promotion passe par idée → miroir → /goal. L'écran AFFICHE et PROPOSE ; il n'applique aucune
 * écriture de kernel.
 */

import {
	ALL_FACETS,
	allPlacementsHandled,
	cellFullyHandled,
	cellPlacements,
	type DagImpact,
	deriveNextSpec,
	EXISTING_DAG,
	type ExistingSpec,
	existingSpec,
	impactResolved,
	isTruthWriteRequest,
	MIRROR_PAIRS,
	type MirrorPair,
	mergeImpacts,
	nextPairId,
	type Placement,
	placementKey,
	placementsByLevel,
	type SpecStatus,
	type Level as V1Level,
	VERTICAL_LEVELS,
	validateAndDescend,
	validateImpacts,
	validatePlacements,
	type WallRefusal,
} from "../ai-lab";
import type { Facet } from "../facetwire";

// On RÉ-EXPORTE les types/valeurs réutilisés (FK11) pour que l'écran V2 importe tout depuis un seul
// module v2 — aucune duplication, aucune nouvelle vérité.
export {
	ALL_FACETS,
	allPlacementsHandled,
	cellFullyHandled,
	cellPlacements,
	type DagImpact,
	deriveNextSpec,
	EXISTING_DAG,
	type ExistingSpec,
	existingSpec,
	type Facet,
	impactResolved,
	isTruthWriteRequest,
	MIRROR_PAIRS,
	type MirrorPair,
	mergeImpacts,
	nextPairId,
	type Placement,
	placementKey,
	placementsByLevel,
	type SpecStatus,
	VERTICAL_LEVELS,
	validateAndDescend,
	validateImpacts,
	type WallRefusal,
};

/** Le niveau de la verticale (§23, produit → entité) — réutilisé verbatim de FK11. */
export type Level = V1Level;

// ── L'ESPACE DÉCLARÉ — le clamp ne garde QUE ce qui y tombe ───────────────────

/** Une CELLULE de placement : son (niveau × facette × paire-miroir) — l'atome de la verticale. */
export interface PlacementCell {
	readonly level: Level;
	readonly facet: Facet;
	readonly pairId: string;
}

/**
 * `PLACEMENT_SPACE` — l'ESPACE DÉCLARÉ et CLOS des cellules (7 niveaux × 8 facettes × 6 paires =
 * 336 cellules). C'est l'espace contre lequel le clamp VÉRIFIE : un placement hors de cet espace est
 * jeté (déterminisme-first §8 — le code juge, jamais le LLM). PURE, content-adressé par position.
 */
export const PLACEMENT_SPACE: readonly PlacementCell[] = (() => {
	const cells: PlacementCell[] = [];
	for (const level of VERTICAL_LEVELS)
		for (const facet of ALL_FACETS)
			for (const p of MIRROR_PAIRS) cells.push({ level, facet, pairId: p.id });
	return cells;
})();

/** Le compte des dimensions de l'espace déclaré (pour l'en-tête de l'écran). PURE & TOTALE. */
export const SPACE_COUNTS = {
	levels: VERTICAL_LEVELS.length,
	facets: ALL_FACETS.length,
	pairs: MIRROR_PAIRS.length,
	cells: PLACEMENT_SPACE.length,
} as const;

/** Le slug content-adressé d'une cellule (niveau-facette-paire) — routage bijectif. */
export function placementSlug(
	c: Pick<PlacementCell, "level" | "facet" | "pairId">,
): string {
	return `${c.level}-${c.facet}-${c.pairId}`;
}

/** Résout un slug vers sa cellule (totalité : undefined pour un slug inconnu → 404). */
export function cellBySlug(slug: string): PlacementCell | undefined {
	return PLACEMENT_SPACE.find((c) => placementSlug(c) === slug);
}

/** Est-ce une cellule de l'espace déclaré ? Pure + totale (le prédicat du clamp). */
export function isDeclaredCell(
	c: Pick<PlacementCell, "level" | "facet" | "pairId">,
): boolean {
	return PLACEMENT_SPACE.some(
		(d) => d.level === c.level && d.facet === c.facet && d.pairId === c.pairId,
	);
}

// ── La porte GAUCHE — placer un besoin, gaté + vérifié + le mur ───────────────

/** Le résultat de `placeNeed` : soit un refus au mur, soit la liste CLAMPÉE des placements. */
export type PlaceResult =
	| WallRefusal
	| { refused: false; placements: Placement[] };

/**
 * `placeNeed` est la porte UNIFIÉE du CERVEAU GAUCHE (FKE-38) : un message en langage naturel + la
 * sortie BRUTE du cerveau gauche (les placements proposés, possiblement avec des cellules inventées)
 * → soit un `WallRefusal` si le message demande une écriture-vérité directe (le mur §2), soit la liste
 * CLAMPÉE — chaque placement gardé est dans l'espace déclaré (`validatePlacements`, FK11), un niveau/
 * facette/paire inventé est JETÉ, jamais coercé. PURE + TOTALE + DÉTERMINISTE : même (message, raw) →
 * même résultat. NO LLM dans ce twin — il VÉRIFIE la structure ; le jugement NL→cellule est l'exception
 * gated (Claude au runtime), checkée contre ce clamp. Le mur §2 : aucune vérité écrite (ambre, proposé).
 */
export function placeNeed(message: string, raw: unknown): PlaceResult {
	if (isTruthWriteRequest(message)) {
		return {
			refused: true,
			code: "AI_LAB_DIRECT_TRUTH_WRITE",
			explanation:
				"Le chat de l'AI Lab PLACE des specs (au-dessus du mur), il n'écrit jamais la vérité. " +
				"Une écriture directe du kernel ou d'un miroir est refusée au mur (§2).",
			howToFix: [
				"Capturez l'intention comme une idée (idea-intake).",
				"Dérivez son miroir (write-bdd-scenario).",
				"Ouvrez un /goal — la promotion passe par la décision humaine.",
			],
		};
	}
	return { refused: false, placements: validatePlacements(raw) };
}

/**
 * `fallbackPlacements` — le FALLBACK DÉTERMINISTE quand le cerveau gauche (Claude) est indisponible :
 * un placement par défaut, PUR (aucun aléa, aucune horloge, aucun LLM). On pose la SPEC (la première
 * paire-miroir) au niveau PRODUIT de la facette fonctionnelle (F) — le rung racine de tout besoin —
 * avec le message comme intention. Honnête : c'est le twin déterministe qui répond, pas Claude.
 * PURE + TOTALE : même message → même placement. Le mur §2 : ambre, proposé, aucune vérité écrite.
 */
export function fallbackPlacements(message: string): Placement[] {
	const intent = message.trim();
	if (!intent) return [];
	return validatePlacements([
		{
			level: "produit",
			facet: "F",
			pairId: MIRROR_PAIRS[0].id,
			spec: intent,
		},
	]);
}

/** Les niveaux DISTINCTS qu'un besoin a touchés (le fan-out vertical, pour l'écran). PURE & TOTALE. */
export function levelsTouched(placements: readonly Placement[]): Level[] {
	const seen = new Set<Level>();
	for (const p of placements) seen.add(p.level);
	return VERTICAL_LEVELS.filter((l) => seen.has(l));
}

/** Le compte de placements gardés par niveau (le Σ de chaque rung). PURE & TOTALE. */
export function countsByLevel(
	placements: readonly Placement[],
): Record<string, number> {
	const out: Record<string, number> = {};
	for (const l of VERTICAL_LEVELS) out[l] = 0;
	for (const p of placements) out[p.level] = (out[p.level] ?? 0) + 1;
	return out;
}

// ── Le REGISTRE CLOS des besoins d'exemple (réutilise des cellules déclarées) ──

/** Un besoin d'exemple : son intention NL + sa sortie BRUTE du cerveau gauche (placements proposés). */
export interface NeedSample {
	readonly id: string;
	readonly role: string;
	readonly message: string;
	/** la sortie brute du cerveau gauche — INCLUT volontairement une cellule INVENTÉE (clampée). */
	readonly raw: unknown;
	/**
	 * WB2-17 — la sortie BRUTE des IMPACTS du cerveau gauche : quelles specs EXISTANTES (du DAG) le
	 * besoin touche (la vague de rouge). INCLUT volontairement un id INVENTÉ (jeté par `validateImpacts`).
	 */
	readonly impactsRaw?: unknown;
}

/**
 * Le registre CLOS des besoins d'exemple de l'écran. Chaque `raw` mêle des placements DÉCLARÉS (gardés)
 * et au moins une cellule INVENTÉE (jetée par le clamp) — pour PROUVER le clamp à l'écran. Aucune règle
 * inventée : ce ne sont que des entrées d'exemple pour le gate déterministe.
 */
export const NEED_SAMPLES: readonly NeedSample[] = [
	{
		id: "checkout-multi",
		role: "« Je veux un tunnel de paiement » → fan-out sur PLUSIEURS niveaux (produit → entité).",
		message: "Je veux un tunnel de paiement sécurisé du panier au reçu",
		raw: [
			{
				level: "produit",
				facet: "F",
				pairId: "spec",
				spec: "Vendre — encaisser un paiement",
			},
			{
				level: "parcours",
				facet: "F",
				pairId: "scenarios",
				spec: "Du panier au reçu",
			},
			{
				level: "contrôle",
				facet: "F",
				pairId: "contract",
				spec: "Bouton Payer → checkout",
			},
			{
				level: "action",
				facet: "S",
				pairId: "behavior",
				spec: "Paiement atomique, idempotent",
			},
			{
				level: "opération",
				facet: "F",
				pairId: "behavior",
				spec: "createOrder — valider + persister",
			},
			{
				level: "entité",
				facet: "F",
				pairId: "model",
				spec: "Order — id, total, lignes",
			},
			// ↓ cellule INVENTÉE (niveau hors verticale) → JETÉE par le clamp.
			{
				level: "galaxie",
				facet: "F",
				pairId: "spec",
				spec: "(niveau inventé — clampé)",
			},
		],
		// WB2-17 — les specs EXISTANTES que ce besoin IMPACTE (la vague de rouge), alignées sur les
		// cellules placées ci-dessus (elles se RÉSOLVENT quand le besoin est validé). + 1 id inventé.
		impactsRaw: [
			{ specId: "d-produit-shop", reason: "Le tunnel touche la boutique" },
			{
				specId: "d-controle-pay",
				reason: "Le bouton Payer déclenche le checkout",
			},
			{ specId: "d-action-checkout", reason: "Le paiement atomique change" },
			{ specId: "d-operation-createorder", reason: "createOrder est impacté" },
			{ specId: "d-entite-order", reason: "Order évolue" },
			// ↓ id INVENTÉ (pas dans le DAG) → JETÉ par validateImpacts.
			{ specId: "d-inexistant-ghost", reason: "(spec inventée — clampée)" },
		],
	},
	{
		id: "secret-field",
		role: "« Masquer un champ secret » → une seule cellule (entité × sécurité × modèle).",
		message: "Le champ secretNote ne doit jamais fuiter",
		raw: [
			{
				level: "entité",
				facet: "S",
				pairId: "model",
				spec: "secretNote — jamais en clair",
			},
			// ↓ facette INVENTÉE → JETÉE par le clamp.
			{
				level: "entité",
				facet: "Z",
				pairId: "model",
				spec: "(facette inventée — clampée)",
			},
		],
		// WB2-17 — la spec EXISTANTE Payment (entité × sécurité) que le champ secret impacte. Elle se
		// résout quand la cellule entité×S est validée. + 1 id inventé (clampé).
		impactsRaw: [
			{
				specId: "d-entite-payment",
				reason: "Payment ne doit jamais fuiter le secret",
			},
			{ specId: "d-inexistant-ghost", reason: "(spec inventée — clampée)" },
		],
	},
];

/** Les ids de tous les besoins d'exemple connus. */
export function needSampleIds(): string[] {
	return NEED_SAMPLES.map((s) => s.id);
}

/** Résout un id de besoin d'exemple (totalité). */
export function needSampleById(id: string): NeedSample | undefined {
	return NEED_SAMPLES.find((s) => s.id === id);
}

/** Le slug d'étape canonique de WB2-15 (pour la seed de doc de l'écran). */
export const STEP_SLUG = "wb2-15-ai-lab";

// ── WB2-16 — LA DESCENTE de l'anatomie (valider une spec → la paire SUIVANTE) ──
//
// WB2-15 PLACE le besoin (NL → cellule). WB2-16 DESCEND la cellule : valider une paire-miroir
// GÉNÈRE la paire SUIVANTE de l'anatomie — Spec → Comportement → Scénarios → Modèle → Contrat →
// Evidence (les 6 MIRROR_PAIRS, en ordre). La descente est PER FACETTE, PER cellule (niveau × facette).
//
// DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : le « WHICH-PAIR » — quelle paire vient après, et le
// template de sa spec dérivée — est une FONCTION PURE (`nextPairId` + `deriveNextSpec`, réutilisés
// VERBATIM de FK11, AUCUNE règle inventée). Le SEUL morceau irréductible est l'ENRICHISSEMENT du
// texte de la paire fille (Claude écrit un VRAI comportement à partir de la spec) — c'est l'exception
// gated : quand un `override` (la sortie Claude) est fourni, son TEXTE est utilisé ; SINON le FALLBACK
// TEMPLATE déterministe (`deriveNextSpec`) répond. Dans les DEUX cas la STRUCTURE (quelle paire, le
// placement, le statut) est du CODE déterministe — Claude ne décide JAMAIS de la structure.
//
// LE MUR (§2) : descendre une paire STAGE une proposition de lab (la fille est AMBRE/proposée), à la
// DERNIÈRE paire (evidence) la paire est « réalisée » (la descente est complète) — mais AUCUNE vérité
// n'est écrite ; la promotion passe par idée → miroir → /goal.

/** Les 6 paires de l'anatomie, en ordre (Spec → Comportement → … → Evidence). PURE & TOTALE. */
export const ANATOMY_ORDER: readonly string[] = MIRROR_PAIRS.map((p) => p.id);

/** L'étiquette FR lisible d'une paire de l'anatomie (pour l'écran). PURE & TOTALE. */
const PAIR_LABEL_FR: Record<string, string> = {
	spec: "Spec",
	behavior: "Comportement",
	scenarios: "Scénarios",
	model: "Modèle",
	contract: "Contrat",
	evidence: "Evidence",
};

/** L'étiquette FR d'une paire (totalité : l'id brut pour une paire inconnue). */
export function pairLabel(pairId: string): string {
	return PAIR_LABEL_FR[pairId] ?? pairId;
}

/** Le rang d'une paire dans l'anatomie (0 = spec … 5 = evidence). -1 si inconnue. PURE & TOTALE. */
export function pairRank(pairId: string): number {
	return ANATOMY_ORDER.indexOf(pairId);
}

/** Une paire est-elle la DERNIÈRE de l'anatomie (evidence) → la descente y est RÉALISÉE ? */
export function isLastPair(pairId: string): boolean {
	return nextPairId(pairId) === undefined && pairRank(pairId) >= 0;
}

/** Le résultat d'une descente : l'état des placements + la paire générée (ou « réalisé » à la fin). */
export interface DescendResult {
	/** les placements après la descente (le parent validé/réalisé + la fille proposée si non-dernière). */
	readonly placements: Placement[];
	/** la paire générée par la descente, ou undefined à la dernière paire (descente réalisée). */
	readonly nextPair: string | undefined;
	/** true à la dernière paire (evidence) : la cellule a atteint le bout de l'anatomie. */
	readonly realized: boolean;
	/** true si l'enrichissement Claude (override) a été utilisé ; false si le fallback template. */
	readonly enriched: boolean;
}

/**
 * `descendPair` est la porte WB2-16 : valider la paire (niveau × facette × pairId) et générer la
 * paire SUIVANTE de l'anatomie. RÉUTILISE `validateAndDescend` (FK11) — AUCUNE règle inventée : le
 * which-pair (`nextPairId`) et le template (`deriveNextSpec`) sont ceux de v1. L'ENRICHISSEMENT est
 * gaté : `override` non-vide (sortie Claude) → son texte ; sinon le FALLBACK TEMPLATE déterministe.
 * PURE + TOTALE + DÉTERMINISTE : mêmes (placements, cellule, override) → même résultat. Cellule
 * inconnue = no-op (la liste inchangée, nextPair undefined). Le mur §2 : aucune vérité écrite.
 */
export function descendPair(
	placements: Placement[],
	level: Level,
	facet: Facet,
	pairId: string,
	override?: { spec: string; detail?: string },
): DescendResult {
	const target = placements.find(
		(p) => p.level === level && p.facet === facet && p.pairId === pairId,
	);
	if (!target) {
		return {
			placements,
			nextPair: undefined,
			realized: false,
			enriched: false,
		};
	}
	const next = nextPairId(pairId);
	const enriched = Boolean(override?.spec?.trim());
	const updated = validateAndDescend(
		placements,
		level,
		facet,
		pairId,
		override,
	);
	return {
		placements: updated,
		nextPair: next,
		realized: next === undefined,
		enriched: enriched && next !== undefined,
	};
}

// ── WB2-17 — LA VAGUE DE ROUGE : les specs EXISTANTES que le besoin IMPACTE ──────
//
// WB2-15 PLACE le besoin (NL → nouvelles cellules). WB2-16 DESCEND l'anatomie. WB2-17 montre l'AUTRE
// face : à DROITE, les specs DÉJÀ là (le DAG existant) que le besoin TOUCHE — en ROUGE (impactées,
// non résolues) — puis leur RÉSOLUTION (rouge → vert) quand le besoin est validé. CONSISTENT PARTOUT :
// la liste (ici), la grille, les cellules et le graphe lisent le MÊME prédicat `impactResolved`.
//
// DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : `needImpacts` (le clamp des impacts) et `impactRows` (la vue
// liste) sont des FONCTIONS PURES & TOTALES — aucune horloge, aucun aléa, aucun LLM. Le « quelles specs
// impactées » BRUT est le jugement irréductible du cerveau gauche, mais il est VÉRIFIÉ ici : un id
// inventé est JETÉ (`validateImpacts`), jamais coercé. La RÉSOLUTION (rouge → vert) est PURE CODE — le
// MÊME `impactResolved` que v1 (le DAG, la grille, le graphe), AUCUNE règle inventée. Le miroir de
// reproductibilité épingle : déterminisme, le clamp, et « valider TOUT → tout impact RÉSOLU (vert) ».
//
// LE MUR (§2) : la vague de rouge est une PROPOSITION (le cerveau gauche identifie l'impact) ; résoudre
// = valider les nouvelles specs (au-dessus du mur) ; AUCUNE vérité du DAG n'est écrite (promotion /goal).

/** Le voyant d'un impact : rouge (touché, non résolu) → vert (résolu une fois le besoin validé). */
export type ImpactVoyant = "red" | "green";

/** Une ligne d'impact pour la vue : la spec existante touchée, sa raison, et son état (résolu ?). */
export interface ImpactRow {
	/** la spec EXISTANTE (du DAG) que le besoin impacte. */
	readonly spec: ExistingSpec;
	/** la raison du cerveau gauche (pourquoi le besoin la touche). */
	readonly reason: string;
	/** résolu ? — calculé par le MÊME `impactResolved` que le DAG/la grille/le graphe (consistant). */
	readonly resolved: boolean;
	/** le voyant : rouge si non résolu, vert si résolu. */
	readonly voyant: ImpactVoyant;
}

/**
 * `needImpacts` — le CLAMP des impacts BRUTS du cerveau gauche (la vague de rouge proposée) : ne garde
 * QUE les ids qui nomment une spec EXISTANTE réelle du DAG (un id inventé est JETÉ, jamais coercé),
 * dédupliqué + ordonné (l'ordre du DAG). RÉUTILISE `validateImpacts` (FK11) — AUCUNE règle inventée.
 * PURE + TOTALE + DÉTERMINISTE : même `impactsRaw` → mêmes impacts.
 */
export function needImpacts(impactsRaw: unknown): DagImpact[] {
	return validateImpacts(impactsRaw);
}

/**
 * `impactRows` — la VUE LISTE de la vague de rouge : pour chaque impact gardé, la spec existante + sa
 * raison + son état RÉSOLU (le MÊME `impactResolved` que le DAG/la grille/le graphe → consistant
 * PARTOUT) + son voyant (rouge → vert). Tout impact dont la spec n'existe plus est ignoré (totalité).
 * PURE + TOTALE + DÉTERMINISTE : (placements, impacts) → mêmes lignes, dans l'ordre du DAG.
 */
export function impactRows(
	placements: readonly Placement[],
	impacts: readonly DagImpact[],
): ImpactRow[] {
	const rows: ImpactRow[] = [];
	for (const imp of impacts) {
		const spec = existingSpec(imp.specId);
		if (!spec) continue;
		const resolved = impactResolved([...placements], spec.level, spec.facet);
		rows.push({
			spec,
			reason: imp.reason,
			resolved,
			voyant: resolved ? "green" : "red",
		});
	}
	return rows;
}

/** Le compte rouge / vert / total d'une liste de lignes d'impact (le résumé de l'en-tête). PURE & TOTALE. */
export function impactTally(rows: readonly ImpactRow[]): {
	red: number;
	green: number;
	total: number;
} {
	let red = 0;
	let green = 0;
	for (const r of rows) {
		if (r.resolved) green++;
		else red++;
	}
	return { red, green, total: rows.length };
}

/** Tout le rouge est-il passé au vert ? (le critère de done : valider tout → 0 rouge). PURE & TOTALE. */
export function allImpactsResolved(rows: readonly ImpactRow[]): boolean {
	return rows.length > 0 && rows.every((r) => r.resolved);
}

/**
 * `validateAllPlacements` — VALIDER TOUT le besoin d'un coup : chaque placement encore proposé passe à
 * « validated » (les déjà-réalisés restent réalisés). C'est ce que « j'ai tout validé » fait — après
 * quoi `allPlacementsHandled` est vrai et TOUS les impacts se RÉSOLVENT (rouge → vert). PURE + TOTALE +
 * DÉTERMINISTE. Le mur §2 : aucune vérité écrite, c'est un état de lab (proposition).
 */
export function validateAllPlacements(placements: Placement[]): Placement[] {
	return placements.map((p) =>
		p.status === "realized"
			? p
			: ({ ...p, status: "validated" as SpecStatus } as Placement),
	);
}
