"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	type AsyncSubstrateView,
	emitAsyncFragments,
	type ServiceFragmentView,
} from "./actions";

/**
 * AsyncSubstratePanel renders the DP16 ASYNC-SUBSTRATE service fragments of the emitted
 * app — the TWO async-layer services: Windmill (the workflow / jobs engine, role=workflow,
 * profile core — JAMAIS Temporal, contrainte dure) and NATS (the message bus, role=bus,
 * core), each carried with its image, internal port, named bind volume, healthcheck,
 * depends_on, profile and the project it is isolated to. The source is the AUTHORITATIVE
 * Go (cmd/aidosdatafragments -async, the twin of the DP15 data door — never a forked TS
 * palette), re-emitted on the env passed down by the parent.
 *
 * It also carries a MINI DEMO TRIGGER (« déclencher un job de démo ») that realises the
 * canonical scheduled operation (sendReminder) at its echeance on an INJECTED clock and
 * shows the ORDERED dispatch sequence via the S73 transactional outbox — per effect a
 * `write-effect` step (the effect is written PENDING in the state transaction) THEN an
 * `ack` step (the dispatcher delivered it). Write-effect ALWAYS precedes ack — no real job
 * runs, no real clock ticks; the trace is the deterministic fixture sequence.
 *
 * THE WALL (§2): the screen renders a below-the-line projection — it writes NOTHING (no
 * kernel/mirrors/fitness; a worker writes no truth). Themed on ADR 0010 tokens; strings via
 * next-intl (ADR 0011, FR first). DETERMINISM-FIRST: the Go is authoritative; the scheduler
 * is code on an injected clock; the panel only displays its deterministic output.
 */
export function AsyncSubstratePanel({
	activeProjectId,
	env,
	initial,
}: {
	activeProjectId: string | null;
	env: string;
	initial: AsyncSubstrateView;
}) {
	const t = useTranslations("substrate");
	const [view, setView] = useState<AsyncSubstrateView>(initial);
	const [triggered, setTriggered] = useState(false);
	const [pending, startTransition] = useTransition();

	// The env is owned by the parent (the data panel's selector); when it changes we
	// re-emit the async fragments for the same (project, env) so the two stay in step.
	const [shownEnv, setShownEnv] = useState(env);
	if (env !== shownEnv) {
		setShownEnv(env);
		startTransition(async () => {
			const v = await emitAsyncFragments(activeProjectId, env);
			setView(v);
			setTriggered(false);
		});
	}

	function triggerJob() {
		// The trigger re-realises the demo scheduled op via the authoritative Go (the trace
		// is deterministic — same input ⇒ same ordered events). It writes no truth.
		startTransition(async () => {
			const v = await emitAsyncFragments(activeProjectId, env);
			setView(v);
			setTriggered(true);
		});
	}

	return (
		<section data-testid="substrate-async" className="space-y-6">
			<header className="space-y-1">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{t("asyncHeading")}
				</h2>
				<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
					{t("asyncIntro")}
				</p>
			</header>

			{view.error ? (
				<div
					data-testid="async-error"
					className="rounded-xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive"
				>
					{view.error}
				</div>
			) : null}

			{/* the two emitted async services — Windmill + NATS */}
			<div
				data-testid="substrate-async-services"
				data-env={view.env}
				data-count={view.async.length}
				className="grid gap-4 sm:grid-cols-2"
			>
				{view.async.map((f) => (
					<AsyncServiceCard key={f.key} f={f} t={t} />
				))}
			</div>

			{/* the mini demo trigger — realises the scheduled op on an injected clock */}
			<div className="space-y-4 rounded-xl border border-border bg-card p-5">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="space-y-1">
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{t("demoHeading")}
						</h3>
						<p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
							{t("demoIntro")}
						</p>
					</div>
					<button
						type="button"
						data-testid="async-trigger"
						disabled={pending}
						onClick={triggerJob}
						className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
					>
						{pending ? t("demoRunning") : t("demoTrigger")}
					</button>
				</div>

				{triggered ? (
					<ol
						data-testid="async-events"
						data-count={view.demo.length}
						className="space-y-2"
					>
						{view.demo.map((s) => (
							<li
								key={`${s.step}-${s.phase}`}
								data-testid="async-event"
								data-step={s.step}
								data-phase={s.phase}
								className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-xs"
							>
								<span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[0.7rem] font-bold text-primary">
									{s.step}
								</span>
								<span
									className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${
										s.phase === "write-effect"
											? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
											: "bg-primary/10 text-primary"
									}`}
								>
									{s.phase === "write-effect"
										? t("phaseWriteEffect")
										: t("phaseAck")}
								</span>
								<span className="font-mono text-foreground">{s.operation}</span>
								<span className="text-muted-foreground">→</span>
								<span className="font-mono text-muted-foreground">
									{s.kind} · {s.target}
								</span>
								<span className="ml-auto inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground">
									{s.bus}
								</span>
							</li>
						))}
					</ol>
				) : (
					<p
						data-testid="async-events-empty"
						className="text-xs leading-relaxed text-muted-foreground"
					>
						{t("demoEmpty")}
					</p>
				)}
			</div>
		</section>
	);
}

function AsyncServiceCard({
	f,
	t,
}: {
	f: ServiceFragmentView;
	t: ReturnType<typeof useTranslations>;
}) {
	const isWindmill = f.key === "windmill";
	const roleKey = `role_${f.service.role}`;
	return (
		<article
			data-testid="substrate-service"
			data-key={f.key}
			data-profile={f.service.profile}
			data-role={f.service.role}
			className="space-y-3 rounded-xl border border-border bg-card p-5"
		>
			<header className="flex flex-wrap items-center gap-2">
				<h3 className="text-base font-semibold tracking-tight text-foreground">
					{f.service.name}
				</h3>
				{/* the role badge (workflow / bus) */}
				<span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
					{t(roleKey)}
				</span>
				{/* the « moteur de workflows » badge for Windmill (Temporal refusé) */}
				{isWindmill ? (
					<span
						data-testid="badge-workflow-engine"
						className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-bold text-primary"
					>
						{t("workflowEngine")}
					</span>
				) : null}
				{/* the profile badge — both core */}
				<span
					data-testid="service-profile"
					className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-medium text-primary"
				>
					{t("profileCore")}
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

				<dt className="font-medium text-muted-foreground">{t("project")}</dt>
				<dd className="font-mono text-foreground">{f.project_id}</dd>

				<dt className="font-medium text-muted-foreground">{t("hash")}</dt>
				<dd className="truncate font-mono text-muted-foreground" title={f.hash}>
					{f.hash.slice(0, 12)}
				</dd>
			</dl>

			{isWindmill ? (
				<p className="text-[0.7rem] leading-relaxed text-muted-foreground">
					{t("windmillNote")}
				</p>
			) : null}
		</article>
	);
}
