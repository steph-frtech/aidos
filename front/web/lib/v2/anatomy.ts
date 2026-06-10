/**
 * WB2-06 — le TWIN PUR de l'ANATOMIE d'un kernel : les SIX PAIRES-MIROIR autour du MUR.
 *
 * Un kernel se lit en 1-pour-1 de part et d'autre du mur (CLAUDE.md §2). AU-DESSUS du mur on
 * DÉCLARE (le côté humain, l'intention) ; EN DESSOUS la MACHINE PROUVE (le côté exécuté, vérifié).
 * Les six paires (FKE — l'anatomie d'une vérité) :
 *   1. Spec            ↔ Doc                  (ce qu'on spécifie ↔ ce qui est documenté/rendu)
 *   2. Comportement    ↔ Résultats            (le behaviour déclaré ↔ les résultats observés)
 *   3. Scénarios       ↔ Tests                (les scénarios Gherkin ↔ les tests qui les exécutent)
 *   4. Modèle          ↔ Projection           (l'entité/AST ↔ sa projection émise — Go/DDL/TS)
 *   5. Contrat         ↔ Code                 (le contrat/Pact ↔ le code qui l'honore)
 *   6. Evidence-attendue ↔ Evidence-observée  (l'évidence attendue ↔ l'évidence vraiment observée)
 *
 * VOYANT par paire (🟢/🔴/🟡), COMPUTÉ jamais déclaré (CLAUDE.md §8 « done est computé ») :
 *   - 🟢 vert  : le côté DÉCLARÉ est présent ∧ le côté PROUVÉ a PASSÉ (les deux se reflètent) ;
 *   - 🔴 rouge : le côté DÉCLARÉ est présent ∧ le côté PROUVÉ a ÉCHOUÉ (divergence — un monstre) ;
 *   - 🟡 ambre : tout le reste — déclaré sans preuve encore (pending/absent), ou rien des deux
 *               (vacuité), ou prouvé sans déclaration (orphelin). L'ambre = « pas encore réfléchi ».
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : composer l'anatomie + computer les voyants est une FONCTION
 * PURE & TOTALE — pas d'horloge, pas d'aléa, pas d'E/S, pas de LLM. Même état → mêmes voyants, même
 * ordre. Le miroir de reproductibilité lib/v2/anatomy.test.ts (fast-check) épingle : les SIX paires
 * toujours présentes et ORDONNÉES, le côté déclaré toujours AU-DESSUS du mur ∧ le prouvé EN DESSOUS,
 * la table de vérité du voyant exhaustive (déterministe), aucune paire perdue ni dupliquée.
 *
 * LE MUR (CLAUDE.md §2) : ce module PROJETTE une lecture ; il n'écrit aucune vérité. L'anatomie est
 * une projection de lecture (read-only sous le mur), jamais un kernel. Les états proviennent du store
 * de kernels (OpenQuestion documentée : synthétiques tant que le store n'expose pas ses voyants).
 */

/** Le côté d'une paire-miroir relativement au mur. */
export type WallSide = "above" | "below";

/** L'état du côté DÉCLARÉ (au-dessus du mur) : l'humain a-t-il déclaré cette face ? */
export type DeclaredState = "declared" | "absent";

/**
 * L'état du côté PROUVÉ (en dessous du mur — la machine) : la preuve a-t-elle passé / échoué /
 * pas encore tournée / pas de preuve du tout ?
 */
export type ProvenState = "pass" | "fail" | "pending" | "absent";

/** Le voyant computé d'une paire-miroir (jamais déclaré). */
export type Voyant = "green" | "red" | "amber";

/** L'identité canonique d'une des six paires-miroir (jeu CLOS, ordonné). */
export type PairKind =
	| "spec_doc"
	| "behavior_results"
	| "scenarios_tests"
	| "model_projection"
	| "contract_code"
	| "evidence";

/** Les six paires-miroir, dans leur ORDRE canonique (déclaré, jamais appris). Jeu clos. */
export const PAIR_KINDS: readonly PairKind[] = [
	"spec_doc",
	"behavior_results",
	"scenarios_tests",
	"model_projection",
	"contract_code",
	"evidence",
] as const;

