import { arr, type Decoder, isObject, num, str } from "../../lib/gateway-sdk";
import type {
	Dashboard,
	LogLine,
	RouteStat,
} from "../../lib/ops-observability";

/**
 * /ops-observability live read — the PURE decoder over the Go `aidos-ops-observability`
 * `ops_dashboard` tool output (ADR 0092 kill-twins T2 flip). Kept OUT of actions.ts (a Next
 * "use server" module may only export async functions) so the parity mirror (live.test.ts)
 * can import the PURE decoder directly.
 *
 * NEVER DOUBLE-TYPED (the cutover done-criterion): `dashboardDecoder` is the SINGLE runtime
 * declaration of the live dashboard shape; the static `Dashboard` (in lib/ops-observability)
 * is the view type the decoder fills. The decoder bridges the Go WIRE (snake_case:
 * total_requests / error_rate / latency_p50_ms / request_count / at_unix_nano) into the front
 * `Dashboard` (camelCase: totalRequests / latencyP50Ms / requestCount / atUnixNano) — the Go
 * `opsobservability.BuildDashboard` is authoritative, this only re-shapes its wire output.
 *
 * The parity mirror (live.test.ts) pins the decoder == the Go `dashboardOutput` contract
 * ({ ok, error?, dashboard:{project_id, total_requests, total_errors, error_rate,
 * latency_p50_ms/p95/p99, routes:[…], logs:[…], error_feed:[…], fingerprint}, wrote_kernel })
 * — NOT a second implementation of the ops logic. DETERMINISM-FIRST (§6/§8): same JSON → same
 * verdict; a malformed payload returns null and readVia falls back to the demo dashboard.
 *
 * THE WALL (CLAUDE.md §2): a READ only. ops_dashboard AGGREGATEs a project's OTel signals
 * into its ops panel; the ops layer is RENDER, never a Kernel on-ramp (the E12 RealityMirror
 * is the single on-ramp). The Go tool returns `wrote_kernel:false` — this decoder asserts it.
 */

/** decodeLogLine decodes one Go `LogLine` ({kind, severity, route, body, at_unix_nano}). */
function decodeLogLine(raw: unknown): LogLine | null {
	if (!isObject(raw)) return null;
	const kind = str(raw.kind);
	const severity = str(raw.severity);
	const route = str(raw.route);
	const body = str(raw.body);
	const atUnixNano = num(raw.at_unix_nano);
	if (
		kind === null ||
		severity === null ||
		route === null ||
		body === null ||
		atUnixNano === null
	) {
		return null;
	}
	return {
		kind: kind as LogLine["kind"],
		severity: severity as LogLine["severity"],
		route,
		body,
		atUnixNano,
	};
}

/** decodeRouteStat decodes one Go `RouteStat` (snake_case → the front RouteStat). */
function decodeRouteStat(raw: unknown): RouteStat | null {
	if (!isObject(raw)) return null;
	const route = str(raw.route);
	const requestCount = num(raw.request_count);
	const errorCount = num(raw.error_count);
	const errorRate = num(raw.error_rate);
	const latencyP50Ms = num(raw.latency_p50_ms);
	const latencyP95Ms = num(raw.latency_p95_ms);
	const latencyP99Ms = num(raw.latency_p99_ms);
	if (
		route === null ||
		requestCount === null ||
		errorCount === null ||
		errorRate === null ||
		latencyP50Ms === null ||
		latencyP95Ms === null ||
		latencyP99Ms === null
	) {
		return null;
	}
	return {
		route,
		requestCount,
		errorCount,
		errorRate,
		latencyP50Ms,
		latencyP95Ms,
		latencyP99Ms,
	};
}

/** decodeDashboard decodes the Go `Dashboard` (snake_case wire → the front Dashboard). */
function decodeDashboard(raw: unknown): Dashboard | null {
	if (!isObject(raw)) return null;
	const projectId = str(raw.project_id);
	const totalRequests = num(raw.total_requests);
	const totalErrors = num(raw.total_errors);
	const errorRate = num(raw.error_rate);
	const latencyP50Ms = num(raw.latency_p50_ms);
	const latencyP95Ms = num(raw.latency_p95_ms);
	const latencyP99Ms = num(raw.latency_p99_ms);
	const fingerprint = str(raw.fingerprint);
	if (
		projectId === null ||
		totalRequests === null ||
		totalErrors === null ||
		errorRate === null ||
		latencyP50Ms === null ||
		latencyP95Ms === null ||
		latencyP99Ms === null ||
		fingerprint === null
	) {
		return null;
	}
	// routes / logs / error_feed are `omitempty` (absent on an empty panel) → decode to [].
	const routes = arr(decodeRouteStat)(raw.routes ?? []);
	const logs = arr(decodeLogLine)(raw.logs ?? []);
	const errorFeed = arr(decodeLogLine)(raw.error_feed ?? []);
	if (routes === null || logs === null || errorFeed === null) return null;
	return {
		projectId,
		totalRequests,
		totalErrors,
		errorRate,
		latencyP50Ms,
		latencyP95Ms,
		latencyP99Ms,
		routes,
		logs,
		errorFeed,
		fingerprint,
	};
}

/**
 * dashboardDecoder decodes the Go `ops_dashboard` output ({ ok, error?, dashboard,
 * wrote_kernel }) into the front `Dashboard`. A server-side error (ok:false) → null (→ demo
 * fallback). THE WALL ASSERTION: a payload claiming `wrote_kernel:true` is REJECTED (null) —
 * ops-observability is a render layer that must write no truth (E12 is the only on-ramp).
 */
export const dashboardDecoder: Decoder<Dashboard> = (raw) => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	if (raw.wrote_kernel !== false) return null; // the wall: ops writes no truth.
	return decodeDashboard(raw.dashboard);
};
