import { arr, type Decoder, isObject, str } from "../../lib/gateway-sdk";
import type { Derivation, MergeResult } from "../../lib/shape-editor";

/**
 * /shape-editor live reads — the decoders over the Go shape-editor MCP outputs (S68; the ADR 0092
 * batch-4B flip). Kept OUT of actions.ts (a Next "use server" module may only export async functions) so
 * the decoders are PURE importable functions.
 *
 * NEVER DOUBLE-TYPED (the flip done-criterion): these decoders are the SINGLE runtime declaration of the
 * live wire shape; the static Derivation / MergeResult are the twin's types they fill. They pin the
 * decoder == the Go shapeeditorsrv contract (deriveOutput {ok, shape, test_kind, cert_language},
 * mergeOutput {ok, error, locked, conflicts[{field,author_a,value_a,author_b,value_b}], merged}) — NOT a
 * second implementation of the shaper logic (the Go shapeeditor is authoritative — the parser is pure,
 * never an LLM).
 *
 * DETERMINISM-FIRST (§6/§8): same JSON → same verdict; a malformed payload returns null and readVia falls
 * back to the demo. THE WALL (§2): the reads are below-the-line — they compute VALUES, write no truth.
 */

/** deriveDecoder decodes the Go `deriveOutput` ({ ok, shape, test_kind, cert_language }) into a Derivation. */
export const deriveDecoder: Decoder<Derivation> = (
	raw: unknown,
): Derivation | null => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	const shape = str(raw.shape);
	const testKind = str(raw.test_kind);
	const certLanguage = str(raw.cert_language);
	if (shape === null || testKind === null || certLanguage === null) {
		return null;
	}
	if (shape !== "gherkin" && shape !== "property" && shape !== "fixture") {
		return null;
	}
	return { shape, testKind, certLanguage };
};

function decodeConflict(raw: unknown): MergeResult["conflicts"][number] | null {
	if (!isObject(raw)) return null;
	const field = str(raw.field);
	if (field !== "title" && field !== "source") return null;
	return {
		field,
		authorA: str(raw.author_a) ?? "",
		valueA: str(raw.value_a) ?? "",
		authorB: str(raw.author_b) ?? "",
		valueB: str(raw.value_b) ?? "",
	};
}

/**
 * mergeDecoder decodes the Go `mergeOutput` ({ ok, error, locked, conflicts[snake], merged }) into a
 * MergeResult — mapping the snake_case conflict fields to the twin's camelCase EditConflict, and the
 * Go `error` string + `locked` flag into the twin's `error` discriminator.
 */
export const mergeDecoder: Decoder<MergeResult> = (
	raw: unknown,
): MergeResult | null => {
	if (!isObject(raw)) return null;
	if (!isObject(raw.merged)) return null;
	const conflicts = arr(decodeConflict)(raw.conflicts) ?? [];
	const errStr = str(raw.error);
	const error = raw.ok === true ? null : errStr === null ? "" : errStr;
	return {
		merged: raw.merged as unknown as MergeResult["merged"],
		conflicts,
		error,
	};
};
