import { describe, expect, it } from "vitest";
import {
	computeFacetCompleteness,
	DEMO_LAYERS,
	DEMO_MIRRORS,
} from "../../lib/facetcomplete";
import { gatewayCheckArgs } from "../../lib/facetcomplete-data";
import { checkDecoder } from "./live";

/**
 * /facet-completeness live `check` read — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR
 * 0092 kill-twins batch).
 *
 * It proves the TS `checkDecoder` decodes a SAMPLE of the Go facet-completeness `check` tool output
 * (facetcompletenesssrv.checkOutput: `{ ok, verdict, test_kind_monsters, facet_monsters, advisory,
 * hard_monster_count }`, snake_case) — the tool's CONTRACT, NOT a second implementation of the
 * completeness law (the Go facetcomplete.ComputeFacetCompleteness is AUTHORITATIVE). This test pins
 * only that the wire shape decodes faithfully (the canonical verdict, the facet_monsters /advisory
 * witnesses with their layer_id/facet/advisory, the ignored test_kind plane, an absent witness
 * list) and that a malformed payload deterministically falls back (decoder → null → demo).
 *
 * It also pins the FK04 CUT-PARITY: the demo args projection round-trips the SAME canonical demo
 * cut the twin computes — the twin demo verdict is identical in SHAPE to the Go-authoritative live
 * verdict (the twin sits behind source:"demo").
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("facet-completeness live — check decoder parity", () => {
	it("decodes a Go-sample checkOutput (conformant demo cut → COMPLETE)", () => {
		const goSample = {
			ok: true,
			verdict: "COMPLETE",
			test_kind_monsters: [],
			facet_monsters: [],
			advisory: [],
			hard_monster_count: 0,
		};
		expect(checkDecoder(goSample)).toEqual({
			verdict: "COMPLETE",
			facetMonsters: [],
			advisory: [],
		});
	});

	it("decodes a checkOutput carrying a hard facet monster (a removed pair)", () => {
		const decoded = checkDecoder({
			ok: true,
			verdict: "RED_MONSTER",
			test_kind_monsters: [],
			facet_monsters: [
				{
					reason: "no_facet_pair",
					layer_id: "op-checkout",
					version: "v1",
					kind: "operation",
					facet: "S",
					advisory: false,
				},
			],
			advisory: [],
			hard_monster_count: 1,
		});
		expect(decoded?.verdict).toBe("RED_MONSTER");
		expect(decoded?.facetMonsters).toEqual([
			{ layerId: "op-checkout", facet: "S", advisory: false },
		]);
	});

	it("decodes the soft-X advisory plane (advisory true, never a hard monster)", () => {
		const decoded = checkDecoder({
			ok: true,
			verdict: "COMPLETE",
			facet_monsters: [],
			advisory: [
				{
					reason: "no_facet_pair",
					layer_id: "view-cart",
					version: "v1",
					kind: "view",
					facet: "X",
					advisory: true,
				},
			],
		});
		expect(decoded?.verdict).toBe("COMPLETE");
		expect(decoded?.advisory).toEqual([
			{ layerId: "view-cart", facet: "X", advisory: true },
		]);
	});

	it("tolerates absent witness lists (a clean payload decodes to [])", () => {
		const decoded = checkDecoder({ ok: true, verdict: "COMPLETE" });
		expect(decoded).toEqual({
			verdict: "COMPLETE",
			facetMonsters: [],
			advisory: [],
		});
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(checkDecoder(null)).toBeNull();
		expect(checkDecoder({})).toBeNull(); // no verdict
		// a non-canonical verdict → null.
		expect(checkDecoder({ verdict: "MAYBE" })).toBeNull();
		// a malformed witness entry (no layer_id) rejects the whole payload.
		expect(
			checkDecoder({
				verdict: "RED_MONSTER",
				facet_monsters: [{ facet: "S", advisory: false }],
			}),
		).toBeNull();
	});

	it("the demo args round-trip the canonical FK04 cut (twin ≡ the live contract shape)", () => {
		// The demo verdict is the twin compute of the demo cut; its args projection is the EXACT
		// payload the live `check` read sends — the twin sits behind source:"demo", identical in
		// shape to the Go-authoritative live verdict.
		const demo = computeFacetCompleteness(DEMO_LAYERS, DEMO_MIRRORS);
		expect(demo.verdict).toBe("COMPLETE");
		const args = gatewayCheckArgs(DEMO_LAYERS, DEMO_MIRRORS);
		// the layers carry snake_case layer_id + the instantiated facets.
		expect((args.layers as Array<Record<string, unknown>>)[0]).toEqual({
			layer_id: "op-checkout",
			version: "v1",
			kind: "operation",
			facets: ["F", "S", "B"],
		});
		// the mirrors carry the reflects_id/reflects_version + the proven facet + liveness.
		expect((args.mirrors as Array<Record<string, unknown>>)[0]).toMatchObject({
			mirror_id: "m-op-f",
			reflects_id: "op-checkout",
			reflects_version: "v1",
			facet: "F",
			liveness: "alive",
		});
	});
});
