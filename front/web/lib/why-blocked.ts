/**
 * The BlockReason projection — the Workbench /why-blocked source (AIDOS step S13).
 *
 * BLOCKREASON (CLAUDE.md §2, KRD §44.5): every KRD refusal is an actionable
 * BlockReason — a code, a severity, a human explanation, and a non-empty how_to_fix
 * resolution path. "Un blocage KRD doit toujours fournir un chemin de résolution."
 * A wall without a BlockReason becomes a prison.
 *
 * This module is the DECLARED, static projection of the Go package
 * back/runtime/blockreason — one BlockReason per code of the closed enum — so the
 * /why-blocked panel renders exactly what `aidos explain <CODE>` renders (same
 * fields, same order). One source, no drift.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): a static, declared registry (no clock, no
 * rng, no I/O). It mirrors the Go enum's codes, severity, and fix tokens; the
 * reproducibility mirror lib/why-blocked.test.ts pins the prison-forbidding
 * invariant (every code has a non-empty fix path) and the canonical fix tokens.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): a BlockReason is produced at refusal
 * time by sites that already exist (the wall, completeness, scope/authority checks);
 * /why-blocked renders it, it does not erect a wall (S13 is descriptive, not a rule).
 * There is no headless capability hidden here — there is none. Live block fetch is a
 * future MCP (OpenQuestion OQ-S13-fetch).
 */

/** The closed BlockReason code enum (matches blockreason.go Code). */
export const MISSING_MIRROR = "MISSING_MIRROR" as const;
export const MISSING_AUTHORITY = "MISSING_AUTHORITY" as const;
export const OUT_OF_SCOPE = "OUT_OF_SCOPE" as const;
export const AGENT_WRITE_ABOVE_WATERLINE =
	"AGENT_WRITE_ABOVE_WATERLINE" as const;

export type BlockCode =
	| typeof MISSING_MIRROR
	| typeof MISSING_AUTHORITY
	| typeof OUT_OF_SCOPE
	| typeof AGENT_WRITE_ABOVE_WATERLINE;

/** The severity enum — KRD §44.5 uses `blocking`; the set is closed. */
export type Severity = "blocking";

/** A BlockReason (matches blockreason.BlockReason). */
export interface BlockReason {
	code: BlockCode;
	severity: Severity;
	explanation: string;
	/** The resolution path — always length >= 1 (a code with an empty path is the prison). */
	howToFix: string[];
}

/**
 * BLOCK_REASONS — the canonical registry, in the same canonical order as
 * blockreason.Codes(). The how_to_fix tokens are grounded in KRD §44.5
 * (write_mirror, assign_authority, rerun aidos check). OUT_OF_SCOPE names the
 * in-scope target or its owner generically (TruthScope lands at S14; no fabricated
 * owner — OpenQuestion OQ-S13-scope).
 */
export const BLOCK_REASONS: readonly BlockReason[] = [
	{
		code: MISSING_MIRROR,
		severity: "blocking",
		explanation:
			"La vérité visée n'a pas de miroir vivant : un comportement sans preuve BDD est un monstre (loi de complétude, KRD §29). Aucune ligne de code sans scénario rouge d'abord.",
		howToFix: [
			"write_mirror : créez le miroir (Gherkin / property / fixture) de la vérité — le rouge est le /goal.",
			"assign_authority : faites approuver le miroir par l'autorité du sous-graphe (idea → mirror → /goal → approbation).",
			"rerun aidos check : rejouez le set rouge ; le blocage se lève quand le miroir devient vivant.",
		],
	},
	{
		code: MISSING_AUTHORITY,
		severity: "blocking",
		explanation:
			"Le changement exige une autorité qui n'a pas été assignée : nul ne peut figer cette vérité sans le détenteur d'autorité du sous-graphe affecté (AuthorityGraph).",
		howToFix: [
			"assign_authority : identifiez et assignez l'autorité requise pour le sous-graphe affecté.",
			"Faites approuver le ChangeSet par cette autorité — une autorité manquante n'est jamais contournée.",
			"rerun aidos check : rejouez le set rouge une fois l'autorité assignée.",
		],
	},
	{
		code: OUT_OF_SCOPE,
		severity: "blocking",
		explanation:
			"L'écriture vise une couche hors du TruthScope déclaré : le contexte est compilé, pas accumulé — un changement reste dans son périmètre (scope) ou passe par son propriétaire (owner).",
		howToFix: [
			"Routez le changement vers la cible in-scope (l'owner / le propriétaire du périmètre déclaré).",
			"Si la cible doit changer de périmètre, ouvrez un /goal de re-scoping (rescope) auprès du scope owner.",
			"rerun aidos check : rejouez le set rouge une fois le changement ramené dans le périmètre.",
		],
	},
	{
		code: AGENT_WRITE_ABOVE_WATERLINE,
		severity: "blocking",
		explanation:
			"Refus du mur : l'agent ne peut pas écrire au-dessus de la ligne de flottaison (kernel / mirrors / fitness). Seul un ChangeSet approuvé, appliqué par le rôle `aidos`, écrit la vérité.",
		howToFix: [
			"write_mirror : ne jamais écrire la vérité au passage — créez une idea puis son miroir (le rouge est le /goal).",
			"assign_authority : ouvrez un /goal et obtenez l'approbation humaine (idea → mirror → /goal → approbation).",
			"rerun aidos check : le ChangeSet approuvé est appliqué par le rôle `aidos`, la seule porte vers le noyau.",
		],
	},
] as const;

/** Lookup a BlockReason by code; undefined for an unknown code (invents nothing). */
export function lookupBlockReason(code: string): BlockReason | undefined {
	return BLOCK_REASONS.find((r) => r.code === code);
}

/** The three canonical S13 codes shown first on /why-blocked. */
export const CANONICAL_CODES: readonly BlockCode[] = [
	MISSING_MIRROR,
	MISSING_AUTHORITY,
	OUT_OF_SCOPE,
] as const;
