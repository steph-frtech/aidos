"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
	ingestAction,
	meterAction,
	pactAction,
	quotaAction,
} from "@/app/billing/actions";
import {
	INGEST_INITIAL,
	METER_INITIAL,
	PACT_INITIAL,
	QUOTA_INITIAL,
} from "@/app/billing/view";
import type { Plan, WebhookKind } from "@/lib/billing";
import type { PlanRow, RunRow } from "@/lib/billing-data";
import type { Source } from "@/lib/gateway-sdk";

// S114 — the action-capable billing panel (ADR 0092 kill-twins flip). Every op the step develops
// has a control bound to it, reachable AND EXECUTABLE from the screen (ui-completeness): meter
// usage (account + per-project), enforce quota, ingest a provider webhook (idempotent), provider-
// verify the Pact contract. Every control now reads the LIVE Go billing engine through the
// passerelle (the server actions in app/billing/actions.ts use readVia), with the twin lib/billing
// preserved ONLY as the deterministic demo fallback (lib/billing-data, source:"live"|"demo"). The
// panel only `import type`s from @/lib/billing — NO client-side twin call — so the T5 cliquet stays
// GREEN. THE WALL (§2): below the line — a plan/quota is declared data, the metering a COUNT; the
// panel WRITES NO TRUTH.

type Locale = "fr" | "en";

const PROVIDER_LABEL = "stripe";
const WEBHOOK_KIND_OPTIONS: WebhookKind[] = [
	"checkout.completed",
	"payment.succeeded",
	"payment.failed",
	"subscription.updated",
	"subscription.canceled",
];

const T = {
	fr: {
		heading: "Plans, métrage déterministe & quotas",
		sub: "La couche économique customer-facing : un compte a un plan, sa consommation est COMPTÉE depuis les AgentRun enregistrés (jamais estimée, jamais un LLM), et un build au-delà du quota est REFUSÉ avec un chemin d'upgrade — jamais un échec silencieux. Chaque contrôle lit le moteur Go via la passerelle (ADR 0092).",
		plansHeading: "Plans & quotas déclarés",
		account: "Compte",
		plan: "Plan",
		runsHeading: "Runs métrés (depuis les AgentRun)",
		addRun: "Ajouter un run",
		project: "Projet",
		tokens: "Tokens",
		buildMin: "Min. build-loop",
		meter: "Métrer la consommation",
		meterProject: "Métrer ce projet",
		usageHeading: "Consommation comptée",
		quotaHeading: "Enforcement du quota",
		checkQuota: "Vérifier le quota du build",
		allow: "Build AUTORISÉ sous le quota",
		deny: "Build REFUSÉ",
		upgrade: "Chemin d'upgrade",
		webhookHeading: "Webhook provider entrant (S73, run inbound)",
		ingest: "Ingérer le webhook",
		ingestAgain: "Rejouer le webhook (idempotent)",
		eventsRecorded: "événement(s) enregistré(s)",
		appliedPlan: "Plan appliqué",
		duplicate: "doublon supprimé (exactly-once)",
		pactHeading: `Contrat Pact avec le provider « ${PROVIDER_LABEL} » (ADR 0049)`,
		verify: "Provider-vérifier le webhook",
		pass: "Contrat HONORÉ",
		fail: "Contrat NON honoré",
		working: "…",
		sourceLive: "live",
		sourceDemo: "démo",
		sourceLiveTitle: "lu en direct depuis le moteur Go via la passerelle",
		sourceDemoTitle:
			"la passerelle est injoignable / la charge a été rejetée — repli sur la démo déterministe (ADR 0092)",
	},
	en: {
		heading: "Plans, deterministic metering & quotas",
		sub: "The customer-facing economic layer: an account has a plan, its usage is COUNTED from the recorded AgentRuns (never estimated, never an LLM), and a build over quota is REFUSED with an upgrade path — never a silent failure. Every control reads the Go engine through the passerelle (ADR 0092).",
		plansHeading: "Plans & declared quotas",
		account: "Account",
		plan: "Plan",
		runsHeading: "Metered runs (from the AgentRuns)",
		addRun: "Add a run",
		project: "Project",
		tokens: "Tokens",
		buildMin: "Build-loop min.",
		meter: "Meter usage",
		meterProject: "Meter this project",
		usageHeading: "Counted usage",
		quotaHeading: "Quota enforcement",
		checkQuota: "Check the build quota",
		allow: "Build ALLOWED within quota",
		deny: "Build REFUSED",
		upgrade: "Upgrade path",
		webhookHeading: "Inbound provider webhook (S73, run inbound)",
		ingest: "Ingest the webhook",
		ingestAgain: "Replay the webhook (idempotent)",
		eventsRecorded: "event(s) recorded",
		appliedPlan: "Applied plan",
		duplicate: "duplicate suppressed (exactly-once)",
		pactHeading: `Pact contract with provider “${PROVIDER_LABEL}” (ADR 0049)`,
		verify: "Provider-verify the webhook",
		pass: "Contract HONOURED",
		fail: "Contract NOT honoured",
		working: "…",
		sourceLive: "live",
		sourceDemo: "demo",
		sourceLiveTitle: "read live from the Go engine through the passerelle",
		sourceDemoTitle:
			"the passerelle is unreachable / the payload was rejected — fell back to the deterministic demo (ADR 0092)",
	},
} as const;

