/**
 * The completeness gate — the Workbench /completeness projection source (AIDOS
 * step S12).
 *
 * THE STOP GATE (CLAUDE.md §6, KRD §29 / §74-§77, LIVRE XXII §126-§127): at Stop the
 * Go hook (back/hooks/stop) reads the current cut of mirrors ⋈ kernel, runs S06's
 * monster detector + the S12 gate, and emits a verdict — `block` on any monster
 * (BlockReason, code MONSTER), `pass` on a complete cut. Every evaluation is
 * recorded append-only in runtime.completeness_runs.
 *
 * A monster is a spec without a living mirror (`no_truth_without_mirror`) or a
 * mirror reflecting nothing (`no_orphan_mirror`, liveness=dead). A monster BLOCKS
 * Stop — that is the law this step makes mechanical.
 *
 * This module holds only the DECLARED, static projection of that gate — two
 * representative cuts (a BLOCKED cut carrying one monster of each reason, and a
 * COMPLETE cut) and a feed of recent block events — so the /completeness panel shows
 * exactly the verdict + monster set + BlockReason the Go hook produces. One source,
 * no drift.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): a static, declared registry (no clock, no
 * rng, no I/O). It mirrors the Go gate's verdicts, codes, and reasons; the
 * reproducibility mirror lib/completeness.test.ts pins them and the pure aggregator
 * (verdict ⇒ block iff the monster set is non-empty).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): the gate is enforced by the
 * harness-invoked Stop hook, never from a screen. Read-only is therefore correct —
 * there is no headless capability hidden here, there is none (rerun-on-demand is a
 * future `completeness` MCP, OQ-S12-1). It projects runtime.completeness_runs; it
 * does not re-encode the law.
 */

/** The two block codes the Stop completeness gate emits (matches completeness.go). */
export const MONSTER = "MONSTER" as const;
export const INCOMPLETE = "INCOMPLETE" as const;
export type BlockCode = typeof MONSTER | typeof INCOMPLETE;

/** The two verdicts — there is no third (matches completeness.go / the DB CHECK). */
export type Verdict = "block" | "pass";

/** The two monster reasons (matches records.MonsterReason). */
export type MonsterReason = "no_truth_without_mirror" | "no_orphan_mirror";

/** One monster in a cut's monster set. */
export interface Monster {
	reason: MonsterReason;
	/** The subject: a layer @version (no_truth) or a mirror id (orphan). */
	ref: string;
	/** The kernel kind of the monster's layer (audit). */
	kind: string;
	/** The required test_kind the layer lacks (no_truth_without_mirror only). */
	missingTestKind?: string;
	/** For an orphan: the mirror's declared liveness (always "dead"). */
	liveness?: "dead";
	/** A short, FR-first repair hint for this monster (per ADR 0011). */
	howToFix: string;
}

/** A BlockReason (matches completeness.BlockReason). */
export interface BlockReason {
	code: BlockCode;
	severity: string;
	explanation: string;
	howToFix: string[];
}

/** One recorded Stop completeness evaluation (a runtime.completeness_runs row). */
export interface CompletenessRun {
	runId: string;
	cutHash: string;
	verdict: Verdict;
	monsterCount: number;
	monsters: Monster[];
	blockReason?: BlockReason;
	at: string;
}

/**
 * The gate aggregator, mirrored from Go (Gate): block iff the monster set is
 * non-empty, pass otherwise. Pure — no third verdict. Determinism-first.
 */
export function gateVerdict(monsters: readonly Monster[]): Verdict {
	return monsters.length > 0 ? "block" : "pass";
}

const NO_TRUTH_FIX =
	"no_truth_without_mirror : écrivez un miroir VIVANT (cert_language exécutable) du test_kind requis, via idea → mirror → /goal → approbation humaine.";
const ORPHAN_FIX =
	"no_orphan_mirror : re-pointez le miroir orphelin vers une cible @version existante, ou retirez-le par lifecycle (ChangeSet + SemanticDiff, jamais une suppression directe).";

/**
 * SAMPLE_BLOCKED_CUT — a representative BLOCKED cut carrying one monster of each
 * reason. It is the cut the panel renders as the live "BLOCKED — MONSTER" verdict.
 */
export const SAMPLE_BLOCKED_CUT: CompletenessRun = {
	runId: "cr-blocked-sample",
	cutHash: "a1b2c3d4e5f60718",
	verdict: "block",
	monsterCount: 2,
	monsters: [
		{
			reason: "no_truth_without_mirror",
			ref: "checkout-button@v1",
			kind: "control",
			missingTestKind: "fixture",
			howToFix: NO_TRUTH_FIX,
		},
		{
			reason: "no_orphan_mirror",
			ref: "orphan-1",
			kind: "control",
			liveness: "dead",
			howToFix: ORPHAN_FIX,
		},
	],
	blockReason: {
		code: MONSTER,
		severity: "error",
		explanation:
			"Monstre détecté : la couche checkout-button@v1 (kind control) n'a aucun miroir vivant de test_kind requis « fixture » (no_truth_without_mirror). (et 1 autre) La loi de complétude interdit les monstres ; le Stop est bloqué tant qu'un monstre subsiste (on_fail: block).",
		howToFix: [
			NO_TRUTH_FIX,
			ORPHAN_FIX,
			"Inspectez le détail sur la route /completeness, puis relancez ; le Stop reste bloqué tant qu'un monstre subsiste.",
		],
	},
	at: "2026-05-31T16:40:00Z",
};

/**
 * SAMPLE_COMPLETE_CUT — a complete cut: every layer has a living, executable,
 * correctly-reflecting mirror. The panel renders it as "COMPLETE" with an empty
 * monster set.
 */
export const SAMPLE_COMPLETE_CUT: CompletenessRun = {
	runId: "cr-complete-sample",
	cutHash: "f0e1d2c3b4a59687",
	verdict: "pass",
	monsterCount: 0,
	monsters: [],
	at: "2026-05-31T16:42:00Z",
};

/** The feed of recent Stop block events (most recent first). */
export const SAMPLE_BLOCK_EVENTS: readonly CompletenessRun[] = [
	SAMPLE_BLOCKED_CUT,
	{
		runId: "cr-earlier-block",
		cutHash: "9988776655443322",
		verdict: "block",
		monsterCount: 1,
		monsters: [
			{
				reason: "no_orphan_mirror",
				ref: "stale-mirror-7",
				kind: "view",
				liveness: "dead",
				howToFix: ORPHAN_FIX,
			},
		],
		at: "2026-05-31T15:10:00Z",
	},
];
