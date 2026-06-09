import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	DEMO_DIVERGENT_REPORT,
	DEMO_EXPECTATION,
	DEMO_HEALTHY_REPORT,
	DEMO_PROJECT_ID,
	detectDivergence,
	ingest,
	type MirrorExpectation,
	renderIdeaText,
	type TelemetryReport,
} from "./reality-ingest";

/**
 * S106 REPRODUCIBILITY MIRROR (fast-check) — the two deterministic-able capabilities S106 adds
 * are PURE functions (CLAUDE.md §6/§8): DETECTION (detectDivergence is a numeric comparison) and
 * RÉDACTION (renderIdeaText is a template projection — same divergence ⇒ byte-identical text,
 * ROADMAP §S106). Plus the wall invariant: ingest NEVER writes the kernel and the direct
 * Reality→Kernel edge is ALWAYS refused. It also pins the §S106 done-criterion on the demo.
 */

function genReport(): fc.Arbitrary<{
	report: TelemetryReport;
	exp: MirrorExpectation;
}> {
	return fc
		.record({
			calls: fc.integer({ min: 0, max: 5000 }),
			errFrac: fc.integer({ min: 0, max: 100 }),
			p99: fc.integer({ min: 0, max: 5000 }),
			maxRate: fc.integer({ min: 0, max: 100 }),
			maxP99: fc.integer({ min: 0, max: 5000 }),
		})
		.map(({ calls, errFrac, p99, maxRate, maxP99 }) => ({
			report: {
				operation: "op",
				calls,
				errors: Math.floor((calls * errFrac) / 100),
				p99Ms: p99,
			},
			exp: {
				mirrorRef: "op-succeeds",
				operation: "op",
				maxErrorRate: maxRate / 100,
				maxP99Ms: maxP99,
			},
		}));
}

describe("S106 reality-ingest reproducibility mirror", () => {
	it("property 1 — detection is deterministic (nil-ness, id, kind)", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("shop-42", "shop-99", "blog-1"),
				genReport(),
				(project, { report, exp }) => {
					const a = detectDivergence(project, report, exp);
					const b = detectDivergence(project, report, exp);
					expect(a === null).toBe(b === null);
					if (a && b) {
						expect(a.id).toBe(b.id);
						expect(a.kind).toBe(b.kind);
						expect(a.projectId).toBe(project);
					}
				},
			),
		);
	});

	it("property 2 — rédaction is a deterministic template (same record → same text)", () => {
		fc.assert(
			fc.property(genReport(), ({ report, exp }) => {
				const div = detectDivergence("shop-42", report, exp);
				if (div === null) return;
				expect(renderIdeaText(div)).toBe(renderIdeaText(div));
				expect(ingest("shop-42", report, exp)?.idea.intent).toBe(
					renderIdeaText(div),
				);
			}),
		);
	});

	it("property 3 — the wall always holds (no kernel write, direct edge refused)", () => {
		fc.assert(
			fc.property(genReport(), ({ report, exp }) => {
				const draft = ingest("shop-42", report, exp);
				if (draft === null) return;
				expect(draft.wroteKernel).toBe(false);
				expect(draft.toKernelRefusalCode).toBe("REALITY_CANNOT_DECLARE_TRUTH");
				expect(draft.idea.provenanceSource).toBe("incident");
			}),
		);
	});

	it("property 4 — the §S106 done-criterion: a 30% divergence → incident idea, healthy → none", () => {
		const draft = ingest(
			DEMO_PROJECT_ID,
			DEMO_DIVERGENT_REPORT,
			DEMO_EXPECTATION,
		);
		expect(draft).not.toBeNull();
		expect(draft?.idea.provenanceSource).toBe("incident");
		expect(draft?.idea.intent).toContain("30.0%");
		expect(draft?.idea.intent).toContain("createOrder-succeeds");
		expect(
			ingest(DEMO_PROJECT_ID, DEMO_HEALTHY_REPORT, DEMO_EXPECTATION),
		).toBeNull();
	});
});
