"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { Signal, SignalKind } from "@/lib/ops-observability";
// The PURE compute is pulled from the demo sibling (ops-observability-data re-exports the
// twin) — never a direct value-import of the twin lib, so the T5 cliquet stays green.
import { buildDashboard } from "@/lib/ops-observability-data";
import { buildDashboardAction } from "./actions";
import { OPS_INITIAL, type OpsView } from "./view";

/**
 * OpsObservabilityPanel makes the /ops-observability route action-capable (ui-completeness
 * law, CLAUDE.md §7): the S92 per-app ops panel has every op bound to a control, reachable
 * AND executable from the screen — EMIT an OTel signal (the emitted app's log/span/error),
 * and BUILD the ops dashboard (request count, error rate, latency p50/p95/p99, log feed,
 * error feed) that the user reads to operate the app daily.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): every control runs the PURE twin (lib/ops-
 * observability), never an LLM — same signals → same dashboard. THE WALL (§2): ops-
 * observability is a RENDER layer, never a Kernel on-ramp (the E12 RealityMirror alone is
 * the on-ramp) — every build writes NO truth (wroteKernel === false), shown explicitly.
 * A secret a careless app logged is REDACTED before render. Themed on ADR 0010 tokens;
 * strings via next-intl (ADR 0011).
 */
