/**
 * ops-observability-data — the DETERMINISTIC demo fixture for the /ops-observability panel
 * (S92; ADR 0092 kill-twins T2 flip). It holds the deterministic demo SIGNALS the panel
 * seeds, the demo `Dashboard` the screen falls back to when the gateway is unreachable
 * (`source:"demo"`), and the `gatewayDashboardArgs` mapper that shapes the buffered signals
 * into the Go `ops_dashboard` input — PLUS the re-export of the twin `buildDashboard` /
 * `ingest`, so the client editor pulls the PURE compute from the demo sibling, never from
 * the twin lib directly.
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before this flip the panel built
 * its displayed dashboard from the TS twin `lib/ops-observability.buildDashboard` directly —
 * the twin WAS the live source. The flip routes the BUILD read through the Go
 * `aidos-ops-observability` MCP server via the passerelle
 * (`readVia(scope, "ops_dashboard", …)`, the dispatched below-the-line read); this fixture is
 * KEPT only as the deterministic fallback. The presence of this `-data.ts` sibling is also
 * what makes the T5 cliquet (twin-as-live-fitness) RECOGNISE `lib/ops-observability` as a
 * twin — the panel stays GREEN because `actions.ts` imports the `readVia` frontier and the
 * client pulls its PURE compute from THIS fixture (the witness the twin sits behind
 * `source:"demo"`).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the demo dashboard is the same PURE twin compute the
 * Go `opsobservability.BuildDashboard` reproduces — same project + signals → byte-identical
 * dashboard. The parity mirror app/ops-observability/live.test.ts pins the decoder shape ==
 * the Go `dashboardOutput` contract.
 *
 * THE WALL (CLAUDE.md §2): the seed signals + the projection are below-the-line VALUES; the
 * dashboard build is read-only (`wroteKernel === false`). The E12 RealityMirror is the only
 * Kernel on-ramp — this panel is the OPPOSITE direction.
 */

import {
	buildDashboard,
	type Dashboard,
	ingest,
	isIngestError,
	type Signal,
} from "./ops-observability";

export type { Dashboard, Signal };
// Re-export the PURE twin compute so the client editor (OpsObservabilityPanel) pulls it from
// THIS demo sibling — never a direct value-import of the twin lib (the T5 cliquet stays green).
export { buildDashboard, ingest, isIngestError };

/** the project the demo signals are scoped to (mirrors the panel's default). */
export const DEMO_PROJECT_ID = "shop";

/**
 * demoSignals — the canonical demo burst: a handful of `POST /orders` spans (one failed),
 * a `GET /health` span, a logged error, and a fatal error event carrying a leaked secret
 * (proves the redaction). The same set the panel's "seed" control buffers.
 */
export function demoSignals(projectId: string = DEMO_PROJECT_ID): Signal[] {
	return [
		{
			projectId,
			kind: "span",
			route: "POST /orders",
			durationMs: 12,
			severity: "info",
			body: "",
			isError: false,
			atUnixNano: 1,
		},
		{
			projectId,
			kind: "span",
			route: "POST /orders",
			durationMs: 34,
			severity: "info",
			body: "",
			isError: false,
			atUnixNano: 2,
		},
		{
			projectId,
			kind: "span",
			route: "GET /health",
			durationMs: 3,
			severity: "info",
			body: "",
			isError: false,
			atUnixNano: 3,
		},
		{
			projectId,
			kind: "span",
			route: "POST /orders",
			durationMs: 210,
			severity: "info",
			body: "",
			isError: true,
			atUnixNano: 4,
		},
		{
			projectId,
			kind: "log",
			route: "POST /orders",
			durationMs: 0,
			severity: "error",
			body: "db timeout after 200ms",
			isError: false,
			atUnixNano: 5,
		},
		{
			projectId,
			kind: "error",
			route: "POST /orders",
			durationMs: 0,
			severity: "fatal",
			body: 'connect with password="leakedsecret123"',
			isError: false,
			atUnixNano: 6,
		},
	];
}

/**
 * demoDashboard — the deterministic demo `Dashboard`: the twin `buildDashboard` of the demo
 * signals (the SAME pure compute the Go `BuildDashboard` reproduces). The panel falls back to
 * this when the gateway is unreachable / the payload is malformed (`source:"demo"`).
 */
export function demoDashboard(
	projectId: string = DEMO_PROJECT_ID,
	signals?: Signal[],
): Dashboard {
	const sigs = signals ?? demoSignals(projectId);
	return buildDashboard(projectId, sigs).dashboard;
}

/**
 * gatewayDashboardArgs — maps the buffered signals into the Go `ops_dashboard` input shape
 * ({ project_id, signals:[{project_id, kind, route, duration_ms, severity, body, is_error,
 * at_unix_nano}] }, the dashboardInput → ingestInput snake_case). The mapping is PURE — same
 * signals → same args.
 */
export function gatewayDashboardArgs(
	projectId: string,
	signals: Signal[],
): Record<string, unknown> {
	return {
		project_id: projectId,
		signals: signals.map((s) => ({
			project_id: s.projectId,
			kind: s.kind,
			route: s.route,
			duration_ms: s.durationMs,
			severity: s.severity,
			body: s.body,
			is_error: s.isError,
			at_unix_nano: s.atUnixNano,
		})),
	};
}
