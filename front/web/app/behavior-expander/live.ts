import type {
	ExpansionView,
	PieceView,
} from "../../lib/behavior-expander-data";
import { arr, type Decoder, isObject, num, str } from "../../lib/gateway-sdk";

/**
 * /behavior-expander live reads — the decoders over the Go `aidos-behavior-expander` CHEAP dispatched
 * tools (ADR 0092 batch-2 kill-twins flip). Kept OUT of actions.ts (a Next "use server" module may
 * only export async functions) so the parity mirror (live.test.ts) can import the PURE decoders.
 *
 * THE THREE CHEAP READS DISPATCH (S76). `behavior_catalogue` (the declared kinds, the dropdown the
 * screen renders) and `behavior_expand` (the ONE authoritative dry-run expansion — attributes /
 * relations / operations / policies / fixtures the result panel renders) are CHEAP, below-the-line
 * READS (`WroteKernel` always false) → dispatched and decoded here as the LIVE path. `behavior_propose`
 * is DELIBERATELY NOT dispatched: it returns a DRAFT ChangeSet — a truth-PROPOSAL — so it keeps its own
 * voie (propose → ChangeSet → approval), never a gateway read (route(behavior_propose) → unknown_tool).
 *
 * NEVER DOUBLE-TYPED (the cutover done-criterion): `catalogueDecoder` / `expandDecoder` are the SINGLE
 * runtime declaration of the live shapes; the static ExpansionView/PieceView (in behavior-expander-data)
 * are the row types the decoder fills. The parity mirror pins the decoder == the Go
 * catalogueOutput/expandOutput contract — NOT a second implementation of the expansion (the Go
 * behavior.Expand is authoritative). DETERMINISM-FIRST (§6/§8): same JSON → same verdict; a malformed
 * payload returns null and readVia falls back to the demo expansion/catalogue.
 */

/**
 * catalogueDecoder decodes the Go `behavior_catalogue` output ({ behaviors: string[] }) into the
 * declared kind list the dropdown renders. An absent/malformed list → null (→ demo fallback).
 */
export const catalogueDecoder: Decoder<string[]> = (raw) => {
	if (!isObject(raw)) return null;
	return arr(str)(raw.behaviors ?? []);
};

/** decodePiece decodes one named piece (the panel renders only the `name` of each). */
function decodePiece(raw: unknown): PieceView | null {
	if (!isObject(raw)) return null;
	const name = str(raw.name);
	if (name === null) return null;
	return { name };
}

/**
 * expandDecoder decodes the Go `behavior_expand` output ({ ok, expansion_id, piece_count, pieces:{
 * attributes, relations, operations, policies, fixtures } }) into the flat ExpansionView the result
 * panel renders. A server-side error (ok:false) → null (→ demo fallback). The `pieces` sub-lists are
 * `omitempty` (absent on an empty slice) → decode to []. A malformed piece → null (→ demo fallback).
 */
export const expandDecoder: Decoder<ExpansionView> = (raw) => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	const expansionId = str(raw.expansion_id);
	if (expansionId === null) return null;
	const pieceCount = num(raw.piece_count ?? 0);
	if (pieceCount === null) return null;
	const pieces = isObject(raw.pieces) ? raw.pieces : {};
	const attributes = arr(decodePiece)(pieces.attributes ?? []);
	const relations = arr(decodePiece)(pieces.relations ?? []);
	const operations = arr(decodePiece)(pieces.operations ?? []);
	const policies = arr(decodePiece)(pieces.policies ?? []);
	const fixtures = arr(decodePiece)(pieces.fixtures ?? []);
	if (
		attributes === null ||
		relations === null ||
		operations === null ||
		policies === null ||
		fixtures === null
	) {
		return null;
	}
	return {
		expansionId,
		pieceCount,
		attributes,
		relations,
		operations,
		policies,
		fixtures,
	};
};
