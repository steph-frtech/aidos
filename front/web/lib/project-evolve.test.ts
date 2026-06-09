import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	cull,
	type FixedMirror,
	nicheKey,
	niches,
	promote,
	type Variant,
} from "./project-evolve";

const M: FixedMirror = {
	projectId: "shop",
	mirrorId: "m-createOrder",
	behavior: "createOrder",
};

const arbVariant = (projectId: string): fc.Arbitrary<Variant> =>
	fc.record({
		projectId: fc.constantFrom(projectId, `other-${projectId}`),
		id: fc.stringMatching(/^v[0-9]{1,4}$/),
		niche: fc.constantFrom("a", "b", "createOrder/fast", "createOrder/cheap"),
		mirror: fc.constantFrom<"green" | "red">("green", "red"),
		outOfSample: fc.constantFrom<"green" | "red">("green", "red"),
		fitness: fc.double({ min: 0, max: 1, noNaN: true }),
	});

describe("S108 project-evolve twin — done-criteria", () => {
	it("kills a mirror-breaking variant even at higher fitness", () => {
		const variants: Variant[] = [
			{
				projectId: "shop",
				id: "v-green",
				niche: "createOrder/fast",
				mirror: "green",
				outOfSample: "green",
				fitness: 0.9,
			},
			{
				projectId: "shop",
				id: "v-broken",
				niche: "createOrder/fast",
				mirror: "red",
				outOfSample: "green",
				fitness: 0.99,
			},
		];
		const c = cull(M, variants);
		expect(c.survivors.map((v) => v.id)).toEqual(["v-green"]);
		expect(c.killed).toEqual(["v-broken"]);
		// The higher-fitness mirror-breaker can never be the élite.
		const n = niches(M, variants);
		expect(n.get("shop::createOrder/fast")?.id).toBe("v-green");
	});

	it("a green élite is promotable only with authority", () => {
		const v: Variant = {
			projectId: "shop",
			id: "v-green",
			niche: "createOrder/fast",
			mirror: "green",
			outOfSample: "green",
			fitness: 0.9,
		};
		expect(promote(M, v, false).verdict).toBe("refused");
		const ok = promote(M, v, true);
		expect(ok.verdict).toBe("proposed");
		expect(ok.writesTruth).toBe(false);
		expect(ok.proposal).toBe(true);
	});

	it("refuses out-of-sample-red even with authority", () => {
		const v: Variant = {
			projectId: "shop",
			id: "v-overfit",
			niche: "createOrder/fast",
			mirror: "green",
			outOfSample: "red",
			fitness: 0.95,
		};
		expect(promote(M, v, true).verdict).toBe("refused");
	});

	it("refuses a cross-project variant (the wall)", () => {
		const foreign: Variant = {
			projectId: "blog",
			id: "v-foreign",
			niche: "createOrder/fast",
			mirror: "green",
			outOfSample: "green",
			fitness: 0.99,
		};
		const res = promote(M, foreign, true);
		expect(res.verdict).toBe("refused");
		expect(res.blockCode).toBe("SANDBOX_ESCAPE");
	});
});

describe("S108 project-evolve twin — invariants (fast-check)", () => {
	it("no élite ever breaks the mirror and is always in-project", () => {
		fc.assert(
			fc.property(fc.array(arbVariant("shop"), { maxLength: 12 }), (vs) => {
				for (const e of niches(M, vs).values()) {
					expect(e.mirror).toBe("green");
					expect(e.projectId).toBe("shop");
				}
			}),
		);
	});

	it("is deterministic (same input → same niches)", () => {
		fc.assert(
			fc.property(fc.array(arbVariant("shop"), { maxLength: 12 }), (vs) => {
				const a = niches(M, vs);
				const b = niches(M, vs);
				expect([...a.entries()].map(([k, v]) => [k, v.id])).toEqual(
					[...b.entries()].map(([k, v]) => [k, v.id]),
				);
			}),
		);
	});

	it("one élite per niche is the max-fitness in-project green survivor", () => {
		fc.assert(
			fc.property(fc.array(arbVariant("shop"), { maxLength: 12 }), (vs) => {
				const survivors = cull(M, vs).survivors;
				for (const [key, e] of niches(M, vs)) {
					const best = Math.max(
						...survivors
							.filter((s) => nicheKey(s) === key)
							.map((s) => s.fitness),
					);
					expect(e.fitness).toBe(best);
				}
			}),
		);
	});
});
