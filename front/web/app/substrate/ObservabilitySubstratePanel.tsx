"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	emitObservabilityFragments,
	type ObservabilitySubstrateView,
	type ObsServiceFragmentView,
} from "./actions";

/**
 * ObservabilitySubstratePanel renders the DP17 OBSERVABILITY-SUBSTRATE service fragments of
 * the emitted app's EXPLOITATION observability — the THREE observability-layer services:
 * OTel Collector (the OTLP ingest the app's @opentelemetry/* exporter feeds, role
 * observability), SigNoz (traces + metrics + logs, the per-app dashboard, role
 * observability, volume /var/lib/signoz) and GlitchTip (error-tracking, role errortracking,
 * depends_on postgres + valkey) — each carried with its image, internal port, volume,
 * healthcheck, depends_on, profile (all `observability`) and the project it is isolated to.
 * It also renders the EMITTED INSTRUMENTATION: how the emitted TS app wires
 * @opentelemetry/* → SigNoz and its errors → GlitchTip (ADR 0040 — JS/TS OTel SDK, NEVER
 * Go), a PURE projection of the Kernel. The source is the AUTHORITATIVE Go (cmd/
 * aidosdatafragments -observability), re-emitted on the env passed down by the parent.
 *
 * THE WALL (§2) — THE CAPITAL INVARIANT: exploitation observability writes NO truth. The
 * `obs-no-truth` indicator surfaces this deterministically (computed by the Go oracle, never
 * prose): no fragment, NOT the instrumentation carries a write-truth capability — a trace, a
 * metric, an error event is read by the user to OPERATE the app; it NEVER writes the
 * truth-store (the RealityMirror E12 is the only on-ramp into the Kernel). The screen renders
 * a below-the-line projection — it writes NOTHING. Themed on ADR 0010 tokens; strings via
 * next-intl (ADR 0011, FR first). DETERMINISM-FIRST: the Go is authoritative; the panel only
 * displays its deterministic output.
 */
export function ObservabilitySubstratePanel({
	activeProjectId,
	env,
	initial,
}: {
	activeProjectId: string | null;
	env: string;
	initial: ObservabilitySubstrateView;
}) {
	const t = useTranslations("substrate");
	const [view, setView] = useState<ObservabilitySubstrateView>(initial);
	const [, startTransition] = useTransition();

	// The env is owned by the parent (the data panel's selector); when it changes we
	// re-emit the observability fragments for the same (project, env) so all slices stay
	// in step.
	const [shownEnv, setShownEnv] = useState(env);
	if (env !== shownEnv) {
		setShownEnv(env);
		startTransition(async () => {
			const v = await emitObservabilityFragments(activeProjectId, env);
			setView(v);
		});
	}

	const instr = view.instrumentation;

	return (
		<section data-testid="substrate-obs" className="space-y-6">
			<header className="space-y-1">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{t("obsHeading")}
				</h2>
				<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
					{t("obsIntro")}
				</p>
			</header>

			{view.error ? (
				<div
					data-testid="obs-error"
					className="rounded-xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive"
				>
					{view.error}
				</div>
			) : null}

			{/* the three emitted observability services — OTel collector + SigNoz + GlitchTip */}
			<div
				data-testid="substrate-obs-services"
				data-env={view.env}
				data-count={view.observability.length}
				className="grid gap-4 sm:grid-cols-2"
			>
				{view.observability.map((f) => (
					<ObsServiceCard key={f.key} f={f} t={t} />
				))}
			</div>

			{/* THE CAPITAL INDICATOR — exploitation observability writes no truth (the wall §2) */}
			<div
				data-testid="obs-no-truth"
				data-no-truth={view.obs_no_truth}
				className="space-y-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5"
			>
				<div className="flex flex-wrap items-center gap-2">
					<span
						aria-hidden
						className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[0.7rem] font-bold text-emerald-600 dark:text-emerald-400"
					>
						{view.obs_no_truth ? "✓" : "!"}
					</span>
					<h3 className="text-sm font-semibold tracking-tight text-emerald-700 dark:text-emerald-300">
						{t("obsNoTruthHeading")}
					</h3>
				</div>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("obsNoTruthBody")}
				</p>
			</div>

			{/* the emitted instrumentation — how the TS app wires OTel → SigNoz, errors → GlitchTip */}
			{instr ? (
				<div
					data-testid="obs-instrumentation"
					className="space-y-4 rounded-xl border border-border bg-card p-5"
				>
					<div className="space-y-1">
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{t("obsInstrHeading")}
						</h3>
						<p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
							{t("obsInstrIntro")}
						</p>
					</div>

					<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
						<dt className="font-medium text-muted-foreground">
							{t("obsInstrPackages")}
						</dt>
						<dd
							data-testid="obs-instr-packages"
							className="flex flex-wrap gap-1.5"
						>
							{instr.packages.map((p) => (
								<span
									key={p}
									className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[0.7rem] text-foreground"
								>
									{p}
								</span>
							))}
						</dd>

						<dt className="font-medium text-muted-foreground">
							{t("obsInstrOtlp")}
						</dt>
						<dd
							data-testid="obs-instr-otlp"
							className="font-mono text-foreground"
						>
							{instr.otlp_endpoint_var} → {instr.otlp_target}
						</dd>

						<dt className="font-medium text-muted-foreground">
							{t("obsInstrDashboard")}
						</dt>
						<dd className="font-mono text-foreground">
							{instr.dashboard_target}
						</dd>

						<dt className="font-medium text-muted-foreground">
							{t("obsInstrErrors")}
						</dt>
						<dd
							data-testid="obs-instr-errors"
							className="font-mono text-foreground"
						>
							{instr.error_dsn_var} → {instr.error_target}
						</dd>

						<dt className="font-medium text-muted-foreground">{t("hash")}</dt>
						<dd
							className="truncate font-mono text-muted-foreground"
							title={instr.hash}
						>
							{instr.hash.slice(0, 12)}
						</dd>
					</dl>

					<p className="text-[0.7rem] leading-relaxed text-muted-foreground">
						{t("obsInstrNote")}
					</p>
				</div>
			) : null}
		</section>
	);
}

