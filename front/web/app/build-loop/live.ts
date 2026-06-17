import type { Decision } from "../../lib/build-loop";
import { arr, type Decoder, isObject, str } from "../../lib/gateway-sdk";

/**
 * /build-loop live read — the decoder over the Go build-loop `buildloop_terminate` tool output
 * (S83; ADR 0092 batch-2 kill-twins flip). Kept OUT of actions.ts (a Next "use server" module may
 * only export async functions) so the parity mirror (live.test.ts) can import the PURE decoder
 * directly.
 *
 * NEVER DOUBLE-TYPED (the S59 done-criterion): `decisionDecoder` is the SINGLE runtime declaration
 * of the live termination Decision shape; the static `Decision` is the front twin's type the
 * decoder fills. The parity mirror pins the decoder == the Go `terminateOutput` contract
 * (verdict / block_code / over_budget_axes), NOT a second implementation of the termination logic
 * (the Go buildloop.Terminate is authoritative). DETERMINISM-FIRST (§6/§8): same JSON → same
 * Decision; a malformed payload returns null and readVia falls back to the demo Decision.
 */

/** The closed three-value verdict set — pinned to the Go buildloop.Verdicts. */
const VERDICTS = new Set(["continue", "green", "no_progress"]);

/**
 * decisionDecoder decodes the Go `buildloop_terminate` tool output (terminateOutput:
 * `{ verdict, block_code?, explanation?, how_to_fix?, over_budget_axes? }`) into the front
 * `Decision`. The `verdict` must be one of the closed set; `block_code` is "" when green/continue
 * (a green Decision carries no block code); the `over_budget_axes` witness list defaults to []
 * when absent (a non-budget halt). A missing / out-of-set verdict → null (→ demo fallback).
 */
export const decisionDecoder: Decoder<Decision> = (raw) => {
	if (!isObject(raw)) return null;
	const verdict = str(raw.verdict);
	if (verdict === null || !VERDICTS.has(verdict)) return null;
	const blockCode = raw.block_code === undefined ? "" : str(raw.block_code);
	if (blockCode === null) return null;
	const overBudgetAxes =
		raw.over_budget_axes === undefined
			? []
			: (arr(str)(raw.over_budget_axes) ?? null);
	if (overBudgetAxes === null) return null;
	return {
		verdict: verdict as Decision["verdict"],
		blockCode,
		overBudgetAxes,
	};
};
