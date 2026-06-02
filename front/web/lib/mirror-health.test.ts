import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	computeCompleteness,
	type Layer,
	type Mirror,
	mirrorsFor,
	noOrphanMirror,
	noTruthWithoutMirror,
} from "./mirror-health";

/**
 * Reproducibility mirror (fast-check + Vitest): the TS completeness port is a
 * pure total function — same input → same output — and it computes exactly what
 * the Go core (back/kernel/mirror/records) computes on the same cases. The two
 * heads of the law (Go runner + TS panel) never drift (determinism-first).
 */

const ctrl = (id: string, v = "v1"): Layer => ({
	layerId: id,
	version: v,
	kind: "control",
});

const livingFixture = (
	id: string,
	reflects: { layerId: string; version: string },
): Mirror => ({
	mirrorId: id,
	reflects,
	testKind: "fixture",
	certLanguage: "fixture",
	authority: "above",
	liveness: "alive",
	contentHash: id,
});

describe("the completeness law (TS port of the Go core)", () => {
	it("no_truth_without_mirror — a layer with no living mirror is a monster (red)", () => {
		const r = computeCompleteness([], [ctrl("checkout-button")]);
		expect(r.verdict).toBe("RED_MONSTER");
		expect(r.monsters).toEqual([
			{
				reason: "no_truth_without_mirror",
				layerId: "checkout-button",
				version: "v1",
				kind: "control",
				missingTestKind: "fixture",
			},
		]);
	});

	it("no_orphan_mirror — a mirror reflecting nothing is a monster (red)", () => {
		const layer = ctrl("checkout-button");
		const orphan = livingFixture("orphan", {
			layerId: "checkout-button",
			version: "v0",
		});
		const r = computeCompleteness(
			[
				livingFixture("live", { layerId: "checkout-button", version: "v1" }),
				orphan,
			],
			[layer],
		);
		expect(r.verdict).toBe("RED_MONSTER");
		expect(noOrphanMirror([orphan], [layer])).toEqual([
			{
				reason: "no_orphan_mirror",
				mirrorId: "orphan",
				layerId: "checkout-button",
				version: "v0",
			},
		]);
	});

	it("a living, reflecting, executable mirror is alive → COMPLETE", () => {
		const layer = ctrl("checkout-button");
		const r = computeCompleteness(
			[livingFixture("m1", { layerId: "checkout-button", version: "v1" })],
			[layer],
		);
		expect(r.verdict).toBe("COMPLETE");
		expect(r.monsters).toHaveLength(0);
	});

	it("a non-executable cert_language does NOT count toward completeness (red)", () => {
		const layer = ctrl("checkout-button");
		const prose: Mirror = {
			mirrorId: "prose",
			reflects: { layerId: "checkout-button", version: "v1" },
			testKind: "fixture",
			certLanguage: "prose",
			authority: "above",
			liveness: "alive",
			contentHash: "p",
		};
		const r = computeCompleteness([prose], [layer]);
		expect(r.verdict).toBe("RED_MONSTER");
		expect(r.monsters[0]?.reason).toBe("no_truth_without_mirror");
	});

	it("a dead mirror does not count", () => {
		const layer = ctrl("checkout-button");
		const dead = {
			...livingFixture("m", { layerId: "checkout-button", version: "v1" }),
			liveness: "dead" as const,
		};
		expect(computeCompleteness([dead], [layer]).verdict).toBe("RED_MONSTER");
	});

	it("the wrong test_kind does not satisfy the required one", () => {
		const layer = ctrl("checkout-button"); // requires fixture
		const e2e = {
			...livingFixture("m", { layerId: "checkout-button", version: "v1" }),
			testKind: "e2e",
		};
		const got = noTruthWithoutMirror([e2e], [layer]);
		expect(got).toHaveLength(1);
		expect(got[0]?.missingTestKind).toBe("fixture");
	});

	it("the demo 'monster' scenario is RED with both monster kinds", () => {
		const r = computeCompleteness(mirrorsFor("monster"), [
			{ layerId: "checkout-button", version: "v1", kind: "control" },
			{ layerId: "place-order", version: "v1", kind: "operation" },
			{ layerId: "order", version: "v1", kind: "entity" },
			{ layerId: "cart-view", version: "v1", kind: "view" },
			{ layerId: "pricing-policy", version: "v1", kind: "policy" },
		]);
		expect(r.verdict).toBe("RED_MONSTER");
		const reasons = new Set(r.monsters.map((m) => m.reason));
		expect(reasons.has("no_truth_without_mirror")).toBe(true);
		expect(reasons.has("no_orphan_mirror")).toBe(true);
	});

	it("the demo 'complete' scenario is COMPLETE", () => {
		const r = computeCompleteness(mirrorsFor("complete"), [
			{ layerId: "checkout-button", version: "v1", kind: "control" },
			{ layerId: "place-order", version: "v1", kind: "operation" },
			{ layerId: "order", version: "v1", kind: "entity" },
			{ layerId: "cart-view", version: "v1", kind: "view" },
			{ layerId: "pricing-policy", version: "v1", kind: "policy" },
		]);
		expect(r.verdict).toBe("COMPLETE");
		expect(r.monsters).toHaveLength(0);
	});

	it("is deterministic — same input → same output (reproducibility)", () => {
		const arbMirror = fc.record({
			mirrorId: fc.constantFrom("m1", "m2", "m3"),
			reflects: fc.record({
				layerId: fc.constantFrom("a", "b", "ghost"),
				version: fc.constantFrom("v1", "v0"),
			}),
			testKind: fc.constantFrom("fixture", "e2e", "schema"),
			certLanguage: fc.constantFrom("fixture", "gherkin", "prose"),
			authority: fc.constantFrom("above", "below") as fc.Arbitrary<
				"above" | "below"
			>,
			liveness: fc.constantFrom("alive", "dead") as fc.Arbitrary<
				"alive" | "dead"
			>,
			contentHash: fc.constantFrom("h1", "h2"),
		});
		const arbLayer = fc.record({
			layerId: fc.constantFrom("a", "b"),
			version: fc.constantFrom("v1", "v0"),
			kind: fc.constantFrom("control", "view", "product"),
		});
		fc.assert(
			fc.property(
				fc.array(arbMirror, { maxLength: 6 }),
				fc.array(arbLayer, { maxLength: 4 }),
				(mirrors, layers) => {
					const a = computeCompleteness(mirrors, layers);
					const b = computeCompleteness(mirrors, layers);
					expect(a).toEqual(b);
					expect(a.verdict === "COMPLETE").toBe(a.monsters.length === 0);
				},
			),
		);
	});
});
