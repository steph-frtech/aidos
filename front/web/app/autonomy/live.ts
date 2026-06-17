import type { EnforceSnapshot, PromoteSnapshot } from "../../lib/autonomy-data";
import { arr, type Decoder, isObject, num, str } from "../../lib/gateway-sdk";

/**
 * /autonomy live read — the decoders over the Go autonomy `enforce` + `promote` tool outputs
 * (kill-twins batch-2, ADR 0092). Kept OUT of actions.ts (a Next "use server" module may only
 * export async functions) so the parity mirror (live.test.ts) can import the PURE decoders directly.
 *
 * NEVER DOUBLE-TYPED (the cutover done-criterion): `enforceDecoder` / `promoteDecoder` are the
 * SINGLE runtime declaration of the live snapshot shapes; the static EnforceSnapshot / PromoteSnapshot
 * (in lib/autonomy-data) are the front projections the decoders fill. The parity mirror pins the
 * decoders == the Go contracts (autonomysrv.enforceOut: { ok, allowed, declared, required, critical,
 * code?, severity?, explanation?, how_to_fix?[] } ; autonomysrv.promoteOut: { ok, current, promoted,
 * earned, window_n, min_evidence, history_len }), NOT a second implementation of the enforcement /
 * promotion logic (the Go autonomy.Enforce / autonomy.PromotionFromHistory are authoritative).
 * DETERMINISM-FIRST (§6/§8): same JSON → same verdict; a malformed payload returns null and readVia
 * falls back to the demo snapshot.
 */

/**
 * enforceDecoder decodes the Go `enforce` tool output (autonomysrv.enforceOut) into the front
 * EnforceSnapshot. `ok` is an advisory witness; the BlockReason fields (code/severity/explanation/
 * how_to_fix) are present only on a REFUSAL (Go `omitempty`), so they tolerate absence. A missing
 * required field (allowed / declared / required / critical) → null (→ demo fallback).
 */
export const enforceDecoder: Decoder<EnforceSnapshot> = (raw) => {
	if (!isObject(raw)) return null;
	const declared = str(raw.declared);
	const required = str(raw.required);
	if (declared === null || required === null) return null;
	if (typeof raw.allowed !== "boolean") return null;
	if (typeof raw.critical !== "boolean") return null;
	const snap: EnforceSnapshot = {
		allowed: raw.allowed,
		declared,
		required,
		critical: raw.critical,
	};
	// the BlockReason witnesses ride only on a refusal.
	const code = raw.code === undefined ? undefined : str(raw.code);
	const severity = raw.severity === undefined ? undefined : str(raw.severity);
	const explanation =
		raw.explanation === undefined ? undefined : str(raw.explanation);
	const howToFix =
		raw.how_to_fix === undefined ? undefined : arr(str)(raw.how_to_fix);
	if (code !== null && code !== undefined) snap.code = code;
	if (severity !== null && severity !== undefined) snap.severity = severity;
	if (explanation !== null && explanation !== undefined)
		snap.explanation = explanation;
	if (howToFix !== null && howToFix !== undefined) snap.howToFix = howToFix;
	return snap;
};

/**
 * promoteDecoder decodes the Go `promote` tool output (autonomysrv.promoteOut) into the front
 * PromoteSnapshot. `ok` is an advisory witness; current / promoted / earned / window_n /
 * min_evidence / history_len are required (a missing one → null → demo fallback).
 */
export const promoteDecoder: Decoder<PromoteSnapshot> = (raw) => {
	if (!isObject(raw)) return null;
	const current = str(raw.current);
	const promoted = str(raw.promoted);
	const minEvidence = str(raw.min_evidence);
	const windowN = num(raw.window_n);
	const historyLen = num(raw.history_len);
	if (
		current === null ||
		promoted === null ||
		minEvidence === null ||
		windowN === null ||
		historyLen === null
	) {
		return null;
	}
	if (typeof raw.earned !== "boolean") return null;
	return {
		current,
		promoted,
		earned: raw.earned,
		windowN,
		minEvidence,
		historyLen,
	};
};
