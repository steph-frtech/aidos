"use client";

import { useMemo, useState } from "react";
import {
	applyEvent,
	checkQuota,
	type IngestEvent,
	ingestWebhook,
	type MeteredRun,
	meterProject,
	meterUsage,
	PLAN_LADDER,
	PLAN_QUOTAS,
	type Plan,
	PROVIDER_NAME,
	type Usage,
	WEBHOOK_KINDS,
	type WebhookEvent,
	type WebhookKind,
} from "@/lib/billing";
import { VerifyContractInBrowser } from "@/lib/billing-verify";

// S114 — the action-capable billing panel. Every op the step develops has a control bound to
// it, reachable AND executable from the screen (ui-completeness): meter usage (account +
// per-project), enforce quota, ingest a provider webhook (idempotent), provider-verify the
// Pact contract. All PURE — re-runs the lib/billing twin; the wall (§2): below the line.

type Locale = "fr" | "en";

const T = {
	fr: {
		heading: "Plans, métrage déterministe & quotas",
		sub: "La couche économique customer-facing : un compte a un plan, sa consommation est COMPTÉE depuis les AgentRun enregistrés (jamais estimée, jamais un LLM), et un build au-delà du quota est REFUSÉ avec un chemin d'upgrade — jamais un échec silencieux.",
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
		pactHeading: `Contrat Pact avec le provider « ${PROVIDER_NAME} » (ADR 0049)`,
		verify: "Provider-vérifier le webhook",
		pass: "Contrat HONORÉ",
		fail: "Contrat NON honoré",
	},
	en: {
		heading: "Plans, deterministic metering & quotas",
		sub: "The customer-facing economic layer: an account has a plan, its usage is COUNTED from the recorded AgentRuns (never estimated, never an LLM), and a build over quota is REFUSED with an upgrade path — never a silent failure.",
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
		pactHeading: `Pact contract with provider “${PROVIDER_NAME}” (ADR 0049)`,
		verify: "Provider-verify the webhook",
		pass: "Contract HONOURED",
		fail: "Contract NOT honoured",
	},
} as const;

interface RunForm {
	id: string;
	project: string;
	tokens: number;
	buildMinutes: number;
}

let runSeq = 2;

