import { describe, expect, it } from "vitest";
import {
	demoCatalogue,
	demoFork,
	demoInstantiate,
} from "../../lib/templates-data";
import { catalogueDecoder, starterDecoder } from "./live";

/**
 * /templates live reads — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092 batch-3 flip).
 *
 * It proves the TS decoders decode a SAMPLE of the Go templates MCP server's output
 * (templatessrv.listOutput: `{ ok, templates: bundleSummary[] }` with snake_case bundle fields;
 * templatessrv.instantiateOutput: `{ ok, template / target / pieces / piece_count / has_app_auth /
 * starter_id / wrote_kernel }`) — the tools' CONTRACT, NOT a second implementation of the catalogue /
 * instantiation logic (the Go templates.Curated/Instantiate/Fork is authoritative). This test pins
 * only that the wire shape decodes faithfully (the `templates` list, the snake_case counts, the
 * pieces/starter shape, the verbatim error path) and that a malformed payload deterministically falls
 * back to the demo catalogue / starter.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("templates live — catalogue decoder parity", () => {
	it("decodes a Go-sample listOutput (three curated bundles)", () => {
		const goSample = {
			ok: true,
			templates: [
				{
					id: "ecommerce",
					labels: { fr: "Boutique e-commerce", en: "E-commerce storefront" },
					bundle_id:
						"a29fcea8f530ac838c047ffdc1cc1fd5c183ad17576d8d1007072a4ff27678b5",
					entities: 3,
					relations: 2,
					behaviors: ["app-auth"],
					operations: 3,
					mirrors: 7,
					ui_sources: 3,
				},
			],
		};
		const decoded = catalogueDecoder(goSample);
		expect(decoded).toEqual([
			{
				id: "ecommerce",
				labelFr: "Boutique e-commerce",
				labelEn: "E-commerce storefront",
				bundleId:
					"a29fcea8f530ac838c047ffdc1cc1fd5c183ad17576d8d1007072a4ff27678b5",
				entities: 3,
				relations: 2,
				operations: 3,
				mirrors: 7,
				uiSources: 3,
				behaviors: ["app-auth"],
			},
		]);
	});

	it("tolerates an absent labels map + absent behaviors (FR fallback to '')", () => {
		const decoded = catalogueDecoder({
			ok: true,
			templates: [
				{
					id: "booking",
					bundle_id: "deadbeef",
					entities: 3,
					relations: 2,
					operations: 3,
					mirrors: 7,
					ui_sources: 2,
				},
			],
		});
		expect(decoded?.[0].labelFr).toBe("");
		expect(decoded?.[0].behaviors).toEqual([]);
	});

	it("decodes an empty live catalogue (ok with [])", () => {
		expect(catalogueDecoder({ ok: true, templates: [] })).toEqual([]);
		// templates absent entirely → []
		expect(catalogueDecoder({ ok: true })).toEqual([]);
	});

	it("rejects a malformed / non-ok payload (→ demo fallback)", () => {
		expect(catalogueDecoder(null)).toBeNull();
		expect(catalogueDecoder({ ok: false })).toBeNull();
		// a missing required count in a bundle → the whole list fails (arr is all-or-nothing) → null.
		expect(
			catalogueDecoder({
				ok: true,
				templates: [{ id: "crm", bundle_id: "x", entities: 3 }],
			}),
		).toBeNull();
	});
});

describe("templates live — starter decoder parity", () => {
	it("decodes a Go-sample instantiateOutput (a green starter)", () => {
		const goSample = {
			ok: true,
			template: "ecommerce",
			target: "shop-app",
			pieces: ["ent:Customer", "ent:Product", "op:checkout"],
			piece_count: 3,
			has_app_auth: true,
			starter_id:
				"8d9f02770d87f7e5ccbebcab2d389425f55b4de14bd1540d22c868e9a3d22eb3",
			wrote_kernel: false,
		};
		const decoded = starterDecoder(goSample);
		expect(decoded).toEqual({
			ok: true,
			template: "ecommerce",
			target: "shop-app",
			pieces: ["ent:Customer", "ent:Product", "op:checkout"],
			pieceCount: 3,
			hasAppAuth: true,
			starterId:
				"8d9f02770d87f7e5ccbebcab2d389425f55b4de14bd1540d22c868e9a3d22eb3",
			forked: false,
			parentPhase: undefined,
		});
	});

	it("decodes the verbatim domain-error path (ok:true + error)", () => {
		const decoded = starterDecoder({
			ok: true,
			error: 'templates: id is not in the curated catalogue: "nope"',
			target: "shop-app",
		});
		expect(decoded?.error).toMatch(/not in the curated catalogue/);
		expect(decoded?.target).toBe("shop-app");
	});

	it("rejects a malformed payload (no ok bool / no starter_id) → demo fallback", () => {
		expect(starterDecoder(null)).toBeNull();
		expect(starterDecoder({})).toBeNull(); // ok not a bool
		// ok:true but no starter_id and no error → null (an undecodable success).
		expect(starterDecoder({ ok: true, template: "crm" })).toBeNull();
	});

	it("the demo starter matches the decoded Go starter shape (twin ≡ the live contract)", () => {
		// The demo fixture is the twin instantiate() projected to a StarterView; it carries the SAME
		// shape the live read returns (the twin sits behind source:"demo", byte-identical starterId).
		const demo = demoInstantiate("ecommerce", "shop-app");
		expect(demo.ok).toBe(true);
		expect(demo.template).toBe("ecommerce");
		expect(demo.target).toBe("shop-app");
		expect(demo.hasAppAuth).toBe(true);
		expect(demo.starterId).toBe(
			"8d9f02770d87f7e5ccbebcab2d389425f55b4de14bd1540d22c868e9a3d22eb3",
		);
		// the live decoder over the same fields yields the SAME view (modulo forked/parentPhase, set
		// by the fork action, not the wire — the Go output does not echo the parent phase).
		const goSample = {
			ok: true,
			template: demo.template,
			target: demo.target,
			pieces: demo.pieces,
			piece_count: demo.pieceCount,
			has_app_auth: demo.hasAppAuth,
			starter_id: demo.starterId,
			wrote_kernel: false,
		};
		expect(starterDecoder(goSample)?.starterId).toBe(demo.starterId);
	});

	it("the demo fork carries forked + the parent phase (layered atop the live shape)", () => {
		const demo = demoFork("ecommerce", "shop-fork", "phase-stable-1");
		expect(demo.forked).toBe(true);
		expect(demo.parentPhase).toBe("phase-stable-1");
		expect(demo.starterId).toMatch(/^[0-9a-f]{64}$/);
	});

	it("the demo catalogue is the three curated bundles (non-empty, FR labels)", () => {
		const cat = demoCatalogue();
		expect(cat).toHaveLength(3);
		for (const b of cat) {
			expect(b.labelFr).toBeTruthy();
			expect(b.bundleId).toMatch(/^[0-9a-f]{64}$/);
		}
	});
});
