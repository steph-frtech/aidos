/**
 * ops-observability — the TS twin of back/runtime/opsobservability (S92, app-builder
 * EPIC 9 / E12, DP17/ADR 0043). DETERMINISM-FIRST (CLAUDE.md §6/§8): the load-bearing
 * JUDGMENTS of the per-app ops panel are PURE functions — OTel signal validation, the
 * latency nearest-rank percentiles, the error-rate tally, the log redaction. Same
 * signals → same dashboard. The AUTHORITATIVE engine is the Go package; this twin lets
 * the Workbench /ops-observability panel ingest/aggregate/fingerprint WITHOUT a backend
 * round-trip and render the EXACT same verdicts.
 *
 * THE WALL (CLAUDE.md §2): ops-observability is a RENDER layer the user reads to operate
 * the app daily — it writes NOTHING to the kernel/mirrors/fitness. The E12 RealityMirror
 * (the prod-incident → Idea on-ramp) is the only Kernel on-ramp; this panel is the
 * OPPOSITE direction. Every result carries wroteKernel === false.
 */

/** the OTel signal kinds the emitted app emits (closed set; a foreign kind is refused). */
export type SignalKind = "log" | "span" | "error";

/** the log/error severities the panel renders (closed set). */
export type Severity = "debug" | "info" | "warn" | "error" | "fatal";

/** the severities that count toward the error feed/rate when carried on a log signal. */
const ERROR_SEVERITIES = new Set<Severity>(["error", "fatal"]);

/** one OTel-shaped observability signal the emitted app emitted (operational, not truth). */
export interface Signal {
	projectId: string;
	kind: SignalKind;
	route: string;
	durationMs: number;
	severity: Severity;
	body: string;
	isError: boolean;
	atUnixNano: number;
}

/** the typed ingestion error (mirrors the Go ErrEmptyProject / ErrUnknownKind). */
export interface IngestError {
	error: string;
}

/** one rendered log/error feed entry (body is REDACTED — a panel never prints a secret). */
export interface LogLine {
	kind: SignalKind;
	severity: Severity;
	route: string;
	body: string;
	atUnixNano: number;
}

/** the per-route slice of the dashboard. */
export interface RouteStat {
	route: string;
	requestCount: number;
	errorCount: number;
	errorRate: number;
	latencyP50Ms: number;
	latencyP95Ms: number;
	latencyP99Ms: number;
}

/** the per-app ops panel the user reads to operate the app daily. */
export interface Dashboard {
	projectId: string;
	totalRequests: number;
	totalErrors: number;
	errorRate: number;
	latencyP50Ms: number;
	latencyP95Ms: number;
	latencyP99Ms: number;
	routes: RouteStat[];
	logs: LogLine[];
	errorFeed: LogLine[];
	fingerprint: string;
}

/** the dashboard build + the WALL PROOF (wroteKernel always false). */
export interface Report {
	dashboard: Dashboard;
	wroteKernel: false;
}

/**
 * ingest VALIDATES one OTel-shaped signal (pure, fail-closed): an empty project_id or a
 * foreign kind is refused; an empty log/error severity normalises to "info". Mirrors the
 * Go Ingest. Returns the normalised Signal or an IngestError.
 */
export function ingest(s: Signal): Signal | IngestError {
	if (s.projectId.trim() === "") {
		return { error: "opsobservability: signal pins no project_id" };
	}
	if (s.kind !== "log" && s.kind !== "span" && s.kind !== "error") {
		return {
			error: "opsobservability: signal kind is not one of log|span|error",
		};
	}
	const out = { ...s };
	if (
		(out.kind === "log" || out.kind === "error") &&
		String(out.severity).trim() === ""
	) {
		out.severity = "info";
	}
	return out;
}

/** narrows an ingest result to its error case. */
export function isIngestError(r: Signal | IngestError): r is IngestError {
	return (r as IngestError).error !== undefined;
}

/** the closed, declared gitleaks-style log-leak detectors (mirrors the Go logLeakRules). */
const LOG_LEAK_RULES: RegExp[] = [
	/AKIA[0-9A-Z]{16}/g,
	/-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
	/bearer\s+[A-Za-z0-9._-]{20,}/gi,
	/postgres(?:ql)?:\/\/[^:/\s]+:[^@/\s]+@/g,
	/(?:secret|api[_-]?key|password|passwd|token|client[_-]?secret)["'\s]*[:=]\s*["']?[A-Za-z0-9._\-+/]{8,}["']?/gi,
];

/** redactLog deterministically masks any secret-shaped span (the same law as S91). */
export function redactLog(body: string): string {
	let out = body;
	for (const re of LOG_LEAK_RULES) {
		out = out.replace(re, "[REDACTED]");
	}
	return out;
}

