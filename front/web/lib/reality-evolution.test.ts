/**
 * The S109 reality-evolution COCKPIT reproducibility mirror (CLAUDE.md §6 determinism-first).
 *
 * S109 invents no new mechanic — it COMPOSES S106 (ingest) + S107 (closeLoop) + S108 (niches/
 * promote) into one per-project cockpit. These property tests pin the composition's two laws:
 *
 *   1. DETERMINISM — same input ⇒ byte-identical journey outcome (no clock/rng/LLM enters).
 *   2. THE WALL — every rung of the cockpit writes NOTHING above the line (wroteKernel/writesTruth
 *      always false; the refusal code is always REALITY_CANNOT_DECLARE_TRUTH), and a mirror-breaker
 *      is NEVER an élite whatever its fitness (the anti-Goodhart anchor, §8).
 *
 * The Go engines are authoritative on the wire; this twin proves the cockpit's pure orchestration
 * is reproducible and wall-respecting.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	COCKPIT_FIXED_MIRROR,
	COCKPIT_VARIANTS,
	closeReality,
	cockpitElites,
	DEMO_DIVERGENT_REPORT,
	DEMO_HEALTHY_REPORT,
	promoteElite,
	WALL_CODE,
} from "./reality-evolution";

describe("S109 cockpit — closeReality (ingest → approve → red wave)", () => {
	it("the canonical out-of-stock journey ends with a red wave that APPEARED", () => {
		const out = closeReality(DEMO_DIVERGENT_REPORT, false);
		expect(out.phase).toBe("learned");
		if (out.phase !== "learned") return;
		// the incident was ingested (provenance=incident), the loop closed, the wave appeared.
		expect(out.draft.idea.provenanceSource).toBe("incident");
		expect(out.learn.bump.moved).toBe(true);
		expect(out.redWaveAppeared).toBe(true);
		expect(out.redWaveCount).toBeGreaterThan(0);
	});

	it("a HEALTHY app yields NO divergence — nothing ingested, nothing learned", () => {
		const out = closeReality(DEMO_HEALTHY_REPORT, true);
		expect(out.phase).toBe("no_divergence");
		expect(out.wroteKernel).toBe(false);
		expect(out.wallCode).toBe(WALL_CODE);
	});

	it("is deterministic — same report ⇒ byte-identical journey", () => {
		fc.assert(
			fc.property(fc.boolean(), (healthy) => {
				const report = healthy ? DEMO_HEALTHY_REPORT : DEMO_DIVERGENT_REPORT;
				const a = closeReality(report, healthy);
				const b = closeReality(report, healthy);
				expect(JSON.stringify(a)).toBe(JSON.stringify(b));
			}),
		);
	});

	it("THE WALL — the cockpit never writes truth, whatever the report", () => {
		fc.assert(
			fc.property(
				fc.record({
					operation: fc.constant("createOrder"),
					calls: fc.integer({ min: 0, max: 100000 }),
					errors: fc.integer({ min: 0, max: 100000 }),
					p99Ms: fc.integer({ min: 0, max: 100000 }),
				}),
				(report) => {
					const out = closeReality(report, false);
					expect(out.wroteKernel).toBe(false);
					expect(out.wallCode).toBe(WALL_CODE);
				},
			),
		);
	});
});

describe("S109 cockpit — QD elites archive (S108 anti-Goodhart anchor)", () => {
	it("the mirror-BREAKER is NEVER an élite, despite its higher fitness", () => {
		const rows = cockpitElites(COCKPIT_FIXED_MIRROR, COCKPIT_VARIANTS);
		// var-fast-breaker has fitness 0.99 (highest) but a red mirror — it must be absent.
		expect(rows.some((r) => r.variantId === "var-fast-breaker")).toBe(false);
		// every élite shown is green.
		for (const r of rows) expect(r.mirror).toBe("green");
		// the green 'fast' niche élite is var-fast-green, not the higher-fitness breaker.
		const fast = rows.find((r) => r.niche === "fast");
		expect(fast?.variantId).toBe("var-fast-green");
	});

	it("elites projection is deterministic (stable order, idempotent)", () => {
		const a = cockpitElites(COCKPIT_FIXED_MIRROR, COCKPIT_VARIANTS);
		const b = cockpitElites(COCKPIT_FIXED_MIRROR, COCKPIT_VARIANTS);
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});
});

describe("S109 cockpit — promoteElite (authority-gated, writes no truth)", () => {
	it("a green élite WITH authority → a PROPOSAL that writes no truth", () => {
		const r = promoteElite("var-fast-green", true);
		expect(r.verdict).toBe("proposed");
		expect(r.proposal).toBe(true);
		expect(r.writesTruth).toBe(false);
	});

	it("the same élite WITHOUT authority → refused, no truth", () => {
		const r = promoteElite("var-fast-green", false);
		expect(r.verdict).toBe("refused");
		expect(r.writesTruth).toBe(false);
	});

	it("a red-mirror variant is refused WHATEVER the authority (anti-Goodhart)", () => {
		fc.assert(
			fc.property(fc.boolean(), (auth) => {
				const r = promoteElite("var-fast-breaker", auth);
				expect(r.verdict).toBe("refused");
				expect(r.writesTruth).toBe(false);
			}),
		);
	});

	it("an out-of-sample-red variant is refused even with authority (§87)", () => {
		const r = promoteElite("var-simple-oos-red", true);
		expect(r.verdict).toBe("refused");
		expect(r.writesTruth).toBe(false);
	});
});
