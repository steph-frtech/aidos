import {
	arr,
	type Decoder,
	isObject,
	num,
	type Source,
	str,
} from "../../lib/gateway-sdk";

/**
 * /kernel-debt live MUTATION read MODEL (the PURE part of the S59 cutover, testable in
 * isolation — ADR 0092 kill-twins batch).
 *
 * This module holds the never-double-typed Decoder for the mutation-runner `run_mutation` tool
 * + the deterministic demo verdict. It imports NOTHING server-only, so the parity mirror
 * (live.test.ts) can decode a Go-sample output without a server runtime. The Server Action
 * (liveActions.ts) wires panelScope + readVia around these.
 *
 * ── WHY THIS READ ON THIS PANEL ──────────────────────────────────────────────────────
 * The panel renders the KernelDebt LEDGER (§S41): the action-capable KernelDebtPanel re-runs the
 * pure twin (Scan + SuggestTrim) on a chosen scenario and groups the debt under ORPHAN MIRRORS /
 * STALE FIXTURES / SURVIVING MUTANTS — that worked example STAYS (the suggest-only ledger, above
 * the line). This adds the LIVE mutation verdict the engine actually produced (the §40 run): the
 * verdict, score vs declared threshold, and the surviving mutants (the third debt category, but
 * here from the engine, not the fixture). Surfacing it makes the debt's SURVIVING-MUTANTS input
 * live (strictly additive cutover, the proven mutation-score / project-dag pattern).
 *
 * ── THE WALL (CLAUDE.md §2/§8) ───────────────────────────────────────────────────────
 * run_mutation invokes the frozen runner, gates the report against the DECLARED threshold (read
 * SELECT-only from `fitness` — the agent is graded by it, never authors it), and appends the run
 * (below the line). The action-capable suggest-only ledger above stays the demo; this section
 * surfaces the LIVE verdict + survivors. A read of a below-the-line run; trim PROPOSES, it never
 * deletes — this module writes nothing.
 *
 * ── DETERMINISM-FIRST (§6/§8) ────────────────────────────────────────────────────────
 * The decoder is a pure total function; a malformed payload is rejected (→ demo fallback),
 * never coerced. The densimètre is Go (gremlins/Stryker, authoritative); this module decodes its
 * run contract, it is NOT a second mutation runner.
 *
 * ── THE Go CONTRACT (mutationrunnersrv.runOutput) ────────────────────────────────────
 * `{ verdict, score, threshold, block_code?, surviving_mutants?: [{ file, line, operator,
 *    gap? }] }`. `block_code`/`gap` are omitempty; `surviving_mutants` omitted when none survive.
 */

/** A surviving mutant — the mutationrunnersrv.survivorOut shape, decoded ONCE. */
export interface Survivor {
	file: string;
	line: number;
	operator: string;
	gap: string | null;
}

/** The decoder's structural output — the SINGLE declaration of the run_mutation shape. */
export interface MutationRunData {
	verdict: string;
	score: number;
	threshold: number;
	blockCode: string | null;
	survivingMutants: Survivor[];
}

export interface LiveMutationView extends MutationRunData {
	source: Source;
}

const survivorDecoder: Decoder<Survivor> = (raw) => {
	if (!isObject(raw)) return null;
	const file = str(raw.file);
	const line = num(raw.line);
	const operator = str(raw.operator);
	if (file === null || line === null || operator === null) return null;
	// gap is omitempty (absent ⇒ no diagnosed gap) — default to null.
	const gap = raw.gap === undefined ? null : str(raw.gap);
	if (gap === null && raw.gap !== undefined) return null;
	return { file, line, operator, gap };
};

/**
 * mutationDecoder decodes the mutation-runner `run_mutation` output
 * `{ verdict, score, threshold, block_code?, surviving_mutants? }` (mutationrunnersrv.runOutput)
 * ONCE — never double-typed. A malformed payload → null (the caller falls back to the demo
 * verdict). The omitempty `block_code` defaults to null; `surviving_mutants` defaults to [].
 */
export const mutationDecoder: Decoder<MutationRunData> = (raw) => {
	if (!isObject(raw)) return null;
	const verdict = str(raw.verdict);
	const score = num(raw.score);
	const threshold = num(raw.threshold);
	if (verdict === null || score === null || threshold === null) return null;
	const blockCode = raw.block_code === undefined ? null : str(raw.block_code);
	if (blockCode === null && raw.block_code !== undefined) return null;
	const survivingMutants =
		raw.surviving_mutants === undefined
			? []
			: arr(survivorDecoder)(raw.surviving_mutants);
	if (survivingMutants === null) return null;
	return { verdict, score, threshold, blockCode, survivingMutants };
};

/**
 * The deterministic demo verdict — a passing run at the declared 0.80 bar with one surviving
 * mutant (the third debt category, made concrete). No clock, no rng, no I/O.
 */
export const DEMO_MUTATION: MutationRunData = {
	verdict: "passed",
	score: 0.86,
	threshold: 0.8,
	blockCode: null,
	survivingMutants: [
		{
			file: "back/kernel/expr/eval.go",
			line: 142,
			operator: "CONDITIONALS_BOUNDARY",
			gap: "aucun miroir ne couvre la borne >= vs >",
		},
	],
};