/** rate is errs/total in [0,1] rounded to 4 decimals (byte-stable). 0 when total===0. */
function rate(errs: number, total: number): number {
	if (total === 0) return 0;
	const r = errs / total;
	return Math.round(r * 1e4) / 1e4;
}

/** the nearest-rank p-th percentile (ms) of durations (mirrors the Go percentile). */
export function percentile(durations: number[], p: number): number {
	if (durations.length === 0) return 0;
	const d = [...durations].sort((a, b) => a - b);
	let rank = Math.floor((p * d.length + 99) / 100);
	if (rank < 1) rank = 1;
	if (rank > d.length) rank = d.length;
	return d[rank - 1];
}

/** stable feed ordering by (at, route, severity, body). */
function sortLogs(ls: LogLine[]): LogLine[] {
	return [...ls].sort((a, b) => {
		if (a.atUnixNano !== b.atUnixNano) return a.atUnixNano - b.atUnixNano;
		if (a.route !== b.route) return a.route < b.route ? -1 : 1;
		if (a.severity !== b.severity) return a.severity < b.severity ? -1 : 1;
		return a.body < b.body ? -1 : a.body > b.body ? 1 : 0;
	});
}

/** a small deterministic non-crypto content-address (FNV-1a over the canonical render). */
function fingerprint(d: Dashboard): string {
	let h = 0x811c9dc5;
	const feed = (s: string) => {
		for (let i = 0; i < s.length; i++) {
			h ^= s.charCodeAt(i);
			h = Math.imul(h, 0x01000193) >>> 0;
		}
	};
	feed(d.projectId + "\n");
	feed(
		`${d.totalRequests};${d.totalErrors};${d.latencyP50Ms};${d.latencyP95Ms};${d.latencyP99Ms};`,
	);
	for (const r of d.routes) {
		feed(
			`${r.route}|${r.requestCount};${r.errorCount};${r.latencyP50Ms};${r.latencyP95Ms};${r.latencyP99Ms};`,
		);
	}
	for (const l of d.logs) {
		feed(`${l.kind}:${l.severity}:${l.route}:${l.body}\n`);
	}
	return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * buildDashboard aggregates a project's signals into its ops panel, DETERMINISTICALLY,
 * and proves it wrote no truth (report.wroteKernel === false). It ignores any signal not
 * scoped to projectId (per-app isolation). Pure: same (projectId, signals) → same report.
 */
export function buildDashboard(projectId: string, signals: Signal[]): Report {
	const spans: Signal[] = [];
	const logs: LogLine[] = [];
	const errorFeed: LogLine[] = [];
	const byRoute = new Map<string, Signal[]>();

	for (const s of signals) {
		if (s.projectId !== projectId) continue; // isolation
		if (s.kind === "span") {
			spans.push(s);
			const arr = byRoute.get(s.route) ?? [];
			arr.push(s);
			byRoute.set(s.route, arr);
		} else {
			const ll: LogLine = {
				kind: s.kind,
				severity: s.severity,
				route: s.route,
				body: redactLog(s.body),
				atUnixNano: s.atUnixNano,
			};
			logs.push(ll);
			if (s.kind === "error" || ERROR_SEVERITIES.has(s.severity)) {
				errorFeed.push(ll);
			}
		}
	}

	let errCount = 0;
	const durations: number[] = [];
	for (const sp of spans) {
		if (sp.isError) errCount++;
		durations.push(sp.durationMs);
	}

	const routeNames = [...byRoute.keys()].sort();
	const routes: RouteStat[] = routeNames.map((r) => {
		const rs = byRoute.get(r) ?? [];
		let ec = 0;
		const ds: number[] = [];
		for (const sp of rs) {
			if (sp.isError) ec++;
			ds.push(sp.durationMs);
		}
		return {
			route: r,
			requestCount: rs.length,
			errorCount: ec,
			errorRate: rate(ec, rs.length),
			latencyP50Ms: percentile(ds, 50),
			latencyP95Ms: percentile(ds, 95),
			latencyP99Ms: percentile(ds, 99),
		};
	});

	const dashboard: Dashboard = {
		projectId,
		totalRequests: spans.length,
		totalErrors: errCount,
		errorRate: rate(errCount, spans.length),
		latencyP50Ms: percentile(durations, 50),
		latencyP95Ms: percentile(durations, 95),
		latencyP99Ms: percentile(durations, 99),
		routes,
		logs: sortLogs(logs),
		errorFeed: sortLogs(errorFeed),
		fingerprint: "",
	};
	dashboard.fingerprint = fingerprint(dashboard);

	return { dashboard, wroteKernel: false };
}
