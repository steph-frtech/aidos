/**
 * The wall — the Workbench /wall projection source (AIDOS step S04).
 *
 * THE WALL (CLAUDE.md §2): the wall is the single permission boundary. The agent
 * writes projections (below the waterline), never kernel / mirrors / fitness
 * (above). This module holds only the DECLARED, static description of that
 * boundary — the guarded zones, and a representative BlockReason the PreToolUse
 * hook emits — so the /wall panel shows exactly what the Go hook
 * (back/hooks/pretooluse) enforces. One source, no drift.
 *
 * DETERMINISM-FIRST: a static, declared registry (no clock, no rng, no I/O). It
 * mirrors back/hooks/pretooluse/wall.go field-for-field; the reproducibility
 * mirror lib/wall.test.ts pins the zone set and the canonical block code.
 *
 * READ-ONLY: /wall is a visualization. It writes no truth and exposes no
 * capability — the wall itself is enforced by the Go hook (level 1) + the Postgres
 * GRANTs (level 2), not from a screen. ui-completeness is vacuously satisfied:
 * there is no headless capability hidden here, there is none.
 */

/** The canonical block code the PreToolUse wall emits (matches wall.go). */
export const AGENT_WRITE_ABOVE_WATERLINE =
	"AGENT_WRITE_ABOVE_WATERLINE" as const;

/** Where a zone sits relative to the waterline. */
export type WaterSide = "above" | "below";

/** A guarded or free zone the classifier knows about. */
export interface WallZone {
	/** The zone name (a truth schema, or a projection area). */
	name: string;
	/** above = truth, frozen; below = projection, free. */
	side: WaterSide;
	/** One-line role of the zone in AIDOS terms (FR-first per ADR 0011). */
	role: string;
}

// Above the line — the truth schemas the agent never writes (CLAUDE.md §1/§2).
// Mirrors back/hooks/pretooluse/wall.go `aboveWaterlineSchemas`.
export const ABOVE_ZONES: readonly WallZone[] = [
	{
		name: "kernel",
		side: "above",
		role: "les vérités gelées + leurs ASTs DSL (entités, policies, opérations…). Le cœur du vrai.",
	},
	{
		name: "mirrors",
		side: "above",
		role: "les miroirs (preuves exécutables) — le plan bicéphale du Kernel (ADR 0002).",
	},
	{
		name: "fitness",
		side: "above",
		role: "la grammaire NIVEAU 3 + la ligne de flottaison + la définition de « passé ». Lecture seule, même pour les boucles (le méta-méta).",
	},
] as const;

// Below the line — what the agent writes freely (projections, adapters, code).
export const BELOW_ZONES: readonly WallZone[] = [
	{
		name: "back/gen",
		side: "below",
		role: "le code émis (handlers Go, types TS, DDL) — projection régénérable, jamais éditée à la main.",
	},
	{
		name: "front/web",
		side: "below",
		role: "les adaptateurs du Workbench (les routes, dont cet écran).",
	},
	{
		name: "archive · changesets · dag · ideas · provenance",
		side: "below",
		role: "les schémas sous la ligne — l'agent peut y proposer (idea, ChangeSet DRAFT) ; la vérité, elle, ne s'écrit que par la porte.",
	},
] as const;

/** The shared actionable-refusal shape (matches wall.go BlockReason). */
export interface BlockReason {
	code: typeof AGENT_WRITE_ABOVE_WATERLINE;
	severity: "error";
	explanation: string;
	howToFix: readonly string[];
}

/**
 * A representative block event — the BlockReason the PreToolUse hook returns when
 * the agent attempts to write a kernel truth. Verbatim-shaped from
 * aboveWaterlineBlockReason in wall.go, so the panel shows a true refusal, not an
 * invented one. The how_to_fix always names the only door: idea → mirror → /goal.
 */
export const SAMPLE_BLOCK_EVENT: BlockReason = {
	code: AGENT_WRITE_ABOVE_WATERLINE,
	severity: "error",
	explanation:
		"Refus du mur : l'agent ne peut pas écrire au-dessus de la ligne de flottaison (kernel / mirrors / fitness). Cible refusée : « back/kernel/records/store.go ». Seul un ChangeSet approuvé, appliqué par le rôle `aidos`, écrit la vérité.",
	howToFix: [
		"Ne jamais écrire la vérité au passage : créez une idea (candidate-truth) dans le schéma ideas.",
		"Écrivez son mirror (Gherkin / property / fixture) — le rouge est le /goal.",
		"Ouvrez un /goal et obtenez l'approbation humaine : idea → mirror → /goal → approbation.",
		"Le ChangeSet approuvé est appliqué par le rôle `aidos` — la seule porte vers le noyau.",
	],
} as const;

/** Fresh copy of the above-the-line zones, in canonical order. */
export function aboveZones(): WallZone[] {
	return ABOVE_ZONES.map((z) => ({ ...z }));
}

/** Fresh copy of the below-the-line zones, in canonical order. */
export function belowZones(): WallZone[] {
	return BELOW_ZONES.map((z) => ({ ...z }));
}
