/**
 * Reproducibility mirror (∀) for the stable-phase coherent-cut projection (lib/phase-stable.ts),
 * the TS twin of back/archive/phases's rapid property test. fast-check is the frozen front
 * invariant slot (ADR 0003). It pins KRD §43: isStable is total + deterministic, the empty cut is
 * always stable, any red mirror (a red sensor OR a non-green link) makes it unstable, stable ⇔ all
 * links green ∧ all sensors green (both ways), reasons empty ⇔ stable, and isStable never throws.
 * Plus the canonical-example unit rows (the done criteria, rendered by /phase-stable).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Heads,
	isStable,
	type Link,
	type LinkKind,
	resolve,
	type SensorStatus,
} from "./phase-stable";
import {
	EMPTY_CUT,
	GREEN_CUT,
	RED_SENSOR_CUT,
	STALE_LINK_CUT,
} from "./phase-stable-data";

const KINDS: readonly LinkKind[] = [
	"projects_to",
	"derives_from",
	"contracts_with",
	"triggers",
	"binds",
	"mirrors",
];
const TO_IDS = ["createOrder", "Order"];
const VERSIONS = ["v1", "v2", "v3"];
const SENSOR_IDS = ["createOrder.fixture", "Order.schema.fixture"];

const arbLink: fc.Arbitrary<Link> = fc.record({
	kind: fc.constantFrom(...KINDS),
	from: fc.constant({ id: "checkout-submit", version: "v1" }),
	to: fc.record({
		id: fc.constantFrom(...TO_IDS),
		version: fc.constantFrom(...VERSIONS),
	}),
});

const arbSensor: fc.Arbitrary<SensorStatus> = fc.record({
	id: fc.constantFrom(...SENSOR_IDS),
	pass: fc.boolean(),
});

const arbHeads: fc.Arbitrary<Heads> = fc
	.record({
		createOrder: fc.option(fc.constantFrom(...VERSIONS), { nil: undefined }),
		Order: fc.option(fc.constantFrom("v1", "v2"), { nil: undefined }),
	})
	.map((h) => {
		const out: Heads = {};
		if (h.createOrder !== undefined) out.createOrder = h.createOrder;
		if (h.Order !== undefined) out.Order = h.Order;
		return out;
	});

/** The reference oracle: every link resolves green AND every sensor is green. */
function allGreen(
	heads: Heads,
	ls: readonly Link[],
	sensors: readonly SensorStatus[],
): boolean {
	return (
		ls.every((l) => resolve(l, heads) === "green") &&
		sensors.every((s) => s.pass)
	);
}

describe("isStable — reproducibility mirror (KRD §43)", () => {
	it("is deterministic: same input ⇒ same (stable, reasons)", () => {
		fc.assert(
			fc.property(
				arbHeads,
				fc.array(arbLink, { maxLength: 4 }),
				fc.array(arbSensor, { maxLength: 4 }),
				(heads, ls, sensors) => {
					const a = isStable({}, heads, ls, sensors);
					const b = isStable({}, heads, ls, sensors);
					expect(a.stable).toBe(b.stable);
					expect(a.reasons).toEqual(b.reasons);
				},
			),
		);
	});

	it("the empty cut is ALWAYS stable (the base case)", () => {
		const p = isStable({}, {}, [], []);
		expect(p.stable).toBe(true);
		expect(p.reasons).toEqual([]);
	});

	it("stable ⇔ every link green ∧ every sensor green (both ways)", () => {
		fc.assert(
			fc.property(
				arbHeads,
				fc.array(arbLink, { maxLength: 4 }),
				fc.array(arbSensor, { maxLength: 4 }),
				(heads, ls, sensors) => {
					const p = isStable({}, heads, ls, sensors);
					expect(p.stable).toBe(allGreen(heads, ls, sensors));
				},
			),
		);
	});

	it("any red mirror (red sensor OR non-green link) ⇒ unstable", () => {
		fc.assert(
			fc.property(
				arbHeads,
				fc.array(arbLink, { maxLength: 4 }),
				fc.array(arbSensor, { maxLength: 4 }),
				(heads, ls, sensors) => {
					if (!allGreen(heads, ls, sensors)) {
						expect(isStable({}, heads, ls, sensors).stable).toBe(false);
					}
				},
			),
		);
	});

	it("reasons empty ⇔ stable; every reason names a real offender", () => {
		fc.assert(
			fc.property(
				arbHeads,
				fc.array(arbLink, { maxLength: 4 }),
				fc.array(arbSensor, { maxLength: 4 }),
				(heads, ls, sensors) => {
					const p = isStable({}, heads, ls, sensors);
					expect(p.reasons.length === 0).toBe(p.stable);
					const legit = new Set<string>();
					for (const s of sensors) if (!s.pass) legit.add(s.id);
					for (const l of ls) {
						const st = resolve(l, heads);
						if (st !== "green")
							legit.add(
								`${l.from.id}@${l.from.version}->${l.to.id}@${l.to.version} (${st})`,
							);
					}
					for (const r of p.reasons) expect(legit.has(r)).toBe(true);
				},
			),
		);
	});

	it("never throws (totality)", () => {
		fc.assert(
			fc.property(
				arbHeads,
				fc.array(arbLink, { maxLength: 4 }),
				fc.array(arbSensor, { maxLength: 4 }),
				(heads, ls, sensors) => {
					expect(() => isStable({}, heads, ls, sensors)).not.toThrow();
				},
			),
		);
	});
});

describe("the canonical §43 cuts — the done criteria rendered by /phase-stable", () => {
	it("the EMPTY cut is STABLE (the base done criterion)", () => {
		const p = isStable(
			EMPTY_CUT.cut,
			EMPTY_CUT.heads,
			EMPTY_CUT.links,
			EMPTY_CUT.sensors,
		);
		expect(p.stable).toBe(true);
		expect(p.reasons).toEqual([]);
	});

	it("an all-green cut is STABLE", () => {
		const p = isStable(
			GREEN_CUT.cut,
			GREEN_CUT.heads,
			GREEN_CUT.links,
			GREEN_CUT.sensors,
		);
		expect(p.stable).toBe(true);
	});

	it("a cut with one red sensor is UNSTABLE and names it (THE done criterion)", () => {
		const p = isStable(
			RED_SENSOR_CUT.cut,
			RED_SENSOR_CUT.heads,
			RED_SENSOR_CUT.links,
			RED_SENSOR_CUT.sensors,
		);
		expect(p.stable).toBe(false);
		expect(p.reasons).toContain("createOrder.fixture");
	});

	it("a cut with one stale link is UNSTABLE and names it", () => {
		const p = isStable(
			STALE_LINK_CUT.cut,
			STALE_LINK_CUT.heads,
			STALE_LINK_CUT.links,
			STALE_LINK_CUT.sensors,
		);
		expect(p.stable).toBe(false);
		expect(
			p.reasons.some(
				(r) => r.includes("createOrder@v2") && r.includes("stale"),
			),
		).toBe(true);
	});
});