export function isPairKind(s: string): s is PairKind {
	return (PAIR_KINDS as readonly string[]).includes(s);
}

/** L'ÉTAT brut d'une paire (l'entrée du twin) : ce qui est déclaré au-dessus, ce qui est prouvé en dessous. */
export interface PairState {
	readonly kind: PairKind;
	/** L'état du côté DÉCLARÉ (au-dessus du mur). */
	readonly declared: DeclaredState;
	/** L'état du côté PROUVÉ (en dessous du mur, la machine). */
	readonly proven: ProvenState;
}

/** Une face d'une paire (un côté du mur) telle que l'écran la rend. */
export interface PairFace {
	/** above = déclaré (humain) ; below = prouvé (machine, read-only). */
	readonly side: WallSide;
}

/** Une PAIRE-MIROIR computée : ses deux faces de part et d'autre du mur + son voyant. */
export interface MirrorPair {
	readonly kind: PairKind;
	/** La face DÉCLARÉE (toujours `side: "above"`). */
	readonly declared: PairFace & { readonly state: DeclaredState };
	/** La face PROUVÉE (toujours `side: "below"`, la machine). */
	readonly proven: PairFace & { readonly state: ProvenState };
	/** Le voyant computé (🟢/🔴/🟡), jamais déclaré. */
	readonly voyant: Voyant;
}

/** L'ANATOMIE computée d'un kernel : les six paires (ordonnées) + un résumé du voyant global. */
export interface Anatomy {
	readonly kernelId: string;
	/** Les six paires-miroir, dans l'ordre canonique. */
	readonly pairs: readonly MirrorPair[];
	/** Le voyant global = le pire des six (red > amber > green) — computé, jamais déclaré. */
	readonly overall: Voyant;
	/** Le compte par voyant (déterministe). */
	readonly counts: {
		readonly green: number;
		readonly red: number;
		readonly amber: number;
	};
}

/** Le diagnostic d'un état d'anatomie invalide (hors des jeux clos). */
export type AnatomyError =
	| "empty_kernel_id"
	| "pair_kind_unknown"
	| "duplicate_pair"
	| "missing_pair";

export type AnatomyResult =
	| { ok: true; anatomy: Anatomy }
	| { ok: false; errors: AnatomyError[] };

/**
 * COMPUTE le voyant d'une paire — le cœur déterministe du twin. PURE & TOTALE.
 * Table de vérité (déclaré × prouvé) :
 *   - DÉCLARÉ present ∧ PROUVÉ pass  → 🟢 vert  (les deux se reflètent) ;
 *   - DÉCLARÉ present ∧ PROUVÉ fail  → 🔴 rouge (divergence — un monstre) ;
 *   - tout le reste                  → 🟡 ambre (pas encore réfléchi : pending/absent, vacuité,
 *                                      ou prouvé-orphelin sans déclaration au-dessus).
 * Le ROUGE n'est porté QUE par un échec machine sous un côté déclaré : la machine seule décide le red.
 */
export function computeVoyant(
	declared: DeclaredState,
	proven: ProvenState,
): Voyant {
	if (declared === "declared" && proven === "pass") return "green";
	if (declared === "declared" && proven === "fail") return "red";
	return "amber";
}

/** L'ordre de gravité d'un voyant (le pire l'emporte pour le résumé global). */
function voyantRank(v: Voyant): number {
	return v === "red" ? 2 : v === "amber" ? 1 : 0;
}

/**
 * VALIDE l'entrée du twin : un kernelId non vide, exactement les six paires-miroir (le jeu clos),
 * aucune inconnue, aucune dupliquée, aucune manquante. PURE & TOTALE — même entrée → mêmes erreurs.
 * Renvoie la liste (déterministe, ordonnée) des erreurs.
 */
