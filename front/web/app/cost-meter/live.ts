import type { BreakerSignal, CellMeter } from "../../lib/cost-meter";
import type {
	BlockReason,
	EconomicsDecision,
	Verdict,
} from "../../lib/economics";
import { arr, type Decoder, isObject, num, str } from "../../lib/gateway-sdk";

/**
 * /cost-meter live reads — the decoders over the Go cost-meter MCP tools' output (S111; the ADR
 * 0092 batch-2 flip). Kept OUT of actions.ts (a Next "use server" module may only export async
 * functions) so the parity mirror (live.test.ts) can import the PURE decoders directly.
 *
 * NEVER DOUBLE-TYPED (the flip done-criterion): each decoder is the SINGLE runtime declaration of
 * the live wire shape; the static CellMeter / EconomicsDecision / BreakerSignal are the front
 * twin's types the decoders fill. The parity mirror pins the decoders == the Go contract
 * (costmetersrv.meterOut: cell_ref / run_count / metered_tokens / metered_ci_minutes / verdict /
 * over_axes / flagged / block_code / explanation / how_to_fix ; signalOut: trip / over_axes /
 * block_code / explanation / how_to_fix), NOT a second implementation of the metering logic (the
 * Go costmeter.MeterCell is authoritative).
 *
 * DETERMINISM-FIRST (§6/§8): same JSON → same verdict; a malformed payload returns null and readVia
 * falls back to the demo verdict. THE WALL (§2): these are below-the-line reads — the budget is
 * DECLARED, read-only; no truth is written.
 */

/** The closed §66.3 verdict set the Go server emits, decoded as the front Verdict enum. */
const VERDICTS = [
	"within_budget",
	"over_budget_justified",
	"over_budget_flagged",
] as const;

function decodeVerdict(raw: unknown): Verdict | null {
	const s = str(raw);
	if (s === null) return null;
	return (VERDICTS as readonly string[]).includes(s) ? (s as Verdict) : null;
}

/**
 * decodeBlockReason rebuilds the front BlockReason from the FLAT Go advisory triplet (block_code /
 * explanation / how_to_fix) the meterOut / signalOut carry when flagged. The Go server emits these
 * three fields at the output root (never a nested object), so an absent block_code → no BlockReason
 * (a within-budget / justified cell). The front BlockReason.severity is always "blocking" (the
 * advisory is a blocking-severity BlockReason in the S13 shape); the Go server only emits the code
 * when over_budget_flagged.
 */
function decodeBlockReason(o: Record<string, unknown>): BlockReason | null {
	const code = str(o.block_code);
	if (code === null || code === "") return null;
	const explanation = str(o.explanation) ?? "";
	const howToFix = arr(str)(o.how_to_fix ?? []) ?? [];
	return { code, severity: "blocking", explanation, howToFix };
}

/** decodeOverAxes — the over-budget axes list (ubiquitous language); an absent list → []. */
function decodeOverAxes(raw: unknown): string[] {
	return arr(str)(raw ?? []) ?? [];
}

/**
 * MeteredRead is the decoded `cost_meter_cell` read — the CellMeter (the COUNTED aggregate) paired
 * with its §66.3 EconomicsDecision. This is the SINGLE shape both the live decoder and the demo
 * fallback produce, so the panel display is identical whether source is "live" or "demo".
 */
export interface MeteredRead {
	cellMeter: CellMeter;
	decision: EconomicsDecision;
}

/**
 * meterDecoder decodes the Go `cost_meter_cell` meterOut into the front MeteredRead. The metered
 * cost is the COUNTED sum (metered_tokens / metered_ci_minutes); the verdict is the deterministic
 * §66.3 switch. The mutation-runtime + human-review axes are not produced by an agent run and stay
 * zero (the Go meterOut counts only tokens + ci_minutes — fabricating the other two would be a
 * monster). A missing required field → null (→ demo fallback).
 */
export const meterDecoder: Decoder<MeteredRead> = (raw) => {
	if (!isObject(raw)) return null;
	const cellRef = str(raw.cell_ref);
	const runCount = num(raw.run_count);
	const tokens = num(raw.metered_tokens);
	const ciMinutes = num(raw.metered_ci_minutes);
	const verdict = decodeVerdict(raw.verdict);
	if (
		cellRef === null ||
		runCount === null ||
		tokens === null ||
		ciMinutes === null ||
		verdict === null
	) {
		return null;
	}
	const cellMeter: CellMeter = {
		cellRef,
		runCount,
		// The aggregate RunMeter: tokens + ciMinutes are the COUNTED sums; turns + wallClockSecs
		// are not part of the §66.3 cost projection (the Go meterOut omits them) → 0.
		meter: { tokens, turns: 0, ciMinutes, wallClockSecs: 0 },
		cost: {
			llmTokens: tokens,
			ciMinutes,
			mutationRuntimeSeconds: 0,
			humanReviewMinutes: 0,
		},
	};
	const decision: EconomicsDecision = {
		cellRef,
		verdict,
		overAxes: decodeOverAxes(raw.over_axes),
		blockReason: decodeBlockReason(raw),
	};
	return { cellMeter, decision };
};

/**
 * signalDecoder decodes the Go `cost_disjoncteur_signal` signalOut into the front BreakerSignal.
 * `trip` is the over-budget signal (true ONLY for over_budget_flagged); the over-budget axes + the
 * advisory BlockReason ride verbatim. A missing `trip` → null (→ demo fallback).
 */
export const signalDecoder: Decoder<BreakerSignal> = (raw) => {
	if (!isObject(raw)) return null;
	const trip = raw.trip;
	if (typeof trip !== "boolean") return null;
	return {
		trip,
		overAxes: decodeOverAxes(raw.over_axes),
		blockReason: decodeBlockReason(raw),
	};
};
