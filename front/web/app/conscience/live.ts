import type {
	BlastRadius,
	CardOption,
	ConsciousnessReport,
	DecisionCard,
	DriftKind,
	PairVerdict,
	Source,
	Verdict,
} from "../../lib/conscience";
import type { Facet } from "../../lib/facetwire";
import { arr, type Decoder, isObject, num, str } from "../../lib/gateway-sdk";

/**
 * /conscience live read — the decoder over the Go conscience `reconcile` tool output (kill-twins
 * batch, ADR 0092). Kept OUT of actions.ts (a Next "use server" module may only export async
 * functions) so the parity mirror (live.test.ts) can import the PURE decoder directly.
 *
 * NEVER DOUBLE-TYPED (the cutover done-criterion): `reportDecoder` is the SINGLE runtime declaration
 * of the live report shape; the static ConsciousnessReport is the front twin's type the decoder
 * fills. The parity mirror pins the decoder == the Go `consciencesrv.reportOut` contract (kernel_id,
 * verdict, aligned, pairs[], cards[], green/red/advisory, hash), NOT a second implementation of the
 * aggregation logic (the Go conscience.Reconcile is authoritative — AUCUN NOUVEAU JUGE).
 * DETERMINISM-FIRST (§6/§8): same JSON → same verdict; a malformed payload returns null and readVia
 * falls back to the demo report.
 */

/** The closed verdict strings the report carries (the twin's overall verdict, §13.6). */
function decodeOverallVerdict(v: string): "aligned" | "drift" | null {
	return v === "aligned" || v === "drift" ? v : null;
}

/** decodePairVerdict decodes ONE Go `pairOut`. Optional fields (drift/detail/blast) tolerate
 *  absence (the Go `omitempty`). A missing required field → null (→ demo fallback). */
function decodePair(raw: unknown): PairVerdict | null {
	if (!isObject(raw)) return null;
	const source = str(raw.source);
	const facet = str(raw.facet);
	const pair = str(raw.pair);
	const verdict = str(raw.verdict);
	if (source === null || facet === null || pair === null || verdict === null) {
		return null;
	}
	if (typeof raw.soft !== "boolean") return null;
	const drift = raw.drift === undefined ? undefined : str(raw.drift);
	const detail = raw.detail === undefined ? undefined : str(raw.detail);
	const blast = raw.blast === undefined ? undefined : str(raw.blast);
	return {
		source: source as Source,
		facet: facet as Facet,
		pair,
		verdict: verdict as Verdict,
		drift: (drift ?? undefined) as DriftKind | undefined,
		detail: detail ?? undefined,
		blast: (blast ?? undefined) as BlastRadius | undefined,
		soft: raw.soft,
	};
}

/** decodeCard decodes ONE Go `cardOut`. `blast` and the `options[]`/recommendation are required;
 *  drift/detail tolerate absence. */
function decodeCard(raw: unknown): DecisionCard | null {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const kernelId = str(raw.kernel_id);
	const source = str(raw.source);
	const facet = str(raw.facet);
	const pair = str(raw.pair);
	const blast = str(raw.blast);
	const recommendation = str(raw.recommendation);
	if (
		id === null ||
		kernelId === null ||
		source === null ||
		facet === null ||
		pair === null ||
		blast === null ||
		recommendation === null
	) {
		return null;
	}
	if (typeof raw.advisory !== "boolean") return null;
	const options = arr(str)(raw.options);
	if (options === null) return null;
	const drift = raw.drift === undefined ? undefined : str(raw.drift);
	const detail = raw.detail === undefined ? undefined : str(raw.detail);
	return {
		id,
		kernel_id: kernelId,
		source: source as Source,
		facet: facet as Facet,
		pair,
		drift: (drift ?? undefined) as DriftKind | undefined,
		detail: detail ?? undefined,
		blast: blast as BlastRadius,
		options: options as CardOption[],
		recommendation: recommendation as CardOption,
		advisory: raw.advisory,
	};
}

/**
 * reportDecoder decodes the Go `reconcile` tool output (consciencesrv.reportOut: `{ ok, kernel_id,
 * verdict, aligned, pairs, cards, green, red, advisory, hash }`) into the front ConsciousnessReport.
 * The Go `aligned` bool + `hash` are advisory witnesses (the front renders the twin shape: verdict
 * aligned/drift + the counts + pairs + cards); a missing required field → null (→ demo fallback).
 */
export const reportDecoder: Decoder<ConsciousnessReport> = (raw) => {
	if (!isObject(raw)) return null;
	const kernelId = str(raw.kernel_id);
	const verdictStr = str(raw.verdict);
	const green = num(raw.green);
	const red = num(raw.red);
	const advisory = num(raw.advisory);
	if (
		kernelId === null ||
		verdictStr === null ||
		green === null ||
		red === null ||
		advisory === null
	) {
		return null;
	}
	const verdict = decodeOverallVerdict(verdictStr);
	if (verdict === null) return null;
	const pairs = arr(decodePair)(raw.pairs ?? []);
	const cards = arr(decodeCard)(raw.cards ?? []);
	if (pairs === null || cards === null) return null;
	return {
		kernel_id: kernelId,
		pairs,
		cards,
		verdict,
		green,
		red,
		advisory,
	};
};