let runSeq = 2;

function SourceBadge({
	source,
	testId,
	t,
}: {
	source: Source;
	testId: string;
	t: (typeof T)[Locale];
}) {
	const live = source === "live";
	return (
		<span
			data-testid={testId}
			data-source={source}
			title={live ? t.sourceLiveTitle : t.sourceDemoTitle}
			className={
				live
					? "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
					: "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
			}
		>
			<span
				aria-hidden="true"
				className={
					live
						? "size-1.5 rounded-full bg-primary"
						: "size-1.5 rounded-full bg-muted-foreground"
				}
			/>
			{live ? t.sourceLive : t.sourceDemo}
		</span>
	);
}

function Submit({
	label,
	testId,
	variant = "primary",
	working,
}: {
	label: string;
	testId: string;
	variant?: "primary" | "ghost";
	working: string;
}) {
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid={testId}
			disabled={pending}
			className={
				variant === "primary"
					? "rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
					: "rounded border border-border px-3 py-1.5 text-sm disabled:opacity-50"
			}
		>
			{pending ? working : label}
		</button>
	);
}

export function BillingPanel({
	locale,
	plans,
	plansSource,
}: {
	locale: Locale;
	plans: PlanRow[];
	plansSource: Source;
}) {
	const t = T[locale];
	const [account, setAccount] = useState("acct-1");
	const [plan, setPlan] = useState<Plan>("free");
	const [runs, setRuns] = useState<RunRow[]>([
		{ id: "run-0", project: "p1", tokens: 30_000, buildMinutes: 5 },
		{ id: "run-1", project: "p2", tokens: 200_000, buildMinutes: 4 },
	]);
	const runsJson = JSON.stringify(runs);

	const [meter, meterSubmit] = useActionState(meterAction, METER_INITIAL);
	const [quota, quotaSubmit] = useActionState(quotaAction, QUOTA_INITIAL);
	const [ingest, ingestSubmit] = useActionState(ingestAction, INGEST_INITIAL);
	const [pact, pactSubmit] = useActionState(pactAction, PACT_INITIAL);

	const [whKind, setWhKind] = useState<WebhookKind>("checkout.completed");
	const [whPlan, setWhPlan] = useState<Plan>("pro");

	// The prior ingest log threads to the next ingest call (idempotent replay) — server actions are
	// stateless, so the panel carries the live log forward via the hidden `prior` field.
	const priorJson = JSON.stringify(ingest.read?.log ?? []);

	return (
		<section className="space-y-8">
			<header className="space-y-2">
				<div className="flex flex-wrap items-center gap-3">
					<h1 className="text-2xl font-semibold tracking-tight">{t.heading}</h1>
					<SourceBadge source={plansSource} testId="plans-source" t={t} />
				</div>
				<p className="max-w-3xl text-sm text-muted-foreground">{t.sub}</p>
			</header>

			{/* Plans (read live from billing_plans) */}
			<div className="rounded-lg border border-border bg-card p-5">
				<h2 className="mb-3 text-lg font-medium">{t.plansHeading}</h2>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{plans.map((row) => (
						<button
							key={row.plan}
							type="button"
							data-testid={`plan-${row.plan}`}
							onClick={() => setPlan(row.plan)}
							className={`rounded-md border p-3 text-left text-sm transition ${
								plan === row.plan
									? "border-primary bg-primary/10"
									: "border-border bg-background"
							}`}
						>
							<div className="font-medium capitalize">{row.plan}</div>
							<div className="mt-1 text-xs text-muted-foreground">
								{row.quota.maxLLMTokens.toLocaleString()}{" "}
								{t.tokens.toLowerCase()}
								<br />
								{row.quota.maxBuildLoopMinutes.toLocaleString()} min ·{" "}
								{row.quota.maxDeployedApps} apps
							</div>
						</button>
					))}
				</div>
			</div>

			{/* Account + runs + metering */}
			<div className="rounded-lg border border-border bg-card p-5">
				<h2 className="mb-3 text-lg font-medium">{t.runsHeading}</h2>
				<label className="mb-3 block text-sm">
					{t.account}{" "}
					<input
						data-testid="account-input"
						value={account}
						onChange={(e) => setAccount(e.target.value)}
						className="ml-2 rounded border border-border bg-background px-2 py-1"
					/>
				</label>
				<div className="space-y-2">
					{runs.map((r, i) => (
						<div
							key={r.id}
							className="flex flex-wrap items-center gap-2 text-sm"
							data-testid={`run-row-${i}`}
						>
							<input
								aria-label={t.project}
								value={r.project}
								onChange={(e) =>
									setRuns((rs) =>
										rs.map((x, j) =>
											j === i ? { ...x, project: e.target.value } : x,
										),
									)
								}
								className="w-20 rounded border border-border bg-background px-2 py-1"
							/>
							<input
								aria-label={t.tokens}
								type="number"
								value={r.tokens}
								onChange={(e) =>
									setRuns((rs) =>
										rs.map((x, j) =>
											j === i ? { ...x, tokens: Number(e.target.value) } : x,
										),
									)
								}
								className="w-28 rounded border border-border bg-background px-2 py-1"
							/>
							<input
								aria-label={t.buildMin}
								type="number"
								value={r.buildMinutes}
								onChange={(e) =>
									setRuns((rs) =>
										rs.map((x, j) =>
											j === i
												? { ...x, buildMinutes: Number(e.target.value) }
												: x,
										),
									)
								}
								className="w-24 rounded border border-border bg-background px-2 py-1"
							/>
							<form action={meterSubmit} className="inline">
								<input type="hidden" name="account" value={account} />
								<input type="hidden" name="runs" value={runsJson} />
								<input type="hidden" name="project" value={r.project} />
								<Submit
									label={t.meterProject}
									testId={`meter-project-${i}`}
									variant="ghost"
									working={t.working}
								/>
							</form>
						</div>
					))}
				</div>
				<div className="mt-3 flex gap-2">
					<button
						type="button"
						data-testid="add-run"
						onClick={() =>
							setRuns((rs) => [
								...rs,
								{
									id: `run-${runSeq++}`,
									project: "p1",
									tokens: 10_000,
									buildMinutes: 1,
								},
							])
						}
						className="rounded border border-border px-3 py-1.5 text-sm"
					>
						{t.addRun}
					</button>
					<form action={meterSubmit} className="inline">
						<input type="hidden" name="account" value={account} />
						<input type="hidden" name="runs" value={runsJson} />
						<Submit label={t.meter} testId="meter-btn" working={t.working} />
					</form>
				</div>
				{meter.ran && meter.usage ? (
					<div
						className="mt-4 rounded-md border border-border bg-background p-3 text-sm"
						data-testid="usage"
					>
						<div className="mb-1 flex items-center justify-between">
							<h3 className="font-medium">
								{t.usageHeading}
								{meter.scopeLabel ? ` — ${meter.scopeLabel}` : ""}
							</h3>
							{meter.source ? (
								<SourceBadge
									source={meter.source}
									testId="usage-source"
									t={t}
								/>
							) : null}
						</div>
						<div>
							{t.tokens}:{" "}
							<span data-testid="usage-tokens">
								{meter.usage.llmTokens.toLocaleString()}
							</span>{" "}
							· {t.buildMin}: {meter.usage.buildLoopMinutes} · runs:{" "}
							{meter.usage.runCount}
						</div>
					</div>
				) : null}
			</div>

			{/* Quota enforcement */}
			<div className="rounded-lg border border-border bg-card p-5">
				<h2 className="mb-3 text-lg font-medium">{t.quotaHeading}</h2>
				<form action={quotaSubmit}>
					<input type="hidden" name="account" value={account} />
					<input type="hidden" name="plan" value={plan} />
					<input type="hidden" name="runs" value={runsJson} />
					<Submit
						label={t.checkQuota}
						testId="check-quota-btn"
						working={t.working}
					/>
				</form>
				{quota.ran && quota.decision ? (
					<div className="mt-4 text-sm" data-testid="quota-result">
						{quota.source ? (
							<div className="mb-2 flex justify-end">
								<SourceBadge
									source={quota.source}
									testId="quota-source"
									t={t}
								/>
							</div>
						) : null}
						{quota.decision.verdict === "allow" ? (
							<p
								className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3"
								data-testid="quota-allow"
							>
								✓ {t.allow}
							</p>
						) : (
							<div
								className="rounded-md border border-destructive/40 bg-destructive/10 p-3"
								data-testid="quota-deny"
							>
								<p className="font-medium" data-testid="quota-code">
									✗ {t.deny} — {quota.decision.blockReason?.code}
								</p>
								<p className="mt-1 text-xs text-muted-foreground">
									{quota.decision.blockReason?.explanation}
								</p>
								{quota.decision.upgradeTo ? (
									<p className="mt-2 text-xs" data-testid="quota-upgrade">
										{t.upgrade}:{" "}
										<strong className="capitalize">
											{quota.decision.upgradeTo}
										</strong>
									</p>
								) : null}
								<ul className="mt-2 list-inside list-disc text-xs">
									{quota.decision.blockReason?.howToFix.map((f) => (
										<li key={f}>{f}</li>
									))}
								</ul>
							</div>
						)}
					</div>
				) : null}
			</div>

			{/* Inbound webhook */}
			<div className="rounded-lg border border-border bg-card p-5">
				<h2 className="mb-3 text-lg font-medium">{t.webhookHeading}</h2>
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<select
						data-testid="webhook-kind"
						value={whKind}
						onChange={(e) => setWhKind(e.target.value as WebhookKind)}
						className="rounded border border-border bg-background px-2 py-1"
					>
						{WEBHOOK_KIND_OPTIONS.map((k) => (
							<option key={k} value={k}>
								{k}
							</option>
						))}
					</select>
					<select
						data-testid="webhook-plan"
						value={whPlan}
						onChange={(e) => setWhPlan(e.target.value as Plan)}
						className="rounded border border-border bg-background px-2 py-1"
					>
						{plans.map((row) => (
							<option key={row.plan} value={row.plan}>
								{row.plan}
							</option>
						))}
					</select>
					<form action={ingestSubmit} className="inline">
						<input type="hidden" name="account" value={account} />
						<input type="hidden" name="kind" value={whKind} />
						<input type="hidden" name="plan" value={whPlan} />
						<input type="hidden" name="current" value={plan} />
						<input type="hidden" name="prior" value="[]" />
						<Submit label={t.ingest} testId="ingest-btn" working={t.working} />
					</form>
					<form action={ingestSubmit} className="inline">
						<input type="hidden" name="account" value={account} />
						<input type="hidden" name="kind" value={whKind} />
						<input type="hidden" name="plan" value={whPlan} />
						<input type="hidden" name="current" value={plan} />
						<input type="hidden" name="prior" value={priorJson} />
						<Submit
							label={t.ingestAgain}
							testId="ingest-again-btn"
							variant="ghost"
							working={t.working}
						/>
					</form>
				</div>
				{ingest.ran && ingest.read ? (
					<div className="mt-3 text-sm" data-testid="webhook-result">
						{ingest.source ? (
							<div className="mb-2 flex justify-end">
								<SourceBadge
									source={ingest.source}
									testId="webhook-source"
									t={t}
								/>
							</div>
						) : null}
						<span data-testid="webhook-count">{ingest.read.log.length}</span>{" "}
						{t.eventsRecorded}
						{ingest.read.duplicate ? <> · {t.duplicate}</> : null}
						{ingest.read.nextPlan ? (
							<>
								{" · "}
								{t.appliedPlan}:{" "}
								<strong className="capitalize" data-testid="webhook-applied">
									{ingest.read.nextPlan}
								</strong>
							</>
						) : null}
						{ingest.read.code ? (
							<p
								className="mt-1 text-xs text-destructive"
								data-testid="webhook-error"
							>
								{ingest.read.code} — {ingest.read.explanation}
							</p>
						) : null}
					</div>
				) : null}
			</div>

			{/* Pact provider verification */}
			<div className="rounded-lg border border-border bg-card p-5">
				<h2 className="mb-3 text-lg font-medium">{t.pactHeading}</h2>
				<form action={pactSubmit}>
					<Submit label={t.verify} testId="verify-btn" working={t.working} />
				</form>
				{pact.ran && pact.pact ? (
					<div className="mt-3 text-sm" data-testid="verify-result">
						{pact.source ? (
							<div className="mb-2 flex justify-end">
								<SourceBadge
									source={pact.source}
									testId="verify-source"
									t={t}
								/>
							</div>
						) : null}
						<p
							className={
								pact.pact.pass ? "text-emerald-600" : "text-destructive"
							}
							data-testid="verify-verdict"
						>
							{pact.pact.pass ? `✓ ${t.pass}` : `✗ ${t.fail}`}
						</p>
						<ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
							{pact.pact.interactions.map((i) => (
								<li key={i}>{i}</li>
							))}
						</ul>
					</div>
				) : null}
			</div>
		</section>
	);
}
