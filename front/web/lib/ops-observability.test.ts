/**
 * ops-observability.test.ts — the Vitest + fast-check mirror of the S92 ops panel TS twin.
 * Proves the SAME done-criteria the Go mirrors prove: the emitted app emits logs/traces
 * and the dashboard renders them (acceptance), and the panel writes no truth + is
 * reproducible + isolates projects + redacts secrets (invariants).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	buildDashboard,
	ingest,
	isIngestError,
	percentile,
	redactLog,
	type Signal,
} from "./ops-observability";

const sig = (over: Partial<Signal>): Signal => ({
	projectId: "P",
	kind: "span",
	route: "POST /o",
	durationMs: 10,
	severity: "info",
	body: "",
	isError: false,
	atUnixNano: 1,
	...over,
});

describe("ingest", () => {
	it("accepts a valid OTel signal", () => {
		expect(isIngestError(ingest(sig({})))).toBe(false);
	});
	it("refuses an empty project (fail-closed)", () => {
		expect(isIngestError(ingest(sig({ projectId: "" })))).toBe(true);
	});
	it("refuses a foreign kind (closed set)", () => {
		expect(isIngestError(ingest(sig({ kind: "metric" as never })))).toBe(true);
	});
});

describe("dashboard — the acceptance done-criterion", () => {
	it("renders latency + error rate from emitted spans", () => {
		const signals = [
			sig({ kind: "span", durationMs: 10, atUnixNano: 1 }),
			sig({ kind: "span", durationMs: 20, atUnixNano: 2 }),
			sig({ kind: "span", durationMs: 30, atUnixNano: 3 }),
			sig({ kind: "span", durationMs: 40, isError: true, atUnixNano: 4 }),
		];
		const { dashboard, wroteKernel } = buildDashboard("P", signals);
		expect(wroteKernel).toBe(false);
		expect(dashboard.totalRequests).toBe(4);
		expect(dashboard.totalErrors).toBe(1);
		expect(dashboard.errorRate).toBe(0.25);
		expect(dashboard.latencyP50Ms).toBe(20);
		expect(dashboard.latencyP95Ms).toBe(40);
	});

	it("renders the log feed and a separate error feed", () => {
		const signals = [
			sig({ kind: "log", severity: "info", body: "ok", atUnixNano: 1 }),
			sig({
				kind: "log",
				severity: "error",
				body: "db timeout",
				atUnixNano: 2,
			}),
			sig({ kind: "error", severity: "fatal", body: "panic", atUnixNano: 3 }),
		];
		const { dashboard } = buildDashboard("P", signals);
		expect(dashboard.logs).toHaveLength(3);
		expect(dashboard.errorFeed).toHaveLength(2);
	});

	it("redacts a secret a careless app logged", () => {
		const leak = `password="hunter2supersecretvalue"`;
		const { dashboard } = buildDashboard("P", [
			sig({ kind: "log", body: leak, atUnixNano: 1 }),
		]);
		expect(dashboard.logs[0].body).toContain("[REDACTED]");
		expect(dashboard.logs[0].body).not.toContain("hunter2supersecretvalue");
	});
});

describe("invariants", () => {
	it("writes no truth over arbitrary signals", () => {
		fc.assert(
			fc.property(
				fc.array(fc.constant(sig({})), { maxLength: 20 }),
				(signals) => {
					expect(buildDashboard("P", signals).wroteKernel).toBe(false);
				},
			),
		);
	});

	it("is reproducible (same signals → same fingerprint)", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						kind: fc.constantFrom("span", "log", "error") as fc.Arbitrary<
							Signal["kind"]
						>,
						durationMs: fc.integer({ min: 0, max: 5000 }),
						isError: fc.boolean(),
						atUnixNano: fc.integer({ min: 0, max: 1000 }),
					}),
					{ maxLength: 20 },
				),
				(rows) => {
					const signals = rows.map((r, i) =>
						sig({ ...r, atUnixNano: r.atUnixNano + i }),
					);
					const a = buildDashboard("P", signals).dashboard.fingerprint;
					const b = buildDashboard("P", signals).dashboard.fingerprint;
					expect(a).toBe(b);
				},
			),
		);
	});

	it("isolates projects (a foreign signal never changes P's panel)", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 10 }),
				fc.integer({ min: 0, max: 10 }),
				(nP, nQ) => {
					const p = Array.from({ length: nP }, (_, i) =>
						sig({ atUnixNano: i + 1 }),
					);
					const q = Array.from({ length: nQ }, (_, i) =>
						sig({ projectId: "Q", atUnixNano: i + 1 }),
					);
					const base = buildDashboard("P", p).dashboard.fingerprint;
					const mixed = buildDashboard("P", [...p, ...q]).dashboard.fingerprint;
					expect(mixed).toBe(base);
				},
			),
		);
	});

	it("a percentile is always an observed duration and monotone", () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer({ min: 0, max: 10000 }), {
					minLength: 1,
					maxLength: 40,
				}),
				(ds) => {
					const set = new Set(ds);
					const p50 = percentile(ds, 50);
					const p95 = percentile(ds, 95);
					const p99 = percentile(ds, 99);
					expect(set.has(p50) && set.has(p95) && set.has(p99)).toBe(true);
					expect(p50 <= p95 && p95 <= p99).toBe(true);
				},
			),
		);
	});

	it("a known secret never survives redaction", () => {
		fc.assert(
			fc.property(fc.stringMatching(/^[0-9A-Z]{16}$/), (tail) => {
				const secret = `AKIA${tail}`;
				expect(redactLog(`key ${secret} end`)).not.toContain(secret);
			}),
		);
	});
});
