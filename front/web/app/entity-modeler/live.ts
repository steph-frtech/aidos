import type { BlockReason, MergeOutcome } from "../../lib/entity-modeler";
import type { ValidateView } from "../../lib/entity-modeler-data";
import { arr, type Decoder, isObject, str } from "../../lib/gateway-sdk";

/**
 * /entity-modeler live reads — the decoders over the Go entity-modeler MCP outputs (S75; the ADR 0092
 * batch-4B flip). Kept OUT of actions.ts (a Next "use server" module may only export async functions) so
 * the decoders can be imported by the panel/parity mirror as PURE functions.
 *
 * NEVER DOUBLE-TYPED (the flip done-criterion): these decoders are the SINGLE runtime declaration of the
 * live wire shape; the static BlockReason / MergeOutcome / ValidateView are the twin's types they fill.
 * They pin the decoder == the Go entitymodelersrv contract (validateOutput {ok, block{code,severity,
 * explanation,how_to_fix}}, hashOutput {ok, hash}, MergeOutcome {merged, added_by_a, added_by_b,
 * conflicts}) — NOT a second implementation of the modeler logic (the Go modeler is authoritative).
 *
 * DETERMINISM-FIRST (§6/§8): same JSON → same verdict; a malformed payload returns null and readVia
 * falls back to the demo. THE WALL (§2): the reads are below-the-line — they compute VALUES, write no
 * truth (WroteKernel always false).
 */

function decodeBlock(raw: unknown): BlockReason | null {
	if (!isObject(raw)) return null;
	const code = str(raw.code);
	const explanation = str(raw.explanation);
	const howToFix = arr(str)(raw.how_to_fix);
	if (code === null) return null;
	// The twin BlockReason.severity is the literal "blocking" (the modeler's only severity); the Go
	// payload echoes it but the front type pins the literal, so we normalise to it.
	return {
		code,
		severity: "blocking",
		explanation: explanation ?? "",
		how_to_fix: howToFix ?? [],
	};
}

/** validateDecoder decodes the Go `validateOutput` ({ ok, block? }) into a ValidateView. */
export const validateDecoder: Decoder<ValidateView> = (
	raw: unknown,
): ValidateView | null => {
	if (!isObject(raw)) return null;
	if (typeof raw.ok !== "boolean") return null;
	if (raw.ok) return { ok: true };
	const block = decodeBlock(raw.block);
	return block === null ? { ok: false } : { ok: false, block };
};

/** hashDecoder decodes the Go `hashOutput` ({ ok, hash? }) into the content-address string. */
export const hashDecoder: Decoder<string> = (raw: unknown): string | null => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	return str(raw.hash);
};

/** mergeDecoder decodes the Go `modeler.MergeOutcome` ({ merged, added_by_a, added_by_b, conflicts }). */
export const mergeDecoder: Decoder<MergeOutcome> = (
	raw: unknown,
): MergeOutcome | null => {
	if (!isObject(raw)) return null;
	if (!isObject(raw.merged)) return null;
	const project = str(raw.merged.project);
	if (project === null) return null;
	// The merged.nodes are echoed back as the modeler's EntityNode objects — kept as-is (the twin's
	// EntityNode type fills them); a malformed nodes array fails the decode (falls back to demo).
	if (!Array.isArray(raw.merged.nodes)) return null;
	const addedByA = arr(str)(raw.added_by_a) ?? [];
	const addedByB = arr(str)(raw.added_by_b) ?? [];
	const conflicts = arr(str)(raw.conflicts) ?? [];
	return {
		merged: raw.merged as unknown as MergeOutcome["merged"],
		added_by_a: addedByA,
		added_by_b: addedByB,
		conflicts,
	};
};
