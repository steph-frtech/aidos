import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	aggregate,
	type CheckResult,
	SAMPLE_BLOCK_EVENT,
	SAMPLE_LATEST_RUN,
	SENSOR_FAILED,
	SENSOR_SUITE,
	sensorSuite,
} from "./sensors";

// Reproducibility mirror (Vitest + fast-check, front N4) — the /sensors projection
// source is a static, deterministic registry mirroring back/hooks/posttooluse: the
// computational sensor suite [gofmt, vet, lint, archtest, affected] in KRD §74
// order, the canonical block code SENSOR_FAILED, and the pure aggregate verdict
// (block iff any check failed). It pins the front projection against the Go
// invariant (sensors.go Aggregate / aggregate_property_test.go).

describe("sensors projection source", () => {
	it("the suite is exactly gofmt/vet/lint/archtest/affected, in KRD §74 order", () => {
		expect(SENSOR_SUITE.map((s) => s.name)).toEqual([
			"gofmt",
			"vet",
			"lint",
			"archtest",
			"affected",
		]);
	});

	it("every sensor carries a slot, a tool and a non-empty role", () => {
		for (const s of SENSOR_SUITE) {
			expect(s.slot).not.toBe("");
			expect(s.tool).not.toBe("");
			expect(s.role).not.toBe("");
		}
	});

	it("the sample block event carries the canonical code and an actionable fix", () => {
		expect(SAMPLE_BLOCK_EVENT.verdict).toBe("block");
		expect(SAMPLE_BLOCK_EVENT.blockReason?.code).toBe(SENSOR_FAILED);
		expect(SAMPLE_BLOCK_EVENT.blockReason?.severity).toBe("error");
		expect(
			SAMPLE_BLOCK_EVENT.blockReason?.howToFix.length ?? 0,
		).toBeGreaterThan(0);
		// the block event names a failing check
		expect(SAMPLE_BLOCK_EVENT.results.some((r) => !r.pass)).toBe(true);
	});

	it("the sample latest run is all-green → allow", () => {
		expect(SAMPLE_LATEST_RUN.verdict).toBe("allow");
		expect(SAMPLE_LATEST_RUN.results.every((r) => r.pass)).toBe(true);
		expect(SAMPLE_LATEST_RUN.blockReason).toBeUndefined();
	});

	it("sensorSuite() returns defensive copies, not the registry", () => {
		const a = sensorSuite();
		a[0].role = "MUTATED";
		expect(sensorSuite()[0].role).not.toBe("MUTATED");
	});

	// The invariant (∀) — mirrors aggregate_property_test.go: block IFF at least one
	// check failed, else allow; there is no third verdict; the failing[] is exactly
	// the failing subset (no silent drop — an errored check has pass=false).
	it("aggregate ⇒ block iff any check failed, else allow (property)", () => {
		const resultArb = fc.array(
			fc.record({
				name: fc.constantFrom("gofmt", "vet", "lint", "archtest", "affected"),
				pass: fc.boolean(),
				durationMs: fc.nat(),
			}),
		);
		fc.assert(
			fc.property(resultArb, (results: CheckResult[]) => {
				const { verdict, failing } = aggregate(results);
				const anyFailed = results.some((r) => !r.pass);
				expect(verdict).toBe(anyFailed ? "block" : "allow");
				// failing[] is exactly the failing subset, no drop
				expect(failing).toEqual(
					results.filter((r) => !r.pass).map((r) => r.name),
				);
				// only two verdicts
				expect(["allow", "block"]).toContain(verdict);
			}),
		);
	});

	it("aggregate is deterministic — same input → same output", () => {
		const results: CheckResult[] = [
			{ name: "gofmt", pass: true, durationMs: 1 },
			{ name: "affected", pass: false, durationMs: 2 },
		];
		expect(aggregate(results)).toEqual(aggregate(results));
	});
});