function ObsServiceCard({
	f,
	t,
}: {
	f: ObsServiceFragmentView;
	t: ReturnType<typeof useTranslations>;
}) {
	const roleKey = `role_${f.service.role}`;
	return (
		<article
			data-testid="substrate-service"
			data-key={f.key}
			data-profile={f.service.profile}
			data-role={f.service.role}
			data-writes-truth={f.writes_truth}
			className="space-y-3 rounded-xl border border-border bg-card p-5"
		>
			<header className="flex flex-wrap items-center gap-2">
				<h3 className="text-base font-semibold tracking-tight text-foreground">
					{f.service.name}
				</h3>
				{/* the role badge (observability / errortracking) */}
				<span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
					{t(roleKey)}
				</span>
				{/* the profile badge — all `observability` */}
				<span
					data-testid="service-profile"
					className="inline-flex items-center rounded-full bg-blue-500/15 px-2 py-0.5 text-[0.65rem] font-medium text-blue-600 dark:text-blue-400"
				>
					{t("profileObservability")}
				</span>
			</header>

			<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
				<dt className="font-medium text-muted-foreground">{t("image")}</dt>
				<dd data-testid="service-image" className="font-mono text-foreground">
					{f.service.image}
				</dd>

				<dt className="font-medium text-muted-foreground">{t("port")}</dt>
				<dd data-testid="service-port" className="font-mono text-foreground">
					{f.service.internal_port}
				</dd>

				<dt className="font-medium text-muted-foreground">{t("volume")}</dt>
				<dd data-testid="service-volume" className="font-mono text-foreground">
					{f.volumes.map((v) => v.name).join(", ") || "—"}
				</dd>

				<dt className="font-medium text-muted-foreground">
					{t("healthcheck")}
				</dt>
				<dd
					data-testid="service-healthcheck"
					className="font-mono text-foreground"
				>
					{f.service.healthcheck || "—"}
				</dd>

				<dt className="font-medium text-muted-foreground">{t("dependsOn")}</dt>
				<dd className="font-mono text-foreground">
					{f.service.depends_on?.length ? f.service.depends_on.join(", ") : "—"}
				</dd>

				<dt className="font-medium text-muted-foreground">
					{t("obsCapabilities")}
				</dt>
				<dd data-testid="service-capabilities" className="flex flex-wrap gap-1">
					{f.capabilities.map((c) => (
						<span
							key={c}
							className="inline-flex items-center rounded border border-border px-1.5 py-0.5 font-mono text-[0.6rem] text-muted-foreground"
						>
							{c}
						</span>
					))}
				</dd>

				<dt className="font-medium text-muted-foreground">{t("project")}</dt>
				<dd className="font-mono text-foreground">{f.project_id}</dd>

				<dt className="font-medium text-muted-foreground">{t("hash")}</dt>
				<dd className="truncate font-mono text-muted-foreground" title={f.hash}>
					{f.hash.slice(0, 12)}
				</dd>
			</dl>
		</article>
	);
}
