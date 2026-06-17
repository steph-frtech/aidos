import type { EntryView } from "../../lib/behaviors-data";
import { arr, type Decoder, isObject, num, str } from "../../lib/gateway-sdk";

/**
 * /behaviors live read — the decoder over the Go `aidos-behaviors` `behaviors_search` (and the
 * shape-identical `behaviors_browse`) tool output (ADR 0092 batch-2 kill-twins flip). Kept OUT of
 * actions.ts (a Next "use server" module may only export async functions) so the parity mirror
 * (live.test.ts) can import the PURE decoder directly.
 *
 * NEVER DOUBLE-TYPED (the cutover done-criterion): `searchDecoder` is the SINGLE runtime declaration
 * of the live library-list shape; the static EntryView (in behaviors-data) is the row type the
 * decoder fills. The parity mirror pins the decoder == the Go `listOutput`/`entryOutput` contract
 * ({ ok, error?, project_id?, entries:[{record_id, kind, owner, version, tags?, labels, published,
 * deleted, comments}], count }) — NOT a second implementation of the library logic (the Go
 * behavior.Library.Search is authoritative). DETERMINISM-FIRST (§6/§8): same JSON → same verdict; a
 * malformed payload returns null and readVia falls back to the demo entries.
 */

/** decodeEntry decodes one Go `entryOutput` into the flat EntryView (the FR label is the displayed one). */
function decodeEntry(raw: unknown): EntryView | null {
	if (!isObject(raw)) return null;
	const recordId = str(raw.record_id);
	const kind = str(raw.kind);
	const owner = str(raw.owner);
	const version = num(raw.version);
	if (
		recordId === null ||
		kind === null ||
		owner === null ||
		version === null
	) {
		return null;
	}
	// tags is `omitempty` (absent on a tagless record) → decode to [].
	const tags = arr(str)(raw.tags ?? []);
	if (tags === null) return null;
	// labels is always present (FR required); the FR label is what the panel renders.
	const labels = isObject(raw.labels) ? raw.labels : {};
	const labelFr = str(labels.fr) ?? "";
	const published = raw.published === true;
	return { recordId, kind, owner, version, tags, labelFr, published };
}

/**
 * searchDecoder decodes the Go `behaviors_search` output ({ ok, entries, count }) into the front
 * EntryView[]. A server-side error (ok:false) → null (→ demo fallback). The `entries` list is the
 * payload; an absent list decodes to []. A malformed entry → null (→ demo fallback).
 */
export const searchDecoder: Decoder<EntryView[]> = (raw) => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	return arr(decodeEntry)(raw.entries ?? []);
};
