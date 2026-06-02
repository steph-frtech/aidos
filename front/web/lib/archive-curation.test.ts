/**
 * Reproducibility mirror (∀) for the archive-curation projection (lib/archive-curation.ts), the TS
 * twin of back/archive/curation + back/archive/qd's rapid property tests. fast-check is the frozen
 * front invariant slot (ADR 0003). It pins KRD §44.4 / §62 / §123: curation determinism,
 * any-unsafe⇒tombstone, keep-band⇒keep, no-node-dropped; QD determinism, no-green⇒no-élite,
 * one-élite-per-niche-by-max-fitness, never-invents — so the /archive-curation screen decides
 * EXACTLY as the Go curation.Curate / qd.Elites deciders. Plus the done criteria on the canonical
 * examples (unsafe⇒tombstone still listed, élite⇒keep, green⇒niche cell filled, red⇒empty cell).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	curate,
	elites,
	type Flag,
	type MirrorStatus,
	type Node,
	nicheGrid,
	type Variant,
	type Verdict,
} from "./archive-curation";
import { NODES, NOW, VARIANTS } from "./archive-curation-data";

const NOW_MS = Date.parse("2026-06-01T00:00:00Z");
const VALID_VERDICTS: ReadonlySet<Verdict> = new Set<Verdict>([
	"keep",
	"compress",
	"tombstone",
]);

const flagArb = fc.constantFrom<Flag>(
	"unsafe",
	"obsolete_experiment",
	"pareto_elite",
	"incident_related",
	"high_novelty",
	"failed",
	"duplicate_behavior",
);

const nodeArb: fc.Arbitrary<Node> = fc.record({
	id: fc.string({ minLength: 1, maxLength: 8 }),
	kind: fc.constantFrom("", "stable_phase", "variant"),
	flags: fc.array(flagArb, { maxLength: 3 }),
	createdAt: fc.constantFrom(
		"",
		"2026-01-01T00:00:00Z",
		"2026-05-29T00:00:00Z",
	),
});

const mirrorArb = fc.constantFrom<MirrorStatus>("green", "red");
const variantArb: fc.Arbitrary<Variant> = fc.record({
	id: fc.string({ minLength: 1, maxLength: 8 }),
	niche: fc.constantFrom("n1", "n2", "n3", ""),
	mirror: mirrorArb,
	fitness: fc.double({ min: 0, max: 1, noNaN: true }),
});

describe("curation reproducibility (∀)", () => {
	it("is deterministic and total — same input ⇒ same decisions, verdict in the closed set", () => {
		fc.assert(
			fc.property(fc.array(nodeArb, { maxLength: 6 }), (nodes) => {
				const a = curate(nodes, NOW_MS);
				const b = curate(nodes, NOW_MS);
				expect(a).toEqual(b);
				for (const d of a) expect(VALID_VERDICTS.has(d.verdict)).toBe(true);
			}),
		);
	});

	it("any unsafe/obsolete node ⇒ tombstone (an unsafe branch is never silently kept)", () => {
		fc.assert(
			fc.property(nodeArb, (n) => {
				const [d] = curate([n], NOW_MS);
				if (
					n.flags.includes("unsafe") ||
					n.flags.includes("obsolete_experiment")
				) {
					expect(d.verdict).toBe("tombstone");
				}
			}),
		);
	});

	it("a keep-band node (and not unsafe/obsolete) ⇒ keep (critical history kept)", () => {
		fc.assert(
			fc.property(nodeArb, (n) => {
				if (
					n.flags.includes("unsafe") ||
					n.flags.includes("obsolete_experiment")
				)
					return;
				const keepWorthy =
					n.kind === "stable_phase" ||
					n.flags.includes("pareto_elite") ||
					n.flags.includes("incident_related") ||
					n.flags.includes("high_novelty");
				const [d] = curate([n], NOW_MS);
				if (keepWorthy) expect(d.verdict).toBe("keep");
			}),
		);
	});

	it("never drops a node — every input id appears exactly once", () => {
		fc.assert(
			fc.property(
				fc.uniqueArray(nodeArb, { selector: (n) => n.id, maxLength: 8 }),
				(nodes) => {
					const out = curate(nodes, NOW_MS);
					expect(out.length).toBe(nodes.length);
					const ids = new Set(out.map((d) => d.nodeId));
					for (const n of nodes) expect(ids.has(n.id)).toBe(true);
				},
			),
		);
	});
});

describe("QD reproducibility (∀)", () => {
	it("is deterministic — same variants ⇒ same élite map", () => {
		fc.assert(
			fc.property(fc.array(variantArb, { maxLength: 10 }), (vs) => {
				expect([...elites(vs)]).toEqual([...elites(vs)]);
			}),
		);
	});

	it("no green ⇒ no élite — every élite is a green variant", () => {
		fc.assert(
			fc.property(fc.array(variantArb, { maxLength: 10 }), (vs) => {
				for (const [, e] of elites(vs)) expect(e.mirror).toBe("green");
			}),
		);
	});

	it("one élite per niche, the green max-anchored-fitness variant (ties by smaller id)", () => {
		fc.assert(
			fc.property(
				fc.uniqueArray(variantArb, { selector: (v) => v.id, maxLength: 10 }),
				(vs) => {
					const got = elites(vs);
					const best = new Map<string, Variant>();
					for (const v of vs) {
						if (v.mirror !== "green") continue;
						const cur = best.get(v.niche);
						if (
							!cur ||
							v.fitness > cur.fitness ||
							(v.fitness === cur.fitness && v.id < cur.id)
						) {
							best.set(v.niche, v);
						}
					}
					expect(got.size).toBe(best.size);
					for (const [niche, want] of best)
						expect(got.get(niche)?.id).toBe(want.id);
				},
			),
		);
	});
});

describe("the done criteria on the canonical examples", () => {
	it("the ledger: unsafe⇒tombstone (still listed), stable_phase & élite⇒keep, failed>30d⇒compress", () => {
		const byNode = new Map(curate(NODES, NOW).map((d) => [d.nodeId, d]));
		// the unsafe branch is STILL LISTED (a decision exists for it) and is tombstoned.
		expect(byNode.get("var-7")?.verdict).toBe("tombstone");
		expect(byNode.get("phase-3")?.verdict).toBe("keep");
		expect(byNode.get("var-2")?.verdict).toBe("keep");
		expect(byNode.get("var-9")?.verdict).toBe("compress");
		// every node in is a node out — nothing dropped.
		expect(byNode.size).toBe(NODES.length);
	});

	it("the niche grid: green⇒cell filled by the champion, red-only⇒empty cell", () => {
		const grid = nicheGrid(VARIANTS);
		const co = grid.find((c) => c.niche === "createOrder/discount");
		expect(co?.elite?.id).toBe("var-C"); // the higher-fitness green champion
		const cancel = grid.find((c) => c.niche === "cancelOrder/refund");
		expect(cancel?.elite).toBeNull(); // red-mirror-only ⇒ empty cell (no promotion)
		const tax = grid.find((c) => c.niche === "applyTax/eu");
		expect(tax?.elite?.id).toBe("var-D");
	});
});