export function BillingPanel({ locale }: { locale: Locale }) {
	const t = T[locale];
	const [account, setAccount] = useState("acct-1");
	const [plan, setPlan] = useState<Plan>("free");
	const [runs, setRuns] = useState<RunForm[]>([
		{ id: "run-0", project: "p1", tokens: 30_000, buildMinutes: 5 },
		{ id: "run-1", project: "p2", tokens: 200_000, buildMinutes: 4 },
	]);
	const [usage, setUsage] = useState<Usage | null>(null);
	const [quota, setQuota] = useState<ReturnType<typeof checkQuota> | null>(
		null,
	);

	const [whKind, setWhKind] = useState<WebhookKind>("checkout.completed");
	const [whPlan, setWhPlan] = useState<Plan>("pro");
	const [log, setLog] = useState<IngestEvent[]>([]);
	const [appliedNext, setAppliedNext] = useState<Plan | "">("");

	const [verify, setVerify] = useState<{
		pass: boolean;
		reason: string;
		interactions: string[];
	} | null>(null);

	const metered: MeteredRun[] = useMemo(
		() =>
			runs.map((r, i) => ({
				account,
				project: r.project,
				runId: `r${i + 1}`,
				meter: { tokens: r.tokens, ciMinutes: r.buildMinutes },
			})),
		[runs, account],
	);

	const onMeter = () => {
		const u = meterUsage(account, metered);
		setUsage(u);
		setQuota(null);
	};
	const onMeterProject = (project: string) => {
		setUsage(meterProject(account, project, metered));
		setQuota(null);
	};
	const onCheckQuota = () => {
		const u = usage ?? meterUsage(account, metered);
		setUsage(u);
		setQuota(checkQuota(plan, u));
	};
	const onIngest = () => {
		const e: WebhookEvent = {
			kind: whKind,
			providerId: "evt_demo",
			account,
			plan: whPlan,
		};
		try {
			const { log: next } = ingestWebhook(log, e);
			setLog(next);
			setAppliedNext(applyEvent(plan, e));
		} catch {
			setAppliedNext("");
		}
	};
	const onVerify = () => setVerify(VerifyContractInBrowser());

	return (
		<section className="space-y-8">
			<header className="space-y-2">
				<h1 className="text-2xl font-semibold tracking-tight">{t.heading}</h1>
				<p className="max-w-3xl text-sm text-muted-foreground">{t.sub}</p>
			</header>

			{/* Plans */}
			<div className="rounded-lg border border-border bg-card p-5">
				<h2 className="mb-3 text-lg font-medium">{t.plansHeading}</h2>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{PLAN_LADDER.map((p) => (
						<button
							key={p}
							type="button"
							data-testid={`plan-${p}`}
							onClick={() => setPlan(p)}
							className={`rounded-md border p-3 text-left text-sm transition ${
								plan === p
									? "border-primary bg-primary/10"
									: "border-border bg-background"
							}`}
						>
							<div className="font-medium capitalize">{p}</div>
							<div className="mt-1 text-xs text-muted-foreground">
								{PLAN_QUOTAS[p].maxLLMTokens.toLocaleString()}{" "}
								{t.tokens.toLowerCase()}
								<br />
								{PLAN_QUOTAS[p].maxBuildLoopMinutes.toLocaleString()} min ·{" "}
								{PLAN_QUOTAS[p].maxDeployedApps} apps
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
							<button
								type="button"
								data-testid={`meter-project-${i}`}
								onClick={() => onMeterProject(r.project)}
								className="rounded border border-border px-2 py-1 text-xs"
							>
								{t.meterProject}
							</button>
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
					<button
						type="button"
						data-testid="meter-btn"
						onClick={onMeter}
						className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
					>
						{t.meter}
					</button>
				</div>
				{usage && (
					<div
						className="mt-4 rounded-md border border-border bg-background p-3 text-sm"
						data-testid="usage"
					>
						<h3 className="mb-1 font-medium">{t.usageHeading}</h3>
						<div>
							{t.tokens}:{" "}
							<span data-testid="usage-tokens">
								{usage.llmTokens.toLocaleString()}
							</span>{" "}
							· {t.buildMin}: {usage.buildLoopMinutes} · runs: {usage.runCount}
						</div>
					</div>
				)}
			</div>

			{/* Quota enforcement */}
			<div className="rounded-lg border border-border bg-card p-5">
				<h2 className="mb-3 text-lg font-medium">{t.quotaHeading}</h2>
				<button
					type="button"
					data-testid="check-quota-btn"
					onClick={onCheckQuota}
					className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
				>
					{t.checkQuota}
				</button>
				{quota && (
					<div className="mt-4 text-sm" data-testid="quota-result">
						{quota.verdict === "allow" ? (
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
									✗ {t.deny} — {quota.blockReason?.code}
								</p>
								<p className="mt-1 text-xs text-muted-foreground">
									{quota.blockReason?.explanation}
								</p>
								{quota.upgradeTo ? (
									<p className="mt-2 text-xs" data-testid="quota-upgrade">
										{t.upgrade}:{" "}
										<strong className="capitalize">{quota.upgradeTo}</strong>
									</p>
								) : null}
								<ul className="mt-2 list-inside list-disc text-xs">
									{quota.blockReason?.howToFix.map((f) => (
										<li key={f}>{f}</li>
									))}
								</ul>
							</div>
						)}
					</div>
				)}
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
						{WEBHOOK_KINDS.map((k) => (
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
						{PLAN_LADDER.map((p) => (
							<option key={p} value={p}>
								{p}
							</option>
						))}
					</select>
					<button
						type="button"
						data-testid="ingest-btn"
						onClick={onIngest}
						className="rounded bg-primary px-3 py-1.5 text-primary-foreground"
					>
						{t.ingest}
					</button>
					<button
						type="button"
						data-testid="ingest-again-btn"
						onClick={onIngest}
						className="rounded border border-border px-3 py-1.5"
					>
						{t.ingestAgain}
					</button>
				</div>
				<div className="mt-3 text-sm" data-testid="webhook-result">
					<span data-testid="webhook-count">{log.length}</span>{" "}
					{t.eventsRecorded}
					{appliedNext ? (
						<>
							{" · "}
							{t.appliedPlan}:{" "}
							<strong className="capitalize" data-testid="webhook-applied">
								{appliedNext}
							</strong>
						</>
					) : null}
				</div>
			</div>

			{/* Pact provider verification */}
			<div className="rounded-lg border border-border bg-card p-5">
				<h2 className="mb-3 text-lg font-medium">{t.pactHeading}</h2>
				<button
					type="button"
					data-testid="verify-btn"
					onClick={onVerify}
					className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
				>
					{t.verify}
				</button>
				{verify && (
					<div className="mt-3 text-sm" data-testid="verify-result">
						<p
							className={verify.pass ? "text-emerald-600" : "text-destructive"}
							data-testid="verify-verdict"
						>
							{verify.pass ? `✓ ${t.pass}` : `✗ ${t.fail}`}
						</p>
						<ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
							{verify.interactions.map((i) => (
								<li key={i}>{i}</li>
							))}
						</ul>
					</div>
				)}
			</div>
		</section>
	);
}