export function validateAnatomy(
	kernelId: string,
	states: readonly PairState[],
): AnatomyError[] {
	const errors: AnatomyError[] = [];
	if (kernelId.trim() === "") errors.push("empty_kernel_id");

	let hasUnknown = false;
	const seen = new Set<PairKind>();
	let hasDuplicate = false;
	for (const s of states) {
		if (!isPairKind(s.kind)) {
			hasUnknown = true;
			continue;
		}
		if (seen.has(s.kind)) hasDuplicate = true;
		else seen.add(s.kind);
	}
	if (hasUnknown) errors.push("pair_kind_unknown");
	if (hasDuplicate) errors.push("duplicate_pair");

	// Toutes les six paires du jeu clos doivent être présentes (1-pour-1, aucune perdue).
	const missing = PAIR_KINDS.some((k) => !seen.has(k));
	if (missing) errors.push("missing_pair");

	return errors;
}

/**
 * COMPOSE l'anatomie d'un kernel depuis l'état brut des six paires — le cœur du twin. PURE & TOTALE
 * & DÉTERMINISTE :
 *   1. valide l'entrée (kernelId, jeu clos des six paires) ; sinon → { ok:false, errors } ;
 *   2. pour chaque paire (dans l'ORDRE canonique PAIR_KINDS), pose la face DÉCLARÉE au-dessus du mur
 *      et la face PROUVÉE en dessous, et COMPUTE le voyant (computeVoyant) ;
 *   3. computE le voyant global (le pire des six) et le compte par voyant.
 * Aucune écriture, aucun LLM, aucune horloge. Même entrée → même anatomie (mêmes voyants, même ordre).
 * Invariant : exactement 6 paires, ordonnées PAIR_KINDS ; déclaré toujours `above`, prouvé `below`.
 */
export function buildAnatomy(
	kernelId: string,
	states: readonly PairState[],
): AnatomyResult {
	const errors = validateAnatomy(kernelId, states);
	if (errors.length > 0) return { ok: false, errors };

	const byKind = new Map(states.map((s) => [s.kind, s] as const));

	const pairs: MirrorPair[] = PAIR_KINDS.map((kind) => {
		// validateAnatomy a garanti la présence des six paires.
		const s = byKind.get(kind) as PairState;
		return {
			kind,
			declared: { side: "above", state: s.declared },
			proven: { side: "below", state: s.proven },
			voyant: computeVoyant(s.declared, s.proven),
		};
	});

	const counts = { green: 0, red: 0, amber: 0 };
	for (const p of pairs) counts[p.voyant] += 1;

	const overall: Voyant = pairs.reduce<Voyant>(
		(worst, p) => (voyantRank(p.voyant) > voyantRank(worst) ? p.voyant : worst),
		"green",
	);

	return {
		ok: true,
		anatomy: { kernelId, pairs, overall, counts },
	};
}

/**
 * Construit un état d'anatomie SYNTHÉTIQUE déterministe pour un kernelId — pour peupler l'écran tant
 * que le store de kernels n'expose pas ses voyants réels (OpenQuestion documentée, ne bloque pas).
 * PURE & TOTALE : même kernelId → même état (un hash stable des caractères de l'id sélectionne, par
 * paire, un couple (déclaré, prouvé) parmi des combinaisons couvrant les trois voyants).
 */
export function syntheticPairStates(kernelId: string): PairState[] {
	// Hash déterministe simple (djb2-like) — aucun aléa, aucune horloge.
	let h = 5381;
	for (let i = 0; i < kernelId.length; i++) {
		h = ((h << 5) + h + kernelId.charCodeAt(i)) >>> 0;
	}
	// Combinaisons couvrant les trois voyants (vert/rouge/ambre) de façon déterministe.
	const combos: ReadonlyArray<[DeclaredState, ProvenState]> = [
		["declared", "pass"], // 🟢
		["declared", "fail"], // 🔴
		["declared", "pending"], // 🟡
		["absent", "absent"], // 🟡
		["declared", "absent"], // 🟡
		["declared", "pass"], // 🟢
	];
	return PAIR_KINDS.map((kind, i) => {
		const [declared, proven] = combos[(h + i) % combos.length];
		return { kind, declared, proven };
	});
}
