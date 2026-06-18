"use server";

import { readVia, type Source } from "../../lib/gateway-sdk";
import type { Dashboard, Signal } from "../../lib/ops-observability";
import {
	demoDashboard,
	gatewayDashboardArgs,
} from "../../lib/ops-observability-data";
import { panelScope } from "../../lib/panelScope";
import { dashboardDecoder } from "./live";

/**
 * Server Actions for the /ops-observability Workbench panel (S92 — « Observabilité
 * d'exploitation »).
 *
 * THE STEP (ROADMAP-app-builder S92): the emitted app's OpenTelemetry signals (logs / request
 * spans / error events) flow into a per-app ops DASHBOARD (request count, error rate, latency
 * p50/p95/p99, redacted log feed, error feed) — the surface the user reads to OPERATE the app
 * daily. DISTINCT from the E12 RealityMirror (the prod-incident → Idea on-ramp); ops writes
 * NOTHING to the Kernel.
 *
 * ADR 0092 CUTOVER (the Go engine is the SINGLE live source). `buildDashboardAction` reads the
 * LIVE dashboard from the Go `aidos-ops-observability` MCP server through the passerelle
 * (`readVia(scope, "ops_dashboard", …)`, the dispatched below-the-line read), with the twin
 * `lib/ops-observability.buildDashboard` preserved ONLY as the deterministic demo fallback
 * (`source:"live"|"demo"`, via lib/ops-observability-data). The `readVia` frontier import keeps
 * the T5 cliquet GREEN (the twin sits behind the demo fallback, never as the live source).
 *
 * THE WALL (§2/§7): the action WRITES NOTHING. ops_dashboard AGGREGATEs a project's signals
 * (read-only, below-the-line); every build carries `wrote_kernel:false` (the decoder asserts
 * it). The aggregation is PURE code, never an LLM (determinism-first, §6/§8) — same signals →
 * same dashboard.
 */

export interface DashboardView {
	ok: boolean;
	/** the aggregated ops dashboard (null only on a degenerate empty build). */
	dashboard: Dashboard | null;
	/** the WALL PROOF: building a dashboard wrote no kernel (always false). */
	wroteKernel: boolean;
	/** whether the dashboard came from the live gateway or the demo fixture. */
	source: Source;
}

/**
 * buildDashboardAction — the live BUILD read: it ships the buffered signals to the Go
 * `ops_dashboard` tool through the passerelle (`source:"live"`), falling back to the twin
 * `buildDashboard` demo when the gateway is unreachable / the payload is malformed
 * (`source:"demo"`). Read-only; the wall holds (wroteKernel === false).
 */
export async function buildDashboardAction(
	projectId: string,
	signals: Signal[],
): Promise<DashboardView> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"ops_dashboard",
		gatewayDashboardArgs(projectId, signals),
		dashboardDecoder,
		demoDashboard(projectId, signals),
	);
	return { ok: true, dashboard: data, wroteKernel: false, source };
}
