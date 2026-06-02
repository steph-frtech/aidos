// Determinism-first twin of back/runtime/sensors/mutation.Gate (KRD §19/§43/§59.8).
// This is a PURE function of (report, threshold) — no clock, no rng, no I/O — so
// /mutation-score can re-run the gate on a selected scenario and render the EXACT
// verdict the Go gate computes. The score denominator (ADR 0030: killed/(total −
// not_covered), timeout counts as a kill) and the two block codes mirror the Go
// package; fast-check (lib/mutation.test.ts) pins the twin's invariants.
//
// READ-ONLY on the threshold (the wall, CLAUDE.md §2/§8): the twin RECEIVES the
// declared bar as an input (read SELECT-only from fitness above the line) — it
// never authors it. A missing bar ⇒ MISSING_THRESHOLD, never a self-chosen pass.

export type Verdict = "pass" | "block";

export type MutationCode = "MISSING_THRESHOLD" | "UNPARSABLE_REPORT";

export interface BlockReason {
	code: MutationCode;
	severity: "blocking";
	explanation: string;
	howToFix: string[];
}

export interface SurvivingMutant {
	file: string;
	line: number;
	operator: string;
	gap?: string;
}

export interface MutationReport {
	scope: string;
	runner: string;
	killed: number;
	survived: number;
	timedOut: number;
	notCovered: number;
	total: number;
	survivingMutants: SurvivingMutant[];
}

export interface Gated {
	verdict: Verdict;
	score: number;
	threshold: number;
	survivingMutants: SurvivingMutant[];
	blockReason?: BlockReason;
}

const BLOCK_REASONS: Record<MutationCode, BlockReason> = {
	MISSING_THRESHOLD: {
		code: "MISSING_THRESHOLD",
		severity: "blocking",
		explanation:
			"the mutation gate was given no declared threshold; it does not invent its own bar (the agent never authors the fitness it is graded against)",
		howToFix: [
			"read the mutation-score threshold SELECT-only from the fitness schema",
			"engrave the threshold above the waterline via an approved ChangeSet (the aidos writer role), never from the agent",
			"pass the read threshold into Gate(report, threshold)",
		],
	},
	UNPARSABLE_REPORT: {
		code: "UNPARSABLE_REPORT",
		severity: "blocking",
		explanation:
			"the mutation report has no coverable mutant (or could not be parsed); a score cannot be computed, so the gate blocks rather than assume a silent 1.0",
		howToFix: [
			"check the gremlins / StrykerJS run produced a parsable report with at least one coverable mutant",
			"add coverage so there are mutants to kill, then re-run the mutation sensor",
			"treat an unparsable run as a failure to surface, never as a pass",
		],
	},
};

/** coverable = total − not_covered (ADR 0030): uncovered mutants excluded. */
function coverable(r: MutationReport): number {
	return r.total - r.notCovered;
}

/** kills = killed + timed_out (a timeout counts as caught). */
function kills(r: MutationReport): number {
	return r.killed + r.timedOut;
}

/**
 * score(report) — killed/(total − not_covered) clamped to [0,1]. Returns null
 * when there is no coverable mutant (the gate then BLOCKs, never a silent 1.0).
 */
export function score(r: MutationReport): number | null {
	const denom = coverable(r);
	if (denom <= 0) return null;
	let s = kills(r) / denom;
	if (s < 0) s = 0;
	if (s > 1) s = 1;
	return s;
}

/**
 * gate(report, threshold) — the pure, total, deterministic mirror of the Go Gate.
 * `threshold` is the declared bar read from fitness; `null` ⇒ MISSING_THRESHOLD
 * (never a self-chosen default). A no-coverable-mutant report or a bar outside
 * [0,1] ⇒ UNPARSABLE_REPORT.
 */
export function gate(report: MutationReport, threshold: number | null): Gated {
	if (threshold === null || threshold === undefined) {
		return {
			verdict: "block",
			score: 0,
			threshold: 0,
			survivingMutants: report.survivingMutants,
			blockReason: BLOCK_REASONS.MISSING_THRESHOLD,
		};
	}
	if (threshold < 0 || threshold > 1 || Number.isNaN(threshold)) {
		return {
			verdict: "block",
			score: 0,
			threshold,
			survivingMutants: report.survivingMutants,
			blockReason: BLOCK_REASONS.UNPARSABLE_REPORT,
		};
	}
	const s = score(report);
	if (s === null) {
		return {
			verdict: "block",
			score: 0,
			threshold,
			survivingMutants: report.survivingMutants,
			blockReason: BLOCK_REASONS.UNPARSABLE_REPORT,
		};
	}
	if (s >= threshold) {
		return { verdict: "pass", score: s, threshold, survivingMutants: [] };
	}
	return {
		verdict: "block",
		score: s,
		threshold,
		survivingMutants: report.survivingMutants,
	};
}