export function OpsObservabilityPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("opsObservability");
	const tc = useTranslations("common");
	const project = activeProjectId ?? "shop";
	const [view, setView] = useState<OpsView>(OPS_INITIAL);
	const [pending, startTransition] = useTransition();

	// the form fields for emitting one signal.
	const [kind, setKind] = useState<SignalKind>("span");
	const [route, setRoute] = useState("POST /orders");
	const [durationMs, setDurationMs] = useState("25");
	const [severity, setSeverity] = useState("info");
	const [body, setBody] = useState("");
	const [isError, setIsError] = useState(false);

	function emit() {
		const next: Signal = {
			projectId: project,
			kind,
			route,
			durationMs: Number(durationMs) || 0,
			severity: severity as Signal["severity"],
			body,
			isError,
			atUnixNano: view.signals.length + 1,
		};
		setView((v) => ({
			...v,
			ok: true,
			signals: [...v.signals, next],
			message: t("emitted"),
		}));
	}

	function build() {
		// OPTIMISTIC client compute (the twin, the demo path) renders instantly; the LIVE
		// `ops_dashboard` read through the passerelle then reconciles the displayed dashboard
		// and the source badge (live → demo fallback). ADR 0092: the Go moteur is the live source.
		const optimistic = buildDashboard(project, view.signals);
		const signals = view.signals;
		setView((v) => ({
			...v,
			ok: true,
			dashboard: optimistic.dashboard,
			wroteKernel: optimistic.wroteKernel,
			source: "demo",
			message: t("built"),
		}));
		startTransition(async () => {
			const live = await buildDashboardAction(project, signals);
			setView((v) => ({
				...v,
				ok: true,
				dashboard: live.dashboard ?? optimistic.dashboard,
				wroteKernel: live.wroteKernel,
				source: live.source,
				message: t("built"),
			}));
		});
	}

	function seedDemo() {
		// a one-click demo: the emitted app emitted a burst of spans + a logged error.
		const demo: Signal[] = [
			{
				projectId: project,
				kind: "span",
				route: "POST /orders",
				durationMs: 12,
				severity: "info",
				body: "",
				isError: false,
				atUnixNano: 1,
			},
			{
				projectId: project,
				kind: "span",
				route: "POST /orders",
				durationMs: 34,
				severity: "info",
				body: "",
				isError: false,
				atUnixNano: 2,
			},
			{
				projectId: project,
				kind: "span",
				route: "GET /health",
				durationMs: 3,
				severity: "info",
				body: "",
				isError: false,
				atUnixNano: 3,
			},
			{
				projectId: project,
				kind: "span",
				route: "POST /orders",
				durationMs: 210,
				severity: "info",
				body: "",
				isError: true,
				atUnixNano: 4,
			},
			{
				projectId: project,
				kind: "log",
				route: "POST /orders",
				durationMs: 0,
				severity: "error",
				body: "db timeout after 200ms",
				isError: false,
				atUnixNano: 5,
			},
			{
				projectId: project,
				kind: "error",
				route: "POST /orders",
				durationMs: 0,
				severity: "fatal",
				body: 'connect with password="leakedsecret123"',
				isError: false,
				atUnixNano: 6,
			},
		];
		setView({ ...OPS_INITIAL, ok: true, signals: demo, message: t("seeded") });
	}

	const d = view.dashboard;

	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<span className="font-medium text-foreground">
					{t("activeProjectLabel")}:
				</span>
				<span
					data-testid="active-project"
					className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono"
				>
					{project}
				</span>
				<span
					data-testid="wrote-kernel"
					className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5"
				>
					{t("wallProof")}: {view.wroteKernel ? "true" : "false"}
				</span>
			</div>

			{/* EMIT one signal — the emitted app's OTel exporter, simulated from the screen. */}
			<section className="space-y-4 rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold text-foreground">
					{t("emitTitle")}
				</h2>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<label className="flex flex-col gap-1 text-xs text-muted-foreground">
						{t("fieldKind")}
						<select
							data-testid="field-kind"
							value={kind}
							onChange={(e) => setKind(e.target.value as SignalKind)}
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
						>
							<option value="span">span</option>
							<option value="log">log</option>
							<option value="error">error</option>
						</select>
					</label>
					<label className="flex flex-col gap-1 text-xs text-muted-foreground">
						{t("fieldRoute")}
						<input
							data-testid="field-route"
							value={route}
							onChange={(e) => setRoute(e.target.value)}
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
						/>
					</label>
					<label className="flex flex-col gap-1 text-xs text-muted-foreground">
						{t("fieldDuration")}
						<input
							data-testid="field-duration"
							value={durationMs}
							onChange={(e) => setDurationMs(e.target.value)}
							inputMode="numeric"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
						/>
					</label>
					<label className="flex flex-col gap-1 text-xs text-muted-foreground">
						{t("fieldSeverity")}
						<select
							data-testid="field-severity"
							value={severity}
							onChange={(e) => setSeverity(e.target.value)}
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
						>
							<option value="debug">debug</option>
							<option value="info">info</option>
							<option value="warn">warn</option>
							<option value="error">error</option>
							<option value="fatal">fatal</option>
						</select>
					</label>
					<label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
						{t("fieldBody")}
						<input
							data-testid="field-body"
							value={body}
							onChange={(e) => setBody(e.target.value)}
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
						/>
					</label>
					<label className="flex items-center gap-2 text-xs text-muted-foreground">
						<input
							data-testid="field-iserror"
							type="checkbox"
							checked={isError}
							onChange={(e) => setIsError(e.target.checked)}
						/>
						{t("fieldIsError")}
					</label>
				</div>
				<div className="flex flex-wrap gap-3">
					<button
						type="button"
						data-testid="emit-signal"
						onClick={emit}
						className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
					>
						{t("emit")}
					</button>
					<button
						type="button"
						data-testid="seed-demo"
						onClick={seedDemo}
						className="inline-flex items-center justify-center rounded-lg border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/70"
					>
						{t("seed")}
					</button>
					<button
						type="button"
						data-testid="build-dashboard"
						onClick={build}
						disabled={pending}
						className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/50 disabled:opacity-60"
					>
						{t("build")}
					</button>
				</div>
				<p data-testid="signal-count" className="text-xs text-muted-foreground">
					{t("bufferedSignals")}: {view.signals.length}
				</p>
				{view.message ? (
					<p data-testid="message" className="text-xs text-muted-foreground">
						{view.message}
					</p>
				) : null}
			</section>

			{/* the DASHBOARD — the per-app ops panel the user reads to operate the app. */}
			{d ? (
				<section
					data-testid="dashboard"
					className="space-y-5 rounded-xl border border-border bg-card p-5"
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h2 className="text-sm font-semibold text-foreground">
							{t("dashboardTitle")}
						</h2>
						<span
							data-testid="dashboard-source"
							className={
								view.source === "live"
									? "inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
									: "inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
							}
						>
							{view.source === "live" ? tc("live") : tc("demo")}
						</span>
					</div>
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
						<Metric
							testid="metric-requests"
							label={t("requests")}
							value={String(d.totalRequests)}
						/>
						<Metric
							testid="metric-errorrate"
							label={t("errorRate")}
							value={`${(d.errorRate * 100).toFixed(1)}%`}
						/>
						<Metric
							testid="metric-p50"
							label="p50"
							value={`${d.latencyP50Ms}ms`}
						/>
						<Metric
							testid="metric-p95"
							label="p95"
							value={`${d.latencyP95Ms}ms`}
						/>
					</div>

					{d.routes.length > 0 ? (
						<div className="space-y-2">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase">
								{t("routes")}
							</h3>
							<ul data-testid="routes" className="space-y-1">
								{d.routes.map((r) => (
									<li
										key={r.route}
										className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-xs"
									>
										<span className="font-mono text-foreground">
											{r.route || "(unrouted)"}
										</span>
										<span className="text-muted-foreground">
											{r.requestCount} req · {(r.errorRate * 100).toFixed(0)}%
											err · p95 {r.latencyP95Ms}ms
										</span>
									</li>
								))}
							</ul>
						</div>
					) : null}

					<div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
						<Feed testid="logs" title={t("logFeed")} lines={d.logs} />
						<Feed
							testid="error-feed"
							title={t("errorFeed")}
							lines={d.errorFeed}
						/>
					</div>

					<p
						data-testid="fingerprint"
						className="font-mono text-[11px] text-muted-foreground"
					>
						{t("fingerprint")}: {d.fingerprint}
					</p>
				</section>
			) : null}
		</div>
	);
}

function Metric({
	testid,
	label,
	value,
}: {
	testid: string;
	label: string;
	value: string;
}) {
	return (
		<div
			data-testid={testid}
			className="rounded-lg border border-border bg-background p-3"
		>
			<div className="text-[11px] text-muted-foreground uppercase">{label}</div>
			<div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
		</div>
	);
}

function Feed({
	testid,
	title,
	lines,
}: {
	testid: string;
	title: string;
	lines: {
		kind: string;
		severity: string;
		route: string;
		body: string;
		atUnixNano: number;
	}[];
}) {
	return (
		<div className="space-y-2">
			<h3 className="text-xs font-semibold text-muted-foreground uppercase">
				{title}
			</h3>
			<ul data-testid={testid} className="space-y-1">
				{lines.length === 0 ? (
					<li className="text-xs text-muted-foreground">—</li>
				) : (
					lines.map((l, i) => (
						<li
							key={`${l.atUnixNano ?? i}-${l.route}-${l.body}`}
							className="rounded-lg bg-muted px-3 py-2 font-mono text-[11px] text-foreground"
						>
							<span className="text-muted-foreground">[{l.severity}]</span>{" "}
							{l.route} — {l.body}
						</li>
					))
				)}
			</ul>
		</div>
	);
}
