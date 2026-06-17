import type {
	BlockReason,
	PairReason,
	PairVerdict,
} from "../../lib/context-map";
import type { CheckCallVerdict } from "../../lib/context-map-data";
import { arr, type Decoder, isObject, str } from "../../lib/gateway-sdk";

/**
 * /context-map live reads — the decoders over the Go context-map MCP outputs (S101; the ADR 0092
 * batch-4B flip). Kept OUT of actions.ts (a Next "use server" module may only export async functions) so
 * the decoders are PURE importable functions.
 *
 * NEVER DOUBLE-TYPED (the flip done-criterion): these decoders are the SINGLE runtime declaration of the
 * live wire shape; the static PairVerdict / BlockReason / CheckCallVerdict are the twin's types they
 * fill. They pin the decoder == the Go contextmapsrv contract (verifyPairOutput {ok, verdict},
 * verifyAllOutput {ok, verdicts[]}, checkCallOutput {ok, allowed, block{code,message,how_to_fix}}) — NOT
 * a second implementation of the pact-verify logic (the Go contextmap is authoritative — the verifier is
 * an algorithm, never an LLM).
 *
 * DETERMINISM-FIRST (§6/§8): same JSON → same verdict; a malformed payload returns null and readVia falls
 * back to the demo. THE WALL (§2): the reads are below-the-line — they compute VALUES, write no truth.
 */

const PAIR_REASONS: readonly PairReason[] = [
	"HONORED",
	"NO_INTERACTION",
	"UNKNOWN_CELL",
	"PATH_MISMATCH",
	"CONSUMER_FIELD_UNPUBLISHED",
	"STATUS_MISMATCH",
];

function decodeVerdict(raw: unknown): PairVerdict | null {
	if (!isObject(raw)) return null;
	const consumer = str(raw.consumer);
	const provider = str(raw.provider);
	const reason = str(raw.reason);
	if (consumer === null || provider === null || reason === null) return null;
	if (!(PAIR_REASONS as readonly string[]).includes(reason)) return null;
	if (typeof raw.honored !== "boolean") return null;
	const detail = str(raw.detail);
	const v: PairVerdict = {
		consumer,
		provider,
		honored: raw.honored,
		reason: reason as PairReason,
	};
	if (detail !== null && detail !== "") v.detail = detail;
	return v;
}

/** verifyPairDecoder decodes the Go `verifyPairOutput` ({ ok, verdict }) into a PairVerdict. */
export const verifyPairDecoder: Decoder<PairVerdict> = (
	raw: unknown,
): PairVerdict | null => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	return decodeVerdict(raw.verdict);
};

/** verifyAllDecoder decodes the Go `verifyAllOutput` ({ ok, verdicts[] }) into the verdict list. */
export const verifyAllDecoder: Decoder<PairVerdict[]> = (
	raw: unknown,
): PairVerdict[] | null => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	return arr(decodeVerdict)(raw.verdicts);
};

/**
 * checkCallDecoder decodes the Go `checkCallOutput` ({ ok, allowed, block{code,message,how_to_fix} }) —
 * mapping the snake_case how_to_fix to the twin's camelCase BlockReason.howToFix.
 */
export const checkCallDecoder: Decoder<CheckCallVerdict> = (
	raw: unknown,
): CheckCallVerdict | null => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	if (typeof raw.allowed !== "boolean") return null;
	if (raw.allowed) return { allowed: true };
	if (!isObject(raw.block)) return { allowed: false };
	const code = str(raw.block.code);
	if (code === null) return { allowed: false };
	const block: BlockReason = {
		code,
		message: str(raw.block.message) ?? "",
		howToFix: arr(str)(raw.block.how_to_fix) ?? [],
	};
	return { allowed: false, block };
};
