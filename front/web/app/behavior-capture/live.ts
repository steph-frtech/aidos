import type { AttachReadView } from "../../lib/behavior-capture-data";
import { arr, type Decoder, isObject, num, str } from "../../lib/gateway-sdk";

/**
 * /behavior-capture live reads — the pure decoders over the Go `aidos-behavior-capture` MCP tools'
 * output (S67; ADR 0092 PHASE-4 kill-twins flip). Kept OUT of actions.ts (a Next "use server" module
 * may only export async functions) so the parity mirror (live.test.ts) can import the PURE decoders
 * directly.
 *
 * TWO DISPATCHED READS (both below-the-line — the attach is a DRY-RUN, `wrote_kernel` always false):
 *   - `behavior_library`            → libraryOutput   `{ behaviors: string[] }` (the surfaced catalogue)
 *   - `behavior_attach_at_capture`  → attachOutput    `{ ok, error?, idea_ref, behavior, entity,
 *       expansion_id, wrote_kernel(false), changeset_ref, changeset_status, proposal_id, piece_count,
 *       preview[], pieces{attributes[],relations[],operations[],policies[],fixtures[]} }`
 *
 * NEVER DOUBLE-TYPED (the cutover done-criterion): `libraryDecoder` / `attachDecoder` are the SINGLE
 * runtime declaration of each live shape; the static types (Kind[], AttachReadView in
 * behavior-capture-data) are what the decoders fill. The parity mirror pins the decoders ==
 * the Go libraryOutput / attachOutput contract — NOT a second implementation of the expansion logic
 * (the Go behaviorcapture.Library / behaviorcapture.AttachBehaviorAtCapture are authoritative).
 *
 * DETERMINISM-FIRST (§6/§8): same JSON → same verdict; a malformed payload returns null and readVia
 * falls back to the demo view. THE WALL (§2): the attach decoder NEVER reads a kernel write — the Go
 * tool returns `wrote_kernel:false` and a DRAFT ChangeSet by string ref/status only (no truth write).
 */

/**
 * libraryDecoder decodes the Go `behavior_library` output ({ behaviors: [...] }) into the front
 * Kind[] (the surfaced catalogue). A malformed payload → null (→ demo fallback). An absent `behaviors`
 * list is illegal (the catalogue is always present) → null.
 */
export const libraryDecoder: Decoder<string[]> = (raw) => {
	if (!isObject(raw)) return null;
	return arr(str)(raw.behaviors);
};

/**
 * attachDecoder decodes the Go `behavior_attach_at_capture` output into the flat AttachReadView. A
 * refusal (ok:false) decodes to `{ ok:false, error }` — a LEGITIMATE live verdict, not a fallback
 * trigger (the Go tool returns ok:false with a verbatim error for an empty idea / unknown behavior /
 * entity-less attach). A malformed envelope (no `ok`, or a missing required field on success) → null
 * (→ demo fallback). The nested `pieces` groups are flattened to names (matching the demo view).
 */
export const attachDecoder: Decoder<AttachReadView> = (raw) => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) {
		// a refusal is a legitimate verdict — surface the verbatim error (or an empty refusal).
		if (raw.ok === false) {
			return { ok: false, error: str(raw.error) ?? undefined };
		}
		return null; // no `ok` field at all → malformed → demo fallback.
	}
	const ideaRef = str(raw.idea_ref);
	const behavior = str(raw.behavior);
	const entity = str(raw.entity);
	const expansionId = str(raw.expansion_id);
	const changeSetRef = str(raw.changeset_ref);
	const changeSetStatus = str(raw.changeset_status);
	const pieceCount = num(raw.piece_count);
	if (
		ideaRef === null ||
		behavior === null ||
		entity === null ||
		expansionId === null ||
		changeSetRef === null ||
		changeSetStatus === null ||
		pieceCount === null
	) {
		return null;
	}
	// preview is `omitempty` (absent on a zero-piece expansion) → decode to [].
	const preview = arr(str)(raw.preview ?? []);
	if (preview === null) return null;
	const pieces = isObject(raw.pieces) ? raw.pieces : {};
	return {
		ok: true,
		ideaRef,
		behavior,
		entity,
		expansionId,
		changeSetRef,
		changeSetStatus,
		pieceCount,
		preview,
		attributes: pieceNames(pieces.attributes),
		relations: relationNames(pieces.relations),
		operations: pieceNames(pieces.operations),
		policies: pieceNames(pieces.policies),
		fixtures: pieceNames(pieces.fixtures),
	};
};

/** pieceNames flattens a Go piece group ([{name,…}]) to its names; a missing/malformed group → []. */
function pieceNames(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	const out: string[] = [];
	for (const p of raw) {
		if (isObject(p)) {
			const n = str(p.name);
			if (n !== null) out.push(n);
		}
	}
	return out;
}

/** relationNames flattens a Go relation group ([{name,target,…}]) to "name→target". */
function relationNames(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	const out: string[] = [];
	for (const p of raw) {
		if (isObject(p)) {
			const n = str(p.name);
			const target = str(p.target);
			if (n !== null) out.push(target !== null ? `${n}→${target}` : n);
		}
	}
	return out;
}
