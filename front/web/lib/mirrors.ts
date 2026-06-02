/**
 * The cliquet — the Workbench /mirrors projection source (AIDOS step S05).
 *
 * THE CLIQUET (KRD iteration 3): replay every materialized mirror, compare each
 * verdict to the recorded baseline, and reject the merge the moment a
 * baseline-green mirror is red on the candidate. This module holds the DECLARED
 * demo dataset (two candidate scenarios) and a PURE port of the Go cliquet core
 * (back/mcp/mirror-runner/regression.go: Regressed / Verdict / Decide), so the
 * /mirrors panel shows exactly what the Go runner computes. One decision, no
 * drift.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6): computeRatchet is a pure total function —
 * same input → same output, regressed set sorted by mirror id. The reproducibility
 * mirror lib/mirrors.test.ts pins it field-for-field against the Go core's cases.
 *
 * THE WALL (CLAUDE.md §2): the cliquet reads the mirror set and writes only its
 * own run-log (runtime.mirror_runs, BELOW the waterline). It never writes truth.
 * The /mirrors panel is action-capable (a control runs the cliquet) but that
 * action only recomputes the verdict over the run-log — no truth is written from
 * the screen.
 */

/** The BlockReason code the ci-ratchet hook returns (matches regression.go). */
export const RED_REGRESSION = "RED_REGRESSION" as const;

/** A mirror's verdict — exactly two values (matches Go Status). */
export type Status = "green" | "red";

/** The merge verdict (matches Go MergeVerdict). */
export type MergeVerdict = "ALLOWED" | "REJECTED";

/** One mirror's verdict, at the baseline or on the candidate. */
export interface MirrorVerdict {
	mirrorId: string;
	version: string;
	contentHash: string;
	status: Status;
}

/** One baseline-green mirror that is red on the candidate (matches Go). */
export interface Regression {
	mirrorId: string;
	version: string;
	contentHash: string;
	baselineStatus: "green";
	candidateStatus: "red";
}

/** The cliquet outcome for a candidate against its baseline. */
export interface RatchetResult {
	verdict: MergeVerdict;
	regressed: Regression[];
	/** ids of every mirror in the regressed set (for the BlockReason feed). */
	regressedIds: string[];
}

/**
 * regressed computes the regressed set — every mirror green at baseline and red
 * on the candidate — sorted by mirror id. Pure port of Go Regressed().
 *
 *  - a mirror absent from the candidate is NOT a regression (not observed);
 *  - a mirror red at baseline and red now is NOT a regression (already broken);
 *  - a mirror absent from the baseline (new) is NOT a regression.
 */
export function regressed(
	baseline: MirrorVerdict[],
	candidate: MirrorVerdict[],
): Regression[] {
	const cand = new Map(candidate.map((c) => [c.mirrorId, c]));
	const out: Regression[] = [];
	for (const b of baseline) {
		if (b.status !== "green") continue;
		const c = cand.get(b.mirrorId);
		if (!c) continue;
		if (c.status === "red") {
			out.push({
				mirrorId: b.mirrorId,
				version: c.version,
				contentHash: c.contentHash,
				baselineStatus: "green",
				candidateStatus: "red",
			});
		}
	}
	out.sort((a, b) =>
		a.mirrorId < b.mirrorId ? -1 : a.mirrorId > b.mirrorId ? 1 : 0,
	);
	return out;
}

/** computeRatchet decides the merge verdict. Pure port of Go Decide(). */
export function computeRatchet(
	baseline: MirrorVerdict[],
	candidate: MirrorVerdict[],
): RatchetResult {
	const reg = regressed(baseline, candidate);
	return {
		verdict: reg.length === 0 ? "ALLOWED" : "REJECTED",
		regressed: reg,
		regressedIds: reg.map((r) => r.mirrorId),
	};
}

// ── The declared demo dataset (no clock, no rng, no I/O) ─────────────────────

/** A living mirror in the demo inventory. */
export interface MirrorRow {
	mirrorId: string;
	version: string;
	contentHash: string;
	reflects: string;
}

/** The demo mirror inventory — the AIDOS mirrors S00..S05 have shipped so far. */
export const MIRROR_INVENTORY: readonly MirrorRow[] = [
	{
		mirrorId: "S01-content-store",
		version: "v1",
		contentHash: "a1c0",
		reflects: "archive.content-store",
	},
	{
		mirrorId: "S02-krdcore-records",
		version: "v1",
		contentHash: "b2d1",
		reflects: "kernel.records",
	},
	{
		mirrorId: "S03-cli-aidos",
		version: "v1",
		contentHash: "c3e2",
		reflects: "runtime.cli",
	},
	{
		mirrorId: "S04-the-wall",
		version: "v1",
		contentHash: "d4f3",
		reflects: "runtime.wall",
	},
	{
		mirrorId: "S05-ci-ratchet",
		version: "v1",
		contentHash: "e5a4",
		reflects: "mirror.ci-ratchet",
	},
] as const;

/** The baseline: every mirror green at the merge base. */
export const BASELINE: readonly MirrorVerdict[] = MIRROR_INVENTORY.map((m) => ({
	mirrorId: m.mirrorId,
	version: m.version,
	contentHash: m.contentHash,
	status: "green" as const,
}));

/** The two declared candidate scenarios the /mirrors control toggles between. */
export type Scenario = "all-green" | "regressed";

/** candidateFor returns the candidate verdict set for a declared scenario. */
export function candidateFor(scenario: Scenario): MirrorVerdict[] {
	return MIRROR_INVENTORY.map((m) => ({
		mirrorId: m.mirrorId,
		version: m.version,
		contentHash: m.contentHash,
		// In the "regressed" scenario, the wall mirror is reddened (green→red).
		status:
			scenario === "regressed" && m.mirrorId === "S04-the-wall"
				? ("red" as const)
				: ("green" as const),
	}));
}

/** The BlockReason the panel renders when the verdict is REJECTED. */
export interface BlockReasonView {
	code: typeof RED_REGRESSION;
	severity: "error";
	regressedIds: string[];
}

/** blockReasonFor builds the BlockReason view from a result, or null if ALLOWED. */
export function blockReasonFor(result: RatchetResult): BlockReasonView | null {
	if (result.verdict !== "REJECTED") return null;
	return {
		code: RED_REGRESSION,
		severity: "error",
		regressedIds: result.regressedIds,
	};
}
