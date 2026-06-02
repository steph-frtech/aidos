/**
 * Reproducibility mirror (∀) for the red-wave impact projection (lib/red-wave.ts), the TS twin of
 * back/runtime/redwave's rapid property test. fast-check is the frozen front invariant slot (ADR
 * 0003). It pins KRD §42/§98/§112 + ADR 0020: impact is total + deterministic, the wave is exactly
 * the set of reachable load-bearing stale links, the mirror comes before any projection, a cosmetic
 * edge never propagates, enqueue writes exactly |wave| rows all stamped with the wave_id, and impact
 * never throws. Plus the canonical-example unit rows (the done criteria, rendered by /red-wave).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Edge,
	enqueue,
	type Heads,
	impact,
	isEmpty,
	type Layer,
	type LinkKind,
	resolve,
} from "./red-wave";
import { LABEL_BTN_BUMP, ORDER_BUMP, SUBMIT_BTN_BUMP } from "./red-wave-data";

const KINDS: readonly LinkKind[] = [
	"projects_to",
	"derives_from",
	"contracts_with",
	"triggers",
	"binds",
	"mirrors",
];
const LAYERS: readonly Layer[] = [
	"mirror",
	"projection",
	"operation_action",
	"button",
];
const IDS = [
	"Order",
	"api",
	"db",
	"types",
	"submit-btn",
	"checkout-view",
	"label-btn",
	"createOrder",
	"Order.schema.fixture",
];

const idArb = fc.constantFrom(...IDS);
const versionArb = fc.constantFrom("v1", "v2", "v3");

const edgeArb: fc.Arbitrary<Edge> = fc.record({
	link: fc.record({
		kind: fc.constantFrom<LinkKind>(...KINDS),
		from: fc.record({ id: idArb, version: versionArb }),
		to: fc.record({ id: idArb, version: versionArb }),
	}),
	loadBearing: fc.boolean(),
	layer: fc.constantFrom<Layer>(...LAYERS),
});

const headsArb: fc.Arbitrary<Heads> = fc
	.array(fc.tuple(idArb, versionArb), { maxLength: 5 })
	.map((pairs) => Object.fromEntries(pairs));

const bumpedArb = fc.array(idArb, { maxLength: 3 });

describe("red-wave impact — ∀ invariants (the TS twin of redwave's rapid property)", () => {
	it("Invariant 1 — impact is deterministic (same inputs ⇒ identical ordered wave)", () => {
		fc.assert(
			fc.property(
				bumpedArb,
				fc.array(edgeArb, { maxLength: 8 }),
				headsArb,
				(bumped, edges, heads) => {
					const a = impact(bumped, edges, heads);
					const b = impact(bumped, edges, heads);
					expect(a).toEqual(b);
				},
			),
		);
	});

	it("Invariant 2 — every item corresponds to a reachable, load-bearing, stale link", () => {
		fc.assert(
			fc.property(
				bumpedArb,
				fc.array(edgeArb, { maxLength: 8 }),
				headsArb,
				(bumped, edges, heads) => {
					const w = impact(bumped, edges, heads);
					const redTargets = new Set<string>(bumped);
					for (const it of w.items) redTargets.add(it.target);
					for (const it of w.items) {
						expect(it.dependencies.length).toBeGreaterThan(0);
						const ok = it.dependencies.some((dep) =>
							edges.some(
								(e) =>
									e.link.from.id === it.target &&
									e.link.to.id === dep &&
									e.loadBearing &&
									redTargets.has(dep) &&
									resolve(e.link, heads) !== "green",
							),
						);
						expect(ok).toBe(true);
					}
				},
			),
		);
	});

	it("Invariant 3 — the mirror(s) appear before any projection (mirror-first)", () => {
		fc.assert(
			fc.property(
				bumpedArb,
				fc.array(edgeArb, { maxLength: 8 }),
				headsArb,
				(bumped, edges, heads) => {
					const w = impact(bumped, edges, heads);
					let lastMirror = -1;
					let firstNonMirror = -1;
					w.items.forEach((it, i) => {
						if (it.layer === "mirror") lastMirror = i;
						else if (firstNonMirror === -1) firstNonMirror = i;
					});
					if (lastMirror >= 0 && firstNonMirror >= 0) {
						expect(lastMirror).toBeLessThan(firstNonMirror);
					}
				},
			),
		);
	});

	it("Invariant 4 — a cosmetic edge never propagates red to its consumer", () => {
		fc.assert(
			fc.property(idArb, idArb, (from, to) => {
				if (from === to) return;
				const e: Edge = {
					link: {
						kind: "derives_from",
						from: { id: from, version: "v1" },
						to: { id: to, version: "v1" },
					},
					loadBearing: false,
					layer: "button",
				};
				const w = impact([to], [e], { [to]: "v2" });
				expect(w.items.some((it) => it.target === from)).toBe(false);
			}),
		);
	});

	it("Invariant 5 — enqueue writes exactly |wave| rows, all stamped with the wave_id", () => {
		fc.assert(
			fc.property(
				bumpedArb,
				fc.array(edgeArb, { maxLength: 8 }),
				headsArb,
				fc.constantFrom("h1", "h2", "deadbeef"),
				(bumped, edges, heads, waveId) => {
					const w = impact(bumped, edges, heads);
					const rows = enqueue(w, waveId);
					expect(rows.length).toBe(w.items.length);
					for (const r of rows) {
						expect(r.waveId).toBe(waveId);
						expect(r.reason).not.toBe("");
					}
				},
			),
		);
	});

	it("Invariant 6 — impact never throws on arbitrary input", () => {
		fc.assert(
			fc.property(
				fc.array(fc.string(), { maxLength: 3 }),
				fc.array(edgeArb, { maxLength: 8 }),
				headsArb,
				(bumped, edges, heads) => {
					expect(() => impact(bumped, edges, heads)).not.toThrow();
				},
			),
		);
	});
});

describe("red-wave — the canonical done criteria (rendered by /red-wave)", () => {
	it("part 1 — an Order entity bump reddens its mirror FIRST then api/db/types", () => {
		const w = impact(ORDER_BUMP.bumped, ORDER_BUMP.edges, ORDER_BUMP.heads);
		expect(w.items.length).toBe(4);
		expect(w.items[0].target).toBe("Order.schema.fixture");
		expect(w.items[0].layer).toBe("mirror");
		const targets = w.items.map((it) => it.target);
		for (const proj of ["api", "db", "types"]) expect(targets).toContain(proj);
		const mirrorIdx = targets.indexOf("Order.schema.fixture");
		for (const proj of ["api", "db", "types"]) {
			expect(targets.indexOf(proj)).toBeGreaterThan(mirrorIdx);
		}
	});

	it("part 2 — a load-bearing submit-btn bump reddens checkout-view", () => {
		const w = impact(
			SUBMIT_BTN_BUMP.bumped,
			SUBMIT_BTN_BUMP.edges,
			SUBMIT_BTN_BUMP.heads,
		);
		expect(w.items.some((it) => it.target === "checkout-view")).toBe(true);
	});

	it("negative — a cosmetic label-btn bump does NOT redden checkout-view (empty wave)", () => {
		const w = impact(
			LABEL_BTN_BUMP.bumped,
			LABEL_BTN_BUMP.edges,
			LABEL_BTN_BUMP.heads,
		);
		expect(isEmpty(w)).toBe(true);
		expect(w.items.some((it) => it.target === "checkout-view")).toBe(false);
	});

	it("no bump ⇒ empty wave, enqueue writes 0 rows", () => {
		const w = impact([], ORDER_BUMP.edges, ORDER_BUMP.heads);
		expect(isEmpty(w)).toBe(true);
		expect(enqueue(w, "x").length).toBe(0);
	});
});
