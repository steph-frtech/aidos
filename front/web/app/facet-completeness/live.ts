import { arr, type Decoder, isObject, str } from "../../lib/gateway-sdk";

/**
 * /facet-completeness live read — the decoder over the Go facet-completeness `check` tool output
 * (S59 cutover, ADR 0092 — the Go engine is the SINGLE live source). Kept OUT of actions.ts (a
 * Next "use server" module may only export async functions) so the parity mirror (live.test.ts)
 * can import the PURE decoder directly.
 *
 * NEVER DOUBLE-TYPED (the S59 done-criterion): `checkDecoder` is the SINGLE runtime declaration of
 * the live verdict shape; the static `LiveResult` is INFERRED from it via `Decoded<>` (no parallel
 * interface). The parity mirror pins the decoder == the Go facetcompletenesssrv.checkOutput
 * contract ({ ok, verdict, facet_monsters, advisory }, snake_case), NOT a second implementation of
 * the completeness law (the Go facetcomplete.ComputeFacetCompleteness is AUTHORITATIVE). The
 * test_kind_monsters / hard_monster_count fields ride on the wire but the FK04 panel surfaces the
 * facet plane (facet_monsters + the soft-X advisories) — they are ignored here, not re-typed.
 *
 * DETERMINISM-FIRST (§6/§8): same JSON → same verdict, zero LLM. A malformed payload returns null
 * and readVia deterministically falls back to the demo verdict (source:"demo").
 *
 * THE WALL (§2): `check` is a below-the-line READ — it COMPUTES the completeness verdict over a
 * projection; it writes no truth (WroteKernel always false). A monster is a SIGNAL → idea → mirror
 * → /goal, never a write from this screen.
 */

/** One per-facet monster on the wire: a declared facet of a layer lacking its living pair. */
export interface LiveFacetMonster {
	layerId: string;
	facet: string;
	advisory: boolean;
}

/** The decoded `check` verdict: the hard facet monsters + the soft-X advisories. */
export interface LiveResult {
	verdict: "COMPLETE" | "RED_MONSTER";
	facetMonsters: LiveFacetMonster[];
	advisory: LiveFacetMonster[];
}

/** decodeMonster decodes one facet_monsters / advisory entry; null if a required field is absent. */
function decodeMonster(raw: unknown): LiveFacetMonster | null {
	if (!isObject(raw)) return null;
	const layerId = str(raw.layer_id);
	const facet = str(raw.facet);
	if (layerId === null || facet === null) return null;
	// advisory rides as a bool; an absent / non-bool advisory defaults to false (a hard monster).
	const advisory = raw.advisory === true;
	return { layerId, facet, advisory };
}

/**
 * checkDecoder decodes the Go `check` tool output into the front LiveResult. It accepts only a
 * canonical verdict ("COMPLETE" | "RED_MONSTER"); any other / missing verdict → null (→ demo
 * fallback). The facet_monsters / advisory witnesses are advisory lists — an absent list decodes
 * to []. A malformed witness entry rejects the whole payload (binary verdict, never half-decoded).
 */
export const checkDecoder: Decoder<LiveResult> = (raw) => {
	if (!isObject(raw)) return null;
	const verdict = str(raw.verdict);
	if (verdict !== "COMPLETE" && verdict !== "RED_MONSTER") return null;
	const facetMonsters = arr(decodeMonster)(raw.facet_monsters ?? []);
	const advisory = arr(decodeMonster)(raw.advisory ?? []);
	if (facetMonsters === null || advisory === null) return null;
	return { verdict, facetMonsters, advisory };
};
