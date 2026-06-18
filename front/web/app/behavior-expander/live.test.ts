import { describe, expect, it } from "vitest";
import {
	demoCatalogue,
	demoExpansion,
	gatewayCatalogueArgs,
	gatewayExpandArgs,
} from "../../lib/behavior-expander-data";
import { catalogueDecoder, expandDecoder } from "./live";

/**
 * /behavior-expander live reads — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092
 * batch-2 kill-twins flip).
 *
 * It proves the TS decoders decode a SAMPLE of the Go `aidos-behavior-expander` CHEAP tool outputs:
 *   - `catalogueDecoder` over behaviorexpandersrv.catalogueOutput (`{ behaviors: string[] }`);
 *   - `expandDecoder` over behaviorexpandersrv.expandOutput (`{ ok, expansion_id, piece_count,
 *     pieces:{ attributes, relations, operations, policies, fixtures } }`, each piece carrying a
 *     `name`).
 * — the tools' CONTRACT, NOT a second implementation of the expansion (the Go behavior.Catalogue /
 * behavior.Expand are authoritative). This test pins only that the wire shapes decode faithfully (the
 * kinds list, the expansion id + piece names, an absent piece slice → []) and that a malformed /
 * errored payload deterministically falls back to the demo catalogue / expansion.
 *
 * `behavior_propose` is NOT covered here: it is DELIBERATELY NOT dispatched (a DRAFT ChangeSet — a
 * truth-PROPOSAL — keeps its own voie propose → ChangeSet → approval). Only the cheap dispatched reads
 * (catalogue + expand) have a decoder + a parity mirror.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("behavior-expander live — catalogue decoder parity", () => {
	it("decodes a Go-sample catalogueOutput (the declared kinds in canonical order)", () => {
		const goSample = {
			behaviors: ["ownable", "soft-deletable", "auditable"],
		};
		expect(catalogueDecoder(goSample)).toEqual([
			"ownable",
			"soft-deletable",
			"auditable",
		]);
	});

	it("decodes an absent behaviors list to [] (omitempty-tolerant)", () => {
		expect(catalogueDecoder({})).toEqual([]);
	});

	it("rejects a malformed catalogue payload (→ demo fallback)", () => {
		expect(catalogueDecoder(null)).toBeNull();
		expect(catalogueDecoder([])).toBeNull(); // not an object
		// a non-string element → null (→ demo fallback).
		expect(catalogueDecoder({ behaviors: ["ownable", 42] })).toBeNull();
	});
});

describe("behavior-expander live — expand decoder parity", () => {
	it("decodes a Go-sample expandOutput (the ONE dry-run expansion, flat piece names)", () => {
		const goSample = {
			ok: true,
			behavior: "ownable",
			entity: "Order",
			expansion_id: "exp-abc123",
			wrote_kernel: false,
			piece_count: 4,
			preview: ["owner_id", "owner→User", "scope-by-owner", "owned-order"],
			pieces: {
				attributes: [{ name: "owner_id", type: "User", required: true }],
				relations: [
					{ name: "owner→User", target: "User", cardinality: "many-to-one" },
				],
				policies: [
					{
						name: "scope-by-owner",
						scope: "Order",
						operation: "read",
						effect: "allow",
					},
				],
				fixtures: [{ name: "owned-order" }],
			},
		};
		expect(expandDecoder(goSample)).toEqual({
			expansionId: "exp-abc123",
			pieceCount: 4,
			attributes: [{ name: "owner_id" }],
			relations: [{ name: "owner→User" }],
			operations: [],
			policies: [{ name: "scope-by-owner" }],
			fixtures: [{ name: "owned-order" }],
		});
	});

	it("tolerates absent piece slices (omitempty → [])", () => {
		const decoded = expandDecoder({
			ok: true,
			expansion_id: "exp-empty",
			piece_count: 0,
			pieces: {},
		});
		expect(decoded).toEqual({
			expansionId: "exp-empty",
			pieceCount: 0,
			attributes: [],
			relations: [],
			operations: [],
			policies: [],
			fixtures: [],
		});
		// an entirely absent `pieces` object also decodes to all-[].
		expect(
			expandDecoder({ ok: true, expansion_id: "x", piece_count: 0 })?.fixtures,
		).toEqual([]);
	});

	it("rejects a malformed / errored expansion payload (→ demo fallback)", () => {
		expect(expandDecoder(null)).toBeNull();
		expect(expandDecoder({})).toBeNull(); // no ok
		// a server-side error (ok:false) → null → demo fallback.
		expect(expandDecoder({ ok: false, error: "unknown behavior" })).toBeNull();
		// an absent expansion_id → null.
		expect(expandDecoder({ ok: true, piece_count: 0 })).toBeNull();
		// a malformed piece (no name) → null.
		expect(
			expandDecoder({
				ok: true,
				expansion_id: "x",
				piece_count: 1,
				pieces: { attributes: [{ type: "User" }] },
			}),
		).toBeNull();
	});
});

describe("behavior-expander live — demo fixture ≡ the live shape", () => {
	it("the demo catalogue is a non-empty list of string kinds (twin ≡ live shape)", () => {
		const demo = demoCatalogue();
		expect(demo.length).toBeGreaterThan(0);
		for (const k of demo) expect(typeof k).toBe("string");
		// the §24.6 owner-scoping behaviour is in the declared catalogue.
		expect(demo).toContain("ownable");
	});

	it("the demo expansion matches the decoded-contract shape (twin behind source:demo)", () => {
		// The demo fixture is the twin expand() of (ownable, Order); its ExpansionView shape is identical
		// to what the live decoder produces from the Go expandOutput — the twin sits behind source:"demo".
		const demo = demoExpansion("ownable", "Order");
		expect(typeof demo.expansionId).toBe("string");
		expect(typeof demo.pieceCount).toBe("number");
		for (const list of [
			demo.attributes,
			demo.relations,
			demo.operations,
			demo.policies,
			demo.fixtures,
		]) {
			expect(Array.isArray(list)).toBe(true);
			for (const p of list) expect(typeof p.name).toBe("string");
		}
		// ownable always produces at least the owner attribute + the owner-scoping policy.
		expect(demo.pieceCount).toBeGreaterThan(0);
	});

	it("the gateway-arg projections carry the dispatched read inputs", () => {
		// catalogue takes no input (an empty object).
		expect(gatewayCatalogueArgs()).toEqual({});
		// expand carries the chosen behavior+entity (a fresh expansion, no `existing`).
		expect(gatewayExpandArgs("ownable", "Order")).toEqual({
			behavior: "ownable",
			entity: "Order",
		});
	});
});
