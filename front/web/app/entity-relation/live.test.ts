import { describe, expect, it } from "vitest";
import {
	address,
	DEMO_BAD_RELATION,
	DEMO_ENTITIES,
	DEMO_RELATION,
	isBlocked,
	relationBody,
	relationId,
} from "../../lib/entity-relation";
import {
	demoAddress,
	demoResolve,
	gatewayAddressArgs,
	gatewayResolveArgs,
} from "../../lib/entity-relation-data";
import { addressDecoder, resolveDecoder } from "./live";

/**
 * /entity-relation live read — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092
 * kill-twins batch).
 *
 * It proves the TS `resolveDecoder` / `addressDecoder` decode a SAMPLE of the Go entity-relation
 * tools' output (entityrelationsrv.resolveOutput `{ ok, block? }` and addressOutput
 * `{ ok, id, body, block? }`, the block carrying snake_case `how_to_fix`) into the front verdicts
 * the panel renders — the tools' CONTRACT, NOT a second implementation of the resolve/hash logic
 * (back/kernel/entities/ref is authoritative). It also proves the demo fixtures
 * (lib/entity-relation-data) are byte-identical to what those decoders accept (the twin ≡ the live
 * contract shape), and that a malformed payload deterministically falls back to the demo.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("entity-relation live — relation_resolve decoder parity", () => {
	it("decodes a Go-sample resolveOutput (resolvable → ok:true, no block)", () => {
		const goSample = { ok: true };
		expect(resolveDecoder(goSample)).toEqual({ ok: true, block: null });
	});

	it("decodes a Go-sample resolveOutput (refused → ok:false + decodable block)", () => {
		const goSample = {
			ok: false,
			block: {
				code: "OUT_OF_SCOPE",
				severity: "blocking",
				explanation:
					"Relation refusée (UNKNOWN_RELATION_TARGET) : relation targets an entity outside the declared set: Ghost.",
				how_to_fix: ["declare_the_target", "use_a_known_kind"],
			},
		};
		const decoded = resolveDecoder(goSample);
		expect(decoded?.ok).toBe(false);
		expect(decoded?.block?.code).toBe("OUT_OF_SCOPE");
		expect(decoded?.block?.explanation).toContain("UNKNOWN_RELATION_TARGET");
		expect(decoded?.block?.how_to_fix).toEqual([
			"declare_the_target",
			"use_a_known_kind",
		]);
	});

	it("rejects a malformed resolve payload (→ demo fallback)", () => {
		expect(resolveDecoder(null)).toBeNull();
		expect(resolveDecoder({})).toBeNull(); // no `ok`
		expect(resolveDecoder({ ok: "yes" })).toBeNull(); // non-boolean ok
		// ok:false with NO decodable block → null (a refusal must carry its block).
		expect(resolveDecoder({ ok: false })).toBeNull();
		expect(resolveDecoder({ ok: false, block: { code: "X" } })).toBeNull(); // block missing required fields
	});
});

describe("entity-relation live — relation_address decoder parity", () => {
	it("decodes a Go-sample addressOutput (ok:true → id + body, no block)", () => {
		const id = relationId(DEMO_RELATION);
		const body = relationBody(DEMO_RELATION);
		const goSample = { ok: true, id, body };
		expect(addressDecoder(goSample)).toEqual({
			ok: true,
			id,
			body,
			block: null,
		});
	});

	it("decodes a Go-sample addressOutput (refused → ok:false + decodable block)", () => {
		const goSample = {
			ok: false,
			block: {
				code: "OUT_OF_SCOPE",
				severity: "blocking",
				explanation:
					"Relation refusée (UNKNOWN_RELATION_KIND) : unknown semantic: bogus.",
				how_to_fix: ["use_a_known_kind"],
			},
		};
		const decoded = addressDecoder(goSample);
		expect(decoded?.ok).toBe(false);
		expect(decoded?.id).toBe("");
		expect(decoded?.body).toBe("");
		expect(decoded?.block?.explanation).toContain("UNKNOWN_RELATION_KIND");
	});

	it("rejects a malformed address payload (→ demo fallback)", () => {
		expect(addressDecoder(null)).toBeNull();
		expect(addressDecoder({})).toBeNull(); // no `ok`
		// ok:true but missing id/body → null (the round-trip must be content-addressed).
		expect(addressDecoder({ ok: true })).toBeNull();
		expect(addressDecoder({ ok: true, id: "abc" })).toBeNull(); // no body
		// ok:false with no decodable block → null.
		expect(addressDecoder({ ok: false })).toBeNull();
	});
});

describe("entity-relation — demo fixtures ≡ the live contract shape", () => {
	it("demoResolve(resolvable) decodes through resolveDecoder unchanged (twin ≡ live)", () => {
		const demo = demoResolve(DEMO_RELATION, DEMO_ENTITIES);
		expect(demo).toEqual({ ok: true, block: null });
		// the demo verdict is itself a valid resolveOutput the decoder round-trips.
		expect(resolveDecoder({ ok: demo.ok })).toEqual(demo);
	});

	it("demoResolve(undeclared target) yields the UNKNOWN_RELATION_TARGET block", () => {
		const demo = demoResolve(DEMO_BAD_RELATION, DEMO_ENTITIES);
		expect(demo.ok).toBe(false);
		expect(demo.block?.explanation).toContain("UNKNOWN_RELATION_TARGET");
		// the demo block decodes through resolveDecoder as a faithful refusal.
		const re = resolveDecoder({ ok: false, block: demo.block });
		expect(re?.block).toEqual(demo.block);
	});

	it("demoAddress(valid) yields the SAME id+body as the twin address (round-trip)", () => {
		const demo = demoAddress(DEMO_RELATION);
		const out = address(DEMO_RELATION, [DEMO_RELATION.target]);
		expect(isBlocked(out)).toBe(false);
		expect(demo.ok).toBe(true);
		expect(demo.id).toBe(out as string);
		expect(demo.body).toBe(relationBody(DEMO_RELATION));
		// the demo address verdict decodes through addressDecoder unchanged.
		expect(
			addressDecoder({ ok: demo.ok, id: demo.id, body: demo.body }),
		).toEqual(demo);
	});

	it("the gateway-arg projections carry the relation + declared cut the tools expect", () => {
		const rArgs = gatewayResolveArgs(DEMO_RELATION, DEMO_ENTITIES);
		expect(rArgs.relation).toEqual(DEMO_RELATION);
		expect(rArgs.known).toEqual([...DEMO_ENTITIES]);
		const aArgs = gatewayAddressArgs(DEMO_RELATION);
		expect(aArgs.relation).toEqual(DEMO_RELATION);
	});
});
