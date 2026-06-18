/**
 * facetcomplete-data — the DETERMINISTIC demo fixture for the /facet-completeness panel (S59
 * cutover, ADR 0092). It holds the canonical FK04 demo cut (op-checkout instantiates F+S+B, all
 * proven; view-cart instantiates F+X, F proven) + the twin `computeFacetCompleteness()` of it as
 * the demo verdict the panel falls back to when the gateway is unreachable (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before the cutover /facet-completeness
 * computed its displayed verdict from the TS twin `lib/facetcomplete.computeFacetCompleteness()`
 * directly — the twin WAS the live source. The cutover routes `checkAction` through the Go engine
 * via the passerelle (`readVia(scope, "check", …)`, the dispatched below-the-line read of the
 * facet-completeness MCP server); this fixture is KEPT only as the deterministic fallback. The
 * presence of this `-data.ts` sibling is also what makes the T5 cliquet (twin-as-live-fitness)
 * RECOGNISE `lib/facetcomplete` as a twin — the panel stays GREEN because `actions.ts` imports the
 * `readVia` frontier (the witness the twin sits behind `source:"demo"`).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the demo verdict is the same PURE twin compute the Go
 * `facetcomplete.ComputeFacetCompleteness` reproduces — same cut → byte-identical verdict. The
 * parity mirror app/facet-completeness/live.test.ts pins the decoder shape == the Go checkOutput
 * contract. THE WALL (§2): the fixture is a projection; nothing here writes truth.
 */

import {
	computeFacetCompleteness,
	DEMO_LAYERS,
	DEMO_MIRRORS,
	type FacetLayer,
	type FacetMirror,
	type Result,
} from "./facetcomplete";

export { DEMO_LAYERS, DEMO_MIRRORS };

/**
 * gatewayCheckArgs maps the front demo cut (layers + mirrors) to the Go `check` tool JSON shape:
 * the layers carry `layer_id`/`facets`, the mirrors carry `mirror_id`/`reflects_id`/
 * `reflects_version`/`test_kind`/`cert_language`/`liveness`. PURE — a deterministic projection,
 * never an LLM. This is the payload `checkAction` sends to the gateway (with the optional
 * fault-injected pair already removed from `mirrors`).
 */
export function gatewayCheckArgs(
	layers: FacetLayer[],
	mirrors: FacetMirror[],
): Record<string, unknown> {
	return {
		layers: layers.map((l) => ({
			layer_id: l.layerId,
			version: l.version,
			kind: l.kind,
			facets: l.facets,
		})),
		mirrors: mirrors.map((m) => ({
			mirror_id: m.mirrorId,
			reflects_id: m.reflectsId,
			reflects_version: m.reflectsVersion,
			facet: m.facet,
			test_kind: m.testKind,
			cert_language: m.certLanguage,
			liveness: m.liveness,
		})),
	};
}

/**
 * demoCheck is the deterministic demo Result — the twin `computeFacetCompleteness()` of the demo
 * cut, with the optional fault-injected `mirrors` (one removed pair) applied by the caller. With
 * the conformant DEMO_MIRRORS it returns COMPLETE; with a pair removed it returns RED_MONSTER.
 */
export function demoCheck(
	layers: FacetLayer[],
	mirrors: FacetMirror[],
): Result {
	return computeFacetCompleteness(layers, mirrors);
}
