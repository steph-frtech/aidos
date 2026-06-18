/**
 * mirror-library-data — the DETERMINISTIC demo fixture + gateway-arg projection for the
 * /mirror-library panel (S59 cutover, ADR 0092). It carries the gateway-arg projection of the
 * demo `Library` (the front camelCase twin → the Go snake_case `library.Library` JSON the
 * `library_list_by_app` tool expects) and the twin `listByApp()` of it as the demo `AppMirrors[]`
 * the panel falls back to when the gateway is unreachable (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before S59 the /mirror-library panel
 * computed its per-app listing from the TS twin `lib/mirror-library.listByApp()` directly — the
 * twin WAS the live source. S59 routes the listing through the Go engine via the passerelle
 * (`readVia(scope, "library_list_by_app", …)`, the dispatched below-the-line read of the
 * mirror-library MCP server); this module is KEPT only as the deterministic fallback + the
 * arg projection. Its presence as a `-data.ts` sibling is also what makes the T5 cliquet
 * (twin-as-live-fitness) RECOGNISE `lib/mirror-library` as a twin behind `source:"demo"` (the
 * panel stays GREEN because `actions.ts` imports the `readVia` frontier).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the projection + the demo listing are the same PURE twin
 * compute the Go `library.ListByApp` reproduces — same library → byte-identical listing. The
 * parity mirror app/mirror-library/live.test.ts pins the decoder shape == the Go
 * listByAppOutput contract.
 *
 * THE WALL (CLAUDE.md §2): this module writes NOTHING — it projects values and computes a listing.
 */

import {
	type AppMirrors,
	DEMO_LIBRARY,
	type Library,
	listByApp,
} from "./mirror-library";

/**
 * gatewayLibraryArgs maps the front camelCase `Library` to the Go `library.Library` JSON shape
 * the gateway `library_list_by_app` tool expects: project-tagged layers ({project, layer:{layer_id,
 * version, kind}}) and project-tagged mirrors ({project, mirror:{mirror_id, reflects:{layer_id,
 * version}, test_kind, cert_language, authority, liveness, content_hash}}). PURE — a deterministic
 * projection, never an LLM.
 */
export function gatewayLibraryArgs(lib: Library): Record<string, unknown> {
	return {
		layers: lib.layers.map((pl) => ({
			project: pl.project,
			layer: {
				layer_id: pl.layer.layerId,
				version: pl.layer.version,
				kind: pl.layer.kind,
			},
		})),
		mirrors: lib.mirrors.map((pm) => ({
			project: pm.project,
			mirror: {
				mirror_id: pm.mirror.mirrorId,
				reflects: {
					layer_id: pm.mirror.reflects.layerId,
					version: pm.mirror.reflects.version,
				},
				test_kind: pm.mirror.testKind,
				cert_language: pm.mirror.certLanguage,
				authority: pm.mirror.authority,
				liveness: pm.mirror.liveness,
				content_hash: pm.mirror.contentHash,
			},
		})),
	};
}

/** The gateway-arg projection of the canonical two-app demo library. */
export function demoLibraryArgs(): Record<string, unknown> {
	return gatewayLibraryArgs(DEMO_LIBRARY);
}

/** demoApps is the deterministic demo `AppMirrors[]` — the twin `listByApp()` of the demo library. */
export function demoApps(): AppMirrors[] {
	return listByApp(DEMO_LIBRARY);
}
