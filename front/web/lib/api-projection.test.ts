/**
 * Reproducibility mirror (S36) — the fast-check TS twin of the Go api-projection mirrors.
 * reflects=lib/api-projection ⇄ back/runtime/generators (api.go + pactverify.go),
 * test_kind=property, cert_language=fast-check, liveness=live, authority=below.
 *
 * Pins: byte-identity vs the Go emitter (the source hash 1c249219… + the output hash
 * 35daca1e… match Go), determinism, the POST /orders route faithfulness, the
 * no-add/drop/rename field set, the protected header + content address, and the PASS
 * verdict (the createOrder route passes its contract test — visible in the panel).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	contractJSON,
	emitAPI,
	emitContract,
	methodRoute,
	PROTECTED_MARKER,
	sourceHash,
	verifyContract,
} from "./api-projection";
import {
	CREATE_ORDER_OP,
	GO_OUTPUT_HASH,
	GO_SOURCE_HASH,
	ORDER_ENTITY,
} from "./api-projection-data";

describe("api-projection twin — cross-language byte-identity (the Go anchor)", () => {
	it("the source hash matches the Go emitter (operation ⊕ entity)", () => {
		expect(sourceHash(CREATE_ORDER_OP, ORDER_ENTITY)).toBe(GO_SOURCE_HASH);
	});

	it("the emitted handler output hash matches the Go emitter", () => {
		const art = emitAPI(CREATE_ORDER_OP, ORDER_ENTITY);
		expect(art.source_hash).toBe(GO_SOURCE_HASH);
		expect(art.output_hash).toBe(GO_OUTPUT_HASH);
	});

	it("the handler carries the protected header + the source hash", () => {
		const art = emitAPI(CREATE_ORDER_OP, ORDER_ENTITY);
		expect(art.bytes).toContain(PROTECTED_MARKER);
		expect(art.bytes).toContain(GO_SOURCE_HASH);
		expect(art.bytes).toContain("operation.Interpret"); // delegates to S10
	});
});

describe("api-projection twin — the route/method come from the operation", () => {
	it("createOrder maps to POST /orders (not invented)", () => {
		const { method, route } = methodRoute(ORDER_ENTITY.name);
		expect(method).toBe("POST");
		expect(route).toBe("/orders");
	});
});

describe("api-projection twin — Pact contract + provider verification", () => {
	it("the createOrder route passes its contract test (THE done criterion)", () => {
		const c = emitContract(CREATE_ORDER_OP, ORDER_ENTITY);
		const v = verifyContract(c, ORDER_ENTITY);
		expect(v.pass).toBe(true);
		expect(v.interactions).toHaveLength(1);
	});

	it("the contract pins POST /orders and status 201", () => {
		const c = emitContract(CREATE_ORDER_OP, ORDER_ENTITY);
		expect(c.interactions[0].request.method).toBe("POST");
		expect(c.interactions[0].request.path).toBe("/orders");
		expect(c.interactions[0].response.status).toBe(201);
	});

	it("the contract JSON is stable, valid Pact-v3", () => {
		const c = emitContract(CREATE_ORDER_OP, ORDER_ENTITY);
		const j = JSON.parse(contractJSON(c));
		expect(j.metadata.pactSpecification.version).toBe("3.0.0");
		// re-render is byte-stable.
		expect(contractJSON(c)).toBe(contractJSON(c));
	});

	it("∀ entity: the response field set == the entity attribute set (no add/drop/rename)", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						name: fc.stringMatching(/^[a-z]{1,6}$/),
						required: fc.boolean(),
					}),
					{ minLength: 1, maxLength: 5 },
				),
				(extra) => {
					const seen = new Set<string>(["id"]);
					const attrs = ORDER_ENTITY.attributes.slice(0, 1).concat(
						extra
							.filter((x) => {
								if (seen.has(x.name)) return false;
								seen.add(x.name);
								return true;
							})
							.map((x) => ({
								name: x.name,
								type: "string" as const,
								required: x.required,
							})),
					);
					const e = { name: "Order", attributes: attrs };
					const c = emitContract(CREATE_ORDER_OP, e);
					const respKeys = Object.keys(c.interactions[0].response.body).sort();
					const attrNames = attrs.map((a) => a.name).sort();
					expect(respKeys).toEqual(attrNames);
					expect(verifyContract(c, e).pass).toBe(true);
				},
			),
		);
	});
});

describe("api-projection twin — determinism", () => {
	it("emitAPI is byte-identical on a re-emit", () => {
		const a = emitAPI(CREATE_ORDER_OP, ORDER_ENTITY);
		const b = emitAPI(CREATE_ORDER_OP, ORDER_ENTITY);
		expect(a.bytes).toBe(b.bytes);
		expect(a.output_hash).toBe(b.output_hash);
	});
});
