import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	CODE_CROSS_CELL_NO_CONTRACT,
	type ContextMap,
	canonicalize,
	checkCrossCellCall,
	propose,
	stableStringify,
	verifyAll,
	verifyPair,
} from "./context-map";

// The reproducibility mirror (S101) — fast-check property tests pinning determinism + the two
// done-criteria of the Context-Map twin, against the Go authoritative output.

const scene: ContextMap = {
	project: "shop",
	cells: ["checkout", "billing", "catalog"],
	surfaces: [
		{
			cell: "billing",
			published: [
				{
					method: "POST",
					path: "/charges",
					fields: ["amount", "orderId", "status"],
					status: 201,
				},
			],
		},
		{
			cell: "catalog",
			published: [
				{ method: "GET", path: "/items", fields: ["sku"], status: 200 },
			],
		},
	],
	pairs: [
		{
			consumer: "checkout",
			provider: "billing",
			expected: [
				{
					method: "POST",
					path: "/charges",
					fields: ["amount", "orderId"],
					status: 201,
				},
			],
		},
		{
			consumer: "checkout",
			provider: "catalog",
			expected: [
				{
					method: "GET",
					path: "/items",
					fields: ["sku", "price"],
					status: 200,
				},
			],
		},
	],
};

describe("Context-Map — done criteria", () => {
	it("half 1 — a consumer/provider pair HONORS its contract (provider publishes a superset)", () => {
		const v = verifyPair(scene, scene.pairs[0]);
		expect(v.honored).toBe(true);
		expect(v.reason).toBe("HONORED");
	});

	it("the catalog pair is UNHONORED — the consumer requires a field the provider does not publish", () => {
		const v = verifyPair(scene, scene.pairs[1]);
		expect(v.honored).toBe(false);
		expect(v.reason).toBe("CONSUMER_FIELD_UNPUBLISHED");
	});

	it("a HONORED pair authorizes the cross-cell call", () => {
		expect(checkCrossCellCall("checkout", "billing", scene)).toBeNull();
	});

	it("half 2 — a cross-cell call that VIOLATES the contract is REFUSED", () => {
		const br = checkCrossCellCall("checkout", "catalog", scene);
		expect(br).not.toBeNull();
		expect(br?.code).toBe(CODE_CROSS_CELL_NO_CONTRACT);
	});

	it("own-cell access always passes; no-pair access is refused", () => {
		expect(checkCrossCellCall("checkout", "checkout", scene)).toBeNull();
		expect(checkCrossCellCall("billing", "catalog", scene)).not.toBeNull();
	});

	it("propose returns a DRAFT envelope carrying the verdicts (the wall — never a direct write)", () => {
		const cs = propose(scene, "design shop", "phase-0");
		expect(cs.status).toBe("DRAFT");
		expect(cs.verdicts.length).toBe(2);
	});
});

const genInteraction = fc.record({
	method: fc.constantFrom("GET", "POST"),
	path: fc.constantFrom("/p", "/q"),
	fields: fc.subarray(["x", "y", "z"]),
	status: fc.constantFrom(0, 200, 201),
});

const genMap: fc.Arbitrary<ContextMap> = fc
	.array(fc.constantFrom("a", "b", "c", "d"), { minLength: 1, maxLength: 4 })
	.chain((rawCells) => {
		const cells = [...new Set(rawCells)];
		return fc
			.record({
				surfaces: fc.tuple(
					...cells.map((c) =>
						fc
							.array(genInteraction, { maxLength: 2 })
							.map((published) => ({ cell: c, published })),
					),
				),
				pairs: fc.array(
					fc.record({
						consumer: fc.constantFrom(...cells),
						provider: fc.constantFrom(...cells),
						expected: fc.array(genInteraction, { maxLength: 2 }),
					}),
					{ maxLength: 4 },
				),
			})
			.map(({ surfaces, pairs }) => ({ project: "p", cells, surfaces, pairs }));
	});

describe("Context-Map — properties (determinism-first)", () => {
	it("reproducible — same map → same hash input + same verdicts", () => {
		fc.assert(
			fc.property(genMap, (map) => {
				expect(stableStringify(map)).toBe(stableStringify(canonicalize(map)));
				expect(verifyAll(map)).toEqual(verifyAll(map));
			}),
		);
	});

	it("the wall is honor-gated — cross-cell call passes IFF a honored pair connects the cells", () => {
		fc.assert(
			fc.property(genMap, (map) => {
				for (const from of map.cells) {
					for (const to of map.cells) {
						if (from === to) continue;
						const honored = map.pairs.some(
							(p) =>
								verifyPair(map, p).honored &&
								((p.consumer === from && p.provider === to) ||
									(p.consumer === to && p.provider === from)),
						);
						const br = checkCrossCellCall(from, to, map);
						expect(br === null).toBe(honored);
						if (br) expect(br.code).toBe(CODE_CROSS_CELL_NO_CONTRACT);
					}
				}
			}),
		);
	});

	it("propose always yields a DRAFT (the wall)", () => {
		fc.assert(
			fc.property(genMap, (map) => {
				expect(propose(map, "x", "p0").status).toBe("DRAFT");
			}),
		);
	});
});
