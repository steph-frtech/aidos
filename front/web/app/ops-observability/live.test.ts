import { describe, expect, it } from "vitest";
import {
	demoDashboard,
	gatewayDashboardArgs,
} from "../../lib/ops-observability-data";
import { dashboardDecoder } from "./live";

/**
 * /ops-observability live dashboard read — the PARITY MIRROR (Vitest, the frozen front N1
 * slot; ADR 0092 kill-twins T2 flip).
 *
 * It proves the TS `dashboardDecoder` decodes a SAMPLE of the Go `aidos-ops-observability`
 * `ops_dashboard` tool output (opsobservabilitysrv.dashboardOutput: `{ ok, error?, dashboard:
 * Dashboard, wrote_kernel }`, the Dashboard carrying snake_case fields project_id /
 * total_requests / total_errors / error_rate / latency_p50_ms/p95/p99 / routes:[RouteStat] /
 * logs:[LogLine] / error_feed:[LogLine] / fingerprint) — the tool's CONTRACT, NOT a second
 * implementation of the ops logic (the Go opsobservability.BuildDashboard is authoritative).
 * This test pins only that the wire shape decodes faithfully (the snake_case → camelCase
 * bridge, an absent routes/logs/error_feed, the wall flag) and that a malformed / errored /
 * truth-writing payload deterministically falls back (decoder → null → demo dashboard).
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("ops-observability live — dashboard decoder parity", () => {
	it("decodes a Go-sample dashboardOutput (snake_case → the front Dashboard)", () => {
		const goSample = {
			ok: true,
			wrote_kernel: false,
			dashboard: {
				project_id: "shop",
				total_requests: 3,
				total_errors: 1,
				error_rate: 0.3333,
				latency_p50_ms: 34,
				latency_p95_ms: 210,
				latency_p99_ms: 210,
				routes: [
					{
						route: "POST /orders",
						request_count: 3,
						error_count: 1,
						error_rate: 0.3333,
						latency_p50_ms: 34,
						latency_p95_ms: 210,
						latency_p99_ms: 210,
					},
				],
				logs: [
					{
						kind: "log",
						severity: "error",
						route: "POST /orders",
						body: "db timeout after 200ms",
						at_unix_nano: 5,
					},
				],
				error_feed: [
					{
						kind: "error",
						severity: "fatal",
						route: "POST /orders",
						body: 'connect with password="[REDACTED]"',
						at_unix_nano: 6,
					},
				],
				fingerprint: "deadbeef",
			},
		};
		const decoded = dashboardDecoder(goSample);
		expect(decoded).toEqual({
			projectId: "shop",
			totalRequests: 3,
			totalErrors: 1,
			errorRate: 0.3333,
			latencyP50Ms: 34,
			latencyP95Ms: 210,
			latencyP99Ms: 210,
			routes: [
				{
					route: "POST /orders",
					requestCount: 3,
					errorCount: 1,
					errorRate: 0.3333,
					latencyP50Ms: 34,
					latencyP95Ms: 210,
					latencyP99Ms: 210,
				},
			],
			logs: [
				{
					kind: "log",
					severity: "error",
					route: "POST /orders",
					body: "db timeout after 200ms",
					atUnixNano: 5,
				},
			],
			errorFeed: [
				{
					kind: "error",
					severity: "fatal",
					route: "POST /orders",
					body: 'connect with password="[REDACTED]"',
					atUnixNano: 6,
				},
			],
			fingerprint: "deadbeef",
		});
	});

	it("tolerates an empty panel (absent routes/logs/error_feed → [])", () => {
		const decoded = dashboardDecoder({
			ok: true,
			wrote_kernel: false,
			dashboard: {
				project_id: "shop",
				total_requests: 0,
				total_errors: 0,
				error_rate: 0,
				latency_p50_ms: 0,
				latency_p95_ms: 0,
				latency_p99_ms: 0,
				fingerprint: "00000000",
			},
		});
		expect(decoded).not.toBeNull();
		expect(decoded?.routes).toEqual([]);
		expect(decoded?.logs).toEqual([]);
		expect(decoded?.errorFeed).toEqual([]);
	});

	it("rejects an errored payload (ok:false → null → demo fallback)", () => {
		expect(
			dashboardDecoder({ ok: false, error: "project_id is required" }),
		).toBeNull();
	});

	it("THE WALL: rejects a payload claiming wrote_kernel:true (→ null → demo)", () => {
		expect(
			dashboardDecoder({
				ok: true,
				wrote_kernel: true,
				dashboard: {
					project_id: "shop",
					total_requests: 0,
					total_errors: 0,
					error_rate: 0,
					latency_p50_ms: 0,
					latency_p95_ms: 0,
					latency_p99_ms: 0,
					fingerprint: "00000000",
				},
			}),
		).toBeNull();
	});

	it("rejects a malformed dashboard (missing total_requests → null)", () => {
		expect(
			dashboardDecoder({
				ok: true,
				wrote_kernel: false,
				dashboard: { project_id: "shop" },
			}),
		).toBeNull();
	});

	it("rejects a non-object payload (→ null → demo)", () => {
		expect(dashboardDecoder(null)).toBeNull();
		expect(dashboardDecoder("nope")).toBeNull();
		expect(dashboardDecoder(42)).toBeNull();
	});

	it("gatewayDashboardArgs maps signals to the Go dashboardInput (snake_case)", () => {
		const args = gatewayDashboardArgs("shop", [
			{
				projectId: "shop",
				kind: "span",
				route: "POST /orders",
				durationMs: 12,
				severity: "info",
				body: "",
				isError: true,
				atUnixNano: 1,
			},
		]);
		expect(args).toEqual({
			project_id: "shop",
			signals: [
				{
					project_id: "shop",
					kind: "span",
					route: "POST /orders",
					duration_ms: 12,
					severity: "info",
					body: "",
					is_error: true,
					at_unix_nano: 1,
				},
			],
		});
	});

	it("the demo dashboard is the deterministic twin compute (same in → same out)", () => {
		const a = demoDashboard("shop");
		const b = demoDashboard("shop");
		expect(a).toEqual(b);
		// the demo burst has 4 spans (one failed) + 2 log/error lines, redacted.
		expect(a.totalRequests).toBe(4);
		expect(a.totalErrors).toBe(1);
		// the leaked password in the fatal error is redacted before render.
		const leak = a.errorFeed.find((l) => l.severity === "fatal");
		expect(leak?.body).not.toContain("leakedsecret123");
		expect(leak?.body).toContain("[REDACTED]");
	});
});
