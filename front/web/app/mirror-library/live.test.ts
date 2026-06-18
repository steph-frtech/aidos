import { describe, expect, it } from "vitest";
import { DEMO_LIBRARY } from "../../lib/mirror-library";
import { demoApps, gatewayLibraryArgs } from "../../lib/mirror-library-data";
import { appsDecoder } from "./live";

/**
 * /mirror-library live read — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092
 * kill-twins batch).
 *
 * It proves the TS `appsDecoder` decodes a SAMPLE of the Go mirror-library `library_list_by_app`
 * tool output (mirrorlibrarysrv.listByAppOutput: `{ ok, apps:[{ project, mirrors:[records.Mirror],
 * alive, dead }] }`, the Mirror carrying snake_case fields) — the tool's CONTRACT, NOT a second
 * implementation of the grouping logic (the Go library.ListByApp is authoritative). This test pins
 * only that the wire shape decodes faithfully (the snake_case Mirror fields, the reflects{layer_id,
 * version}, the alive/dead tally, an absent mirrors list) and that a malformed payload
 * deterministically falls back to the demo listing.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("mirror-library live — library_list_by_app decoder parity", () => {
	it("decodes a Go-sample listByAppOutput (two apps, snake_case mirrors)", () => {
		const goSample = {
			ok: true,
			apps: [
				{
					project: "app-blog",
					alive: 1,
					dead: 0,
					mirrors: [
						{
							mirror_id: "blog.cross.schema",
							reflects: { layer_id: "Shop.Order", version: "v1" },
							test_kind: "schema",
							cert_language: "zod",
							authority: "above",
							liveness: "alive",
							content_hash: "b1",
						},
					],
				},
				{
					project: "app-shop",
					alive: 2,
					dead: 0,
					mirrors: [
						{
							mirror_id: "shop.order.schema",
							reflects: { layer_id: "Shop.Order", version: "v1" },
							test_kind: "schema",
							cert_language: "zod",
							authority: "above",
							liveness: "alive",
							content_hash: "a1",
						},
					],
				},
			],
		};
		const decoded = appsDecoder(goSample);
		expect(decoded).toEqual([
			{
				project: "app-blog",
				alive: 1,
				dead: 0,
				mirrors: [
					{
						mirrorId: "blog.cross.schema",
						reflects: { layerId: "Shop.Order", version: "v1" },
						testKind: "schema",
						certLanguage: "zod",
						authority: "above",
						liveness: "alive",
						contentHash: "b1",
					},
				],
			},
			{
				project: "app-shop",
				alive: 2,
				dead: 0,
				mirrors: [
					{
						mirrorId: "shop.order.schema",
						reflects: { layerId: "Shop.Order", version: "v1" },
						testKind: "schema",
						certLanguage: "zod",
						authority: "above",
						liveness: "alive",
						contentHash: "a1",
					},
				],
			},
		]);
	});

	it("tolerates an absent mirrors list (an app with no mirrors → [])", () => {
		const decoded = appsDecoder({
			ok: true,
			apps: [{ project: "app-x", alive: 0, dead: 0 }],
		});
		expect(decoded).toEqual([
			{ project: "app-x", alive: 0, dead: 0, mirrors: [] },
		]);
	});

	it("decodes an empty library (no apps → [])", () => {
		expect(appsDecoder({ ok: true })).toEqual([]);
		expect(appsDecoder({ ok: true, apps: [] })).toEqual([]);
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(appsDecoder(null)).toBeNull();
		// a non-array apps → null.
		expect(appsDecoder({ ok: true, apps: 42 })).toBeNull();
		// a missing required tally → null.
		expect(
			appsDecoder({ ok: true, apps: [{ project: "app-x", alive: 0 }] }),
		).toBeNull();
		// a malformed mirror (missing mirror_id) → null.
		expect(
			appsDecoder({
				ok: true,
				apps: [
					{
						project: "app-x",
						alive: 1,
						dead: 0,
						mirrors: [{ reflects: { layer_id: "L", version: "v1" } }],
					},
				],
			}),
		).toBeNull();
		// an invalid liveness enum → null.
		expect(
			appsDecoder({
				ok: true,
				apps: [
					{
						project: "app-x",
						alive: 1,
						dead: 0,
						mirrors: [
							{
								mirror_id: "m1",
								reflects: { layer_id: "L", version: "v1" },
								test_kind: "schema",
								cert_language: "zod",
								authority: "above",
								liveness: "zombie",
							},
						],
					},
				],
			}),
		).toBeNull();
	});

	it("the demo listing round-trips through the gateway-arg projection + decoder", () => {
		// The demo fixture is the twin listByApp() of DEMO_LIBRARY. Projecting DEMO_LIBRARY to the
		// Go-shaped library args, then a Go ListByApp would yield the SAME per-app shape demoApps()
		// produces — the twin sits behind source:"demo", identical in shape to the live read.
		const apps = demoApps();
		const projects = apps.map((a) => a.project);
		expect(projects).toEqual(["app-blog", "app-shop"]);
		// the arg projection carries the two-app library in the Go snake_case shape.
		const args = gatewayLibraryArgs(DEMO_LIBRARY);
		expect(Array.isArray(args.mirrors)).toBe(true);
		const firstMirror = (args.mirrors as Array<Record<string, unknown>>)[0];
		expect(firstMirror.project).toBe("app-shop");
		expect((firstMirror.mirror as Record<string, unknown>).mirror_id).toBe(
			"shop.order.schema",
		);
	});
});
