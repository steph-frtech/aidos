/**
 * S90 — emitted-app API-surface REPRODUCIBILITY + PROVIDER-VERIFICATION mirror
 * (Vitest + fast-check). reflects=s90-api-surface-emission · test_kind=property.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the OpenAPI / router / Pact suite are PURE
 * functions of the Kernel cut — same spec → byte-identical bytes (the done-criterion
 * "l'OpenAPI est byte-stable depuis le Kernel"). Pins:
 *   1. OpenAPI byte-stable across re-emission;
 *   2. OpenAPI order-independent (an input-order shuffle does not change the bytes);
 *   3. router byte-stable + order-independent;
 *   4. one Pact contract per SYNC op;
 *   5. sourceHash sensitive to an added attribute (content-address honesty);
 *   6. createOrder-class persists (a 201 response field set = the entity);
 *   7. a policy DENY is enforced (the authorize op denies the __deny__ marker → 403);
 *   8. verifySuite PASSES on all emitted endpoints.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type ApiSpec,
	type Attribute,
	emitOpenAPI,
	emitPactSuite,
	emitRouter,
	type Op,
	sidecarVerdict,
	sourceHash,
	syncOps,
	verifySuite,
} from "./api-surface";

const ORDER = {
	name: "Order",
	attributes: [
		{ name: "id", type: "int", required: true },
		{ name: "customer", type: "string", required: true },
		{ name: "total", type: "decimal", required: true },
		{ name: "placed_at", type: "timestamptz", required: true },
	] as Attribute[],
};

function createOrderOp(): Op {
	return {
		name: "createOrder",
		entity: ORDER,
		verb: "POST",
		authorize: true,
		input: [{ name: "cartId", type: "string", required: true }],
	};
}

function twoOpSpec(): ApiSpec {
	return {
		project: "shop",
		ops: [createOrderOp(), { name: "listOrders", entity: ORDER, verb: "GET" }],
	};
}

// a small fast-check generator for projectable specs.
const scalarArb = fc.constantFrom(
	"string",
	"int",
	"decimal",
	"bool",
	"timestamptz",
);
const attrArb = fc.record({
	name: fc.stringMatching(/^[a-z][a-z0-9]{0,6}$/),
	type: scalarArb,
	required: fc.boolean(),
});
const entityArb = fc.record({
	name: fc.stringMatching(/^[A-Z][a-zA-Z]{1,7}$/),
	attributes: fc.uniqueArray(attrArb, {
		minLength: 1,
		maxLength: 4,
		selector: (a) => a.name,
	}),
});
const opArb = fc.record({
	name: fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,8}$/),
	entity: entityArb,
	verb: fc.constantFrom("POST", "GET"),
	authorize: fc.boolean(),
	async: fc.boolean(),
}) as fc.Arbitrary<Op>;
const specArb = fc.record({
	project: fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/),
	ops: fc.uniqueArray(opArb, {
		minLength: 1,
		maxLength: 5,
		selector: (o) => o.name,
	}),
}) as fc.Arbitrary<ApiSpec>;

function rotate(s: ApiSpec, by: number): ApiSpec {
	if (s.ops.length < 2) return s;
	const k = by % s.ops.length;
	return { project: s.project, ops: [...s.ops.slice(k), ...s.ops.slice(0, k)] };
}

describe("S90 api-surface — reproducibility", () => {
	it("1. OpenAPI is byte-stable across re-emission", () => {
		fc.assert(
			fc.property(specArb, (s) => {
				const a = emitOpenAPI(s);
				const b = emitOpenAPI(s);
				expect(a.ok && b.ok).toBe(true);
				expect(a.bytes).toBe(b.bytes);
			}),
		);
	});

	it("2. OpenAPI is order-independent (input shuffle does not change the bytes)", () => {
		fc.assert(
			fc.property(specArb, fc.nat(), (s, by) => {
				const a = emitOpenAPI(s);
				const c = emitOpenAPI(rotate(s, by));
				expect(a.bytes).toBe(c.bytes);
				expect(a.outputHash).toBe(c.outputHash);
			}),
		);
	});

	it("3. the router is byte-stable + order-independent", () => {
		fc.assert(
			fc.property(specArb, fc.nat(), (s, by) => {
				const a = emitRouter(s);
				const c = emitRouter(rotate(s, by));
				expect(a.bytes).toBe(c.bytes);
			}),
		);
	});

	it("4. the Pact suite has exactly one contract per SYNC op", () => {
		fc.assert(
			fc.property(specArb, (s) => {
				const suite = emitPactSuite(s);
				expect(suite.ok).toBe(true);
				expect(suite.contracts!.length).toBe(syncOps(s).length);
			}),
		);
	});

	it("5. sourceHash is sensitive to an added attribute", () => {
		fc.assert(
			fc.property(specArb, (s) => {
				const h1 = sourceHash(s);
				const s2: ApiSpec = {
					project: s.project,
					ops: s.ops.map((o, i) =>
						i === 0
							? {
									...o,
									entity: {
										...o.entity,
										attributes: [
											...o.entity.attributes,
											{ name: "extrafld", type: "string" },
										],
									},
								}
							: o,
					),
				};
				expect(sourceHash(s2)).not.toBe(h1);
			}),
		);
	});
});

describe("S90 api-surface — runtime (createOrder + policy DENY + verify)", () => {
	it("6. a createOrder-class persists the entity field set (201)", () => {
		const op = createOrderOp();
		const verdict = sidecarVerdict(op, {
			cartId: "c1",
			id: 1,
			customer: "ana",
			total: "15",
			placed_at: "1970-01-01T00:00:00Z",
		});
		expect(verdict.denied).toBe(false);
		expect(Object.keys(verdict.result).sort()).toEqual([
			"customer",
			"id",
			"placed_at",
			"total",
		]);
	});

	it("7. a policy DENY is enforced at the runtime boundary (403)", () => {
		const op = createOrderOp();
		expect(sidecarVerdict(op, { cartId: "c1", __deny__: true }).denied).toBe(
			true,
		);
		expect(sidecarVerdict(op, { cartId: "c1" }).denied).toBe(false);
	});

	it("8. verifySuite passes on all emitted endpoints", () => {
		const res = verifySuite(twoOpSpec());
		expect(res.pass).toBe(true);
		expect(res.interactions.length).toBeGreaterThanOrEqual(2);
	});
});
