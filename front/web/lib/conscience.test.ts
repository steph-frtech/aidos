import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Input,
	KNOWN_SOURCES,
	reconcile,
	type Source,
	type Verdict,
} from "./conscience";
import {
	type Column,
	type Facet,
	NON_FUNCTIONAL_COLUMNS,
	RUNGS,
	wireSkeleton,
} from "./facetwire";

/**
 * FK09 conscience twin tests (fast-check + Vitest). The conscience composes the verdicts of the
 * EXISTING judges into a ConsciousnessReport + §FKE-31 decision cards. AUCUN NOUVEAU JUGE — it
 * reads sourced verdicts and routes them. Five tests pin the FK09 done-criteria:
 *   - aligned input → no card;
 *   - a divergence produces its decision card (the e2e/property done-criterion);
 *   - same input → same report (determinism, the reproducibility mirror);
 *   - the report contains ONLY sourced verdicts (no invented judgment);
 *   - the soft X facet never drifts (§13.6).
 */

function alignedSkeleton() {
	const cols: Column[] = NON_FUNCTIONAL_COLUMNS.map((facet) => ({
		kernel_id: "checkout",
		facet,
		rungs: RUNGS.map((rung) => ({ rung, declared: true, proven: true })),
	}));
	return wireSkeleton({ kernel_id: "checkout", columns: cols });
}

function brokenSkeleton(broken: Facet) {
	const cols: Column[] = NON_FUNCTIONAL_COLUMNS.map((facet) => ({
		kernel_id: "checkout",
		facet,
		rungs: RUNGS.map((rung) => ({
			rung,
			declared: true,
			proven: !(facet === broken && rung === "6-evidence"),
		})),
	}));
	return wireSkeleton({ kernel_id: "checkout", columns: cols });
}

describe("FK09 conscience — Reconcile", () => {
	it("aligned input produces no decision card", () => {
		const rep = reconcile({
			kernel_id: "checkout",
			skeleton: alignedSkeleton(),
			verdicts: [
				{ source: "runner", facet: "F", pair: "s2↔s9", verdict: "green" },
			],
		});
		expect(rep.verdict).toBe("aligned");
		expect(rep.cards).toHaveLength(0);
	});

	it("a divergence produces its actionable decision card (FKE-31)", () => {
		const rep = reconcile({
			kernel_id: "checkout",
			skeleton: alignedSkeleton(),
			verdicts: [
				{
					source: "runner",
					facet: "F",
					pair: "s2↔s9",
					verdict: "red",
					drift: "semantic_drift",
					detail: "le code accepte 31 jours ; le contrat dit 30",
					blast: "medium",
				},
			],
		});
		expect(rep.verdict).toBe("drift");
		expect(rep.cards).toHaveLength(1);
		const c = rep.cards[0];
		expect(c.id).not.toBe("");
		expect(c.source).toBe("runner");
		expect(c.detail).toBe("le code accepte 31 jours ; le contrat dit 30");
		expect(c.options.length).toBeGreaterThan(0);
		expect(c.recommendation).toBeTruthy();
		expect(c.advisory).toBe(false);
	});

	it("breaking a hard facet (S) drifts and yields a security card; X stays aligned", () => {
		const s = reconcile({
			kernel_id: "checkout",
			skeleton: brokenSkeleton("S"),
		});
		expect(s.verdict).toBe("drift");
		expect(
			s.cards.some((c) => c.facet === "S" && c.drift === "security_drift"),
		).toBe(true);

		const x = reconcile({
			kernel_id: "checkout",
			skeleton: brokenSkeleton("X"),
		});
		expect(x.verdict).toBe("aligned");
		expect(x.cards.some((c) => c.facet === "X" && c.advisory)).toBe(true);
	});

	it("same input → same report (determinism)", () => {
		const sourceArb = fc.constantFrom<Source>(...KNOWN_SOURCES);
		const facetArb = fc.constantFrom<Facet>(
			"F",
			"I",
			"S",
			"B",
			"R",
			"V",
			"M",
			"X",
		);
		const verdictArb = fc.constantFrom<Verdict>("green", "red", "advisory");
		const svArb = fc.record({
			source: sourceArb,
			facet: facetArb,
			pair: fc.stringMatching(/^[a-z0-9-]{1,6}$/),
			verdict: verdictArb,
		});
		fc.assert(
			fc.property(fc.array(svArb, { maxLength: 6 }), (verdicts) => {
				const input: Input = { kernel_id: "k", verdicts };
				const a = reconcile(input);
				const b = reconcile(input);
				expect(JSON.stringify(a)).toBe(JSON.stringify(b));
			}),
		);
	});

	it("the report contains only sourced verdicts and X never drifts (§13.6)", () => {
		const facetArb = fc.constantFrom<Facet>(
			"F",
			"I",
			"S",
			"B",
			"R",
			"V",
			"M",
			"X",
		);
		const svArb = fc.record({
			source: fc.constantFrom<Source>(...KNOWN_SOURCES, "bogus" as Source),
			facet: facetArb,
			pair: fc.stringMatching(/^[a-z]{1,4}$/),
			verdict: fc.constantFrom<Verdict>("green", "red", "advisory"),
		});
		fc.assert(
			fc.property(fc.array(svArb, { maxLength: 5 }), (verdicts) => {
				const rep = reconcile({ kernel_id: "k", verdicts });
				// every pair carries a known source (no invented verdict).
				for (const p of rep.pairs) {
					expect(KNOWN_SOURCES).toContain(p.source);
				}
				// no X pair is ever a hard red.
				for (const p of rep.pairs) {
					if (p.facet === "X") expect(p.verdict).not.toBe("red");
				}
			}),
		);
	});
});
