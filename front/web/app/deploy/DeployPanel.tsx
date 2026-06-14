"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { livenessAttr } from "@/lib/deploy-cockpit";
import { liveUrl } from "@/lib/env-rollback";
import {
	cockpitAction,
	deployAction,
	domainAction,
	envAction,
	previewAction,
	pulumiAction,
	targetAction,
} from "./actions";
import {
	COCKPIT_INITIAL,
	type CockpitView,
	DEPLOY_INITIAL,
	type DeployView,
	DOMAIN_INITIAL,
	type DomainView,
	ENV_INITIAL,
	type EnvView,
	PREVIEW_INITIAL,
	type PreviewView,
	PULUMI_INITIAL,
	type PulumiView,
	TARGET_INITIAL,
	type TargetView,
} from "./view";

/** The DP33 closed deployment-target set the « Cible de déploiement » selector toggles between. */
const DEPLOY_TARGETS = [
	{ target: "self_hosted", testid: "self-hosted" },
	{ target: "future_cloud", testid: "future_cloud" },
] as const;

/** The DP06 closed environment set the domain-cabling selector offers (prod/staging/dev/
 * future_cloud terminate TLS; local does NOT — cabling a custom HTTPS domain into local is refused). */
const DOMAIN_ENVIRONMENTS = [
	"prod",
	"staging",
	"dev",
	"local",
	"future_cloud",
] as const;

/** The DP11 closed profile set the preview selector offers (core default, full = complete). */
const PREVIEW_PROFILES = [
	"core",
	"docs",
	"observability",
	"qa",
	"git",
	"tickets",
	"connectors",
	"non-prod",
	"full",
] as const;

/**
 * DeployPanel makes the /deploy route action-capable (ui-completeness law, CLAUDE.md §7): the
 * S96 phase-keyed deploy pipeline has controls bound to the REAL pure twin (lib/deploy),
 * reachable AND executable from the screen.
 *
 * Action-capable surfaces, per the done-criteria:
 *  1. DEPLOY — build the deterministic, content-addressed deploy plan for the active phase (the
 *     per-phase deploy URL, the `pulumi up` boot, the deterministic `pulumi destroy` teardown,
 *     the emitted-app hash, the forward-only migration). A "non-stable" toggle proves the
 *     PHASE_NOT_STABLE refusal; a "with migration" toggle stages the expand→backfill→contract.
 *  2. PROBE (rendered) — the served-app hash ≟ emitted-app hash badge: the re-projection
 *     property, judged by CODE (the pure deployedMatchesPhase), never an agent.
 *  3. FORWARD-ONLY (rendered) — the migration stages badge: expand → backfill → contract.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): planning runs the PURE twin, never an LLM. THE WALL
 * (§2): planning WRITES NO TRUTH — recording the phase deploy as a DAG decision goes through
 * propose → ChangeSet → approval. Themed on ADR 0010 tokens; strings via next-intl (0011).
 */

function Submit({ label }: { label: string }) {
	const t = useTranslations("deploy");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="deploy-button"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

/**
 * LaunchPhase — the DP26 « Déployer cette phase » button. The control is ENABLED only when the
 * phase is stable (« done is computed » : red→vert ∧ vert antérieur ∧ mutation ≥ seuil ∧ aucun
 * monstre — the inherited Stop-gate, never a separate deploy-approval gate). A non-stable phase
 * keeps the button DISABLED — the action still runs (the form submit) and the screen surfaces
 * the PHASE_NOT_STABLE refusal, but the affordance reflects the gate.
 */
function LaunchPhase({ enabled }: { enabled: boolean }) {
	const t = useTranslations("deploy");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="deploy-launch"
			disabled={pending || !enabled}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : t("launchPhaseLabel")}
		</button>
	);
}

export function DeployPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("deploy");
	const [state, action] = useActionState<DeployView, FormData>(
		deployAction,
		DEPLOY_INITIAL,
	);
	const [tab, setTab] = useState<
		"cockpit" | "deploy" | "preview" | "env" | "domain" | "pulumi"
	>("deploy");

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
					{activeProjectId ?? t("noProject")}
				</span>
			</div>

			{/* Tabs — COCKPIT (DP29, clôture) | DEPLOY (S96) | PREVIEW (DP25) | ENV (DP28) | DOMAINE (DP27). */}
			<div
				className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1"
				role="tablist"
			>
				<button
					type="button"
					role="tab"
					data-testid="cockpit-tab"
					aria-selected={tab === "cockpit"}
					onClick={() => setTab("cockpit")}
					className={
						tab === "cockpit"
							? "flex-1 rounded-md bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm"
							: "flex-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
					}
				>
					{t("tabCockpit")}
				</button>
				<button
					type="button"
					role="tab"
					data-testid="deploy-tab"
					aria-selected={tab === "deploy"}
					onClick={() => setTab("deploy")}
					className={
						tab === "deploy"
							? "flex-1 rounded-md bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm"
							: "flex-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
					}
				>
					{t("tabDeploy")}
				</button>
				<button
					type="button"
					role="tab"
					data-testid="preview-tab"
					aria-selected={tab === "preview"}
					onClick={() => setTab("preview")}
					className={
						tab === "preview"
							? "flex-1 rounded-md bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm"
							: "flex-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
					}
				>
					{t("tabPreview")}
				</button>
				<button
					type="button"
					role="tab"
					data-testid="env-tab"
					aria-selected={tab === "env"}
					onClick={() => setTab("env")}
					className={
						tab === "env"
							? "flex-1 rounded-md bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm"
							: "flex-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
					}
				>
					{t("tabEnv")}
				</button>
				<button
					type="button"
					role="tab"
					data-testid="domain-tab"
					aria-selected={tab === "domain"}
					onClick={() => setTab("domain")}
					className={
						tab === "domain"
							? "flex-1 rounded-md bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm"
							: "flex-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
					}
				>
					{t("tabDomain")}
				</button>
				<button
					type="button"
					role="tab"
					data-testid="pulumi-tab"
					aria-selected={tab === "pulumi"}
					onClick={() => setTab("pulumi")}
					className={
						tab === "pulumi"
							? "flex-1 rounded-md bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm"
							: "flex-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
					}
				>
					{t("tabPulumi")}
				</button>
			</div>

			{tab === "cockpit" ? (
				<CockpitSection activeProjectId={activeProjectId} onGoToTab={setTab} />
			) : tab === "preview" ? (
				<PreviewSection activeProjectId={activeProjectId} />
			) : tab === "env" ? (
				<EnvSection activeProjectId={activeProjectId} />
			) : tab === "domain" ? (
				<DomainSection activeProjectId={activeProjectId} />
			) : tab === "pulumi" ? (
				<PulumiSection activeProjectId={activeProjectId} />
			) : (
				<DeploySection state={state} action={action} />
			)}
		</div>
	);
}

/**
 * CockpitSection — the DP29 « Cockpit déploiement & environnements » tab (EPIC F, clôture — ÉTEND
 * S99, ASSEMBLE DP25-28 en UN écran). The READ-SIDE companion of the DP25-28 action tabs: it shows,
 * per project, in ONE read model, the PHASES with their liveness (vert/rouge/inconnu — a PURE
 * projection of the DAG cut, S23, NEVER an estimation), the ENVIRONMENTS (preview/staging/prod/
 * future_cloud) switchables with the phase each serves and its live HTTPS URL, the custom DOMAINS
 * (+ TLS), the closed PROFILES, and the audit TIMELINE of incident/rollback. The deploy/rollback
 * actions are EXECUTABLE from the cockpit (they reuse the DP26 deploy + DP28 env twins) — a deploy
 * on a NON-STABLE phase is refused PHASE_NOT_STABLE (the inherited Stop-gate).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the projection is the PURE twin (deploy-cockpit.project) —
 * same DAG → byte-identical read model. The liveness/deployability are READ from the DP25-28 twins,
 * never re-computed. THE WALL (§2): the cockpit READS below-the-line facts and ASSEMBLES — it
 * writes NOTHING; a deploy/rollback is a ChangeSet proposal (infra truth) OR a below-the-line
 * trigger (preview/staging), executed through the reused DP26/DP28 actions.
 */
function CockpitSection({
	activeProjectId,
	onGoToTab,
}: {
	activeProjectId: string | null;
	onGoToTab: (tab: "deploy" | "preview" | "env" | "domain") => void;
}) {
	const t = useTranslations("deploy");
	const [state, action, pending] = useActionState<CockpitView, FormData>(
		cockpitAction,
		COCKPIT_INITIAL,
	);
	// Auto-load the read model on mount (the cockpit is a projection — it shows the DAG, then the
	// controls re-run it). The form is also submittable so a human re-projects after a deploy.
	const [loaded, setLoaded] = useState(false);
	useEffect(() => {
		if (!loaded) {
			setLoaded(true);
			const fd = new FormData();
			fd.set("project", activeProjectId ?? "shop");
			action(fd);
		}
	}, [loaded, action, activeProjectId]);

	const project = activeProjectId ?? "shop";
	const proj = state.projection;

	return (
		<div
			className="space-y-8"
			data-testid="deploy-cockpit"
			data-project={project}
		>
			{/* The cockpit re-projection control — re-runs the PURE DP29 projection over the DAG. */}
			<form
				action={action}
				className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-muted/40 p-5"
			>
				<div className="flex-1 space-y-2">
					<label
						htmlFor="cockpit-project"
						className="text-sm font-medium text-foreground"
					>
						{t("projectLabel")}
					</label>
					<input
						id="cockpit-project"
						name="project"
						defaultValue={project}
						data-testid="cockpit-project-input"
						className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<button
					type="submit"
					data-testid="cockpit-refresh"
					disabled={pending}
					className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
				>
					{pending ? t("working") : t("cockpitRefreshLabel")}
				</button>
				{proj && (
					<span
						data-testid="cockpit-hash"
						className="font-mono text-xs text-muted-foreground"
					>
						{t("cockpitHashLabel")}: {proj.hash}
					</span>
				)}
			</form>

			{proj && (
				<>
					{/* ── PHASES — liveness (vert/rouge/inconnu) + deployability (DP26). ── */}
					<section className="space-y-3 rounded-xl border border-border p-5">
						<h2 className="text-sm font-semibold text-foreground">
							{t("cockpitPhasesHeading")}
						</h2>
						<p className="text-xs leading-relaxed text-muted-foreground">
							{t("cockpitPhasesIntro")}
						</p>
						<ul className="space-y-2" data-testid="cockpit-phases">
							{proj.phases.map((p) => (
								<li
									key={p.nodeId}
									data-testid="cockpit-phase"
									data-node={p.nodeId}
									data-liveness={livenessAttr(p.liveness)}
									data-deployable={p.deployable ? "true" : "false"}
									className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted p-3"
								>
									<div className="min-w-0 space-y-0.5">
										<div className="flex items-center gap-2">
											<LivenessDot liveness={livenessAttr(p.liveness)} />
											<span className="text-sm font-medium text-foreground">
												{p.label ?? p.nodeId}
											</span>
											{p.head && (
												<span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
													{t("cockpitHeadBadge")}
												</span>
											)}
										</div>
										<p className="truncate font-mono text-xs text-muted-foreground">
											{p.nodeId}
										</p>
										{!p.deployable && p.reasons.length > 0 && (
											<p className="font-mono text-xs text-destructive">
												{p.reasons.join(", ")}
											</p>
										)}
									</div>
									{/* EXECUTABLE deploy of THIS phase — reuses the DP26 deploy twin; a non-stable
									    phase surfaces PHASE_NOT_STABLE in the cockpit-blockreason below. */}
									<CockpitDeployPhase
										project={project}
										phaseHash={p.nodeId}
										deployable={p.deployable}
									/>
								</li>
							))}
						</ul>
					</section>

					{/* ── ENVIRONMENTS — switchable, with the served phase + the live HTTPS URL. ── */}
					<CockpitEnvironments proj={proj} project={project} />

					{/* ── DOMAINS (+ TLS) + the closed PROFILES. ── */}
					<section className="grid gap-5 sm:grid-cols-2">
						<div className="space-y-3 rounded-xl border border-border p-5">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<h2 className="text-sm font-semibold text-foreground">
									{t("cockpitDomainsHeading")}
								</h2>
								<button
									type="button"
									data-testid="cockpit-go-domain"
									onClick={() => onGoToTab("domain")}
									className="text-xs text-blue-600 underline"
								>
									{t("cockpitLinkDomainLabel")}
								</button>
							</div>
							{proj.domains.length === 0 ? (
								<p className="text-xs text-muted-foreground">
									{t("cockpitNoDomains")}
								</p>
							) : (
								<ul className="space-y-2" data-testid="cockpit-domains">
									{proj.domains.map((d) => (
										<li
											key={d.domain}
											data-testid="cockpit-domain"
											data-env={d.environment}
											data-tls={d.tls ? "true" : "false"}
											className="space-y-0.5 rounded-lg bg-muted p-3"
										>
											<a
												href={d.url}
												data-testid="cockpit-domain-url"
												className="font-mono text-xs text-blue-600 underline"
											>
												{d.url}
											</a>
											<p className="font-mono text-xs text-muted-foreground">
												{d.environment} ·{" "}
												{d.tls ? t("cockpitTlsOn") : t("cockpitTlsOff")} ·{" "}
												{d.certResolver}
											</p>
										</li>
									))}
								</ul>
							)}
						</div>
						<div className="space-y-3 rounded-xl border border-border p-5">
							<h2 className="text-sm font-semibold text-foreground">
								{t("cockpitProfilesHeading")}
							</h2>
							<ul
								className="flex flex-wrap gap-2"
								data-testid="cockpit-profiles"
							>
								{proj.profiles.map((p) => (
									<li
										key={p}
										data-testid="cockpit-profile"
										className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono text-xs text-foreground"
									>
										{p}
									</li>
								))}
							</ul>
						</div>
					</section>

					{/* ── THE AUDIT TIMELINE — the DP28 incident/rollback history (provenance §9). ── */}
					<section className="space-y-3 rounded-xl border border-border p-5">
						<h2 className="text-sm font-semibold text-foreground">
							{t("cockpitAuditHeading")}
						</h2>
						<p className="text-xs leading-relaxed text-muted-foreground">
							{t("cockpitAuditIntro")}
						</p>
						<ol className="space-y-2" data-testid="cockpit-audit-timeline">
							{(state.audit ?? []).map((e) => (
								<li
									key={e.seq}
									data-testid="cockpit-audit-entry"
									data-kind={e.kind}
									data-env={e.env}
									data-seq={e.seq}
									className="flex items-start gap-3 rounded-lg bg-muted p-3"
								>
									<span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
										{e.seq + 1}
									</span>
									<div className="min-w-0 space-y-0.5">
										<p className="text-xs font-semibold tracking-wide text-foreground uppercase">
											{e.kind} · {e.env}
										</p>
										<p className="text-xs text-muted-foreground">{e.summary}</p>
										{e.fromPhaseHash && (
											<p className="font-mono text-xs text-muted-foreground">
												{e.fromPhaseHash} → {e.phaseHash}
											</p>
										)}
									</div>
								</li>
							))}
						</ol>
					</section>
				</>
			)}
		</div>
	);
}

/** LivenessDot — the vert/rouge/inconnu colour pip the cockpit paints per phase. */
function LivenessDot({ liveness }: { liveness: "green" | "red" | "unknown" }) {
	const cls =
		liveness === "green"
			? "bg-emerald-500"
			: liveness === "red"
				? "bg-destructive"
				: "bg-muted-foreground";
	return <span className={`inline-block size-2.5 rounded-full ${cls}`} />;
}

/**
 * CockpitDeployPhase — the EXECUTABLE « Déployer » control for one phase row, bound to the DP26
 * deploy twin (deployAction). A deployable (vert, stable) phase yields a per-phase deploy URL; a
 * NON-deployable (rouge) phase is refused PHASE_NOT_STABLE (surfaced in cockpit-blockreason). The
 * deploy is a ChangeSet proposal (infra truth) — the action writes no truth (the wall, §2).
 */
function CockpitDeployPhase({
	project,
	phaseHash,
	deployable,
}: {
	project: string;
	phaseHash: string;
	deployable: boolean;
}) {
	const [state, action] = useActionState<DeployView, FormData>(
		deployAction,
		DEPLOY_INITIAL,
	);

	return (
		<form action={action} className="flex flex-col items-end gap-1">
			<input type="hidden" name="project" value={project} />
			<input type="hidden" name="phaseHash" value={phaseHash} />
			{/* a non-deployable phase carries the `unstable` toggle ON → the action refuses PHASE_NOT_STABLE. */}
			{!deployable && <input type="hidden" name="unstable" value="on" />}
			<CockpitDeployButton deployable={deployable} />
			{state.ok && state.plan && (
				<a
					href={state.plan.url}
					data-testid="cockpit-phase-url"
					data-phase={phaseHash}
					className="font-mono text-[11px] text-blue-600 underline"
				>
					{state.plan.url}
				</a>
			)}
			{!state.ok && state.blockCode && (
				<span
					data-testid="cockpit-blockreason"
					data-code={state.blockCode}
					data-phase={phaseHash}
					className="font-mono text-[11px] text-destructive"
				>
					{state.blockCode}
				</span>
			)}
		</form>
	);
}

function CockpitDeployButton({ deployable }: { deployable: boolean }) {
	const t = useTranslations("deploy");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="cockpit-deploy-phase"
			disabled={pending}
			className={
				deployable
					? "inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
					: "inline-flex items-center justify-center rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
			}
		>
			{pending ? t("working") : t("cockpitDeployLabel")}
		</button>
	);
}

/**
 * CockpitEnvironments — the switchable environment ladder (preview/staging/prod/future_cloud) with
 * the phase each serves, its liveness, and its live HTTPS URL (cockpit-live-url). An EXECUTABLE
 * rollback control re-projects an earlier phase (DP28 envAction) — the cockpit's rollback surfaces
 * the re-emitted app of N-1. The selected env drives data-current (the e2e anchors on this change).
 */
function CockpitEnvironments({
	proj,
	project,
}: {
	proj: NonNullable<CockpitView["projection"]>;
	project: string;
}) {
	const t = useTranslations("deploy");
	const [selected, setSelected] = useState<string>(
		proj.environments[0]?.env ?? "preview",
	);
	const [rollback, rollbackAction] = useActionState<EnvView, FormData>(
		envAction,
		ENV_INITIAL,
	);
	const current = proj.environments.find((e) => e.env === selected);

	return (
		<section className="space-y-4 rounded-xl border border-border p-5">
			<h2 className="text-sm font-semibold text-foreground">
				{t("cockpitEnvsHeading")}
			</h2>
			{/* The switchable env ladder. */}
			<ol className="flex flex-wrap gap-2" data-testid="cockpit-envs">
				{proj.environments.map((e) => (
					<li key={e.env}>
						<button
							type="button"
							data-testid="cockpit-env"
							data-env={e.env}
							data-current={selected === e.env ? "true" : "false"}
							data-served-liveness={
								e.servedLiveness ? livenessAttr(e.servedLiveness) : "none"
							}
							onClick={() => setSelected(e.env)}
							className={
								selected === e.env
									? "inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 font-mono text-xs font-semibold text-primary-foreground"
									: "inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 font-mono text-xs text-foreground hover:bg-muted/70"
							}
						>
							{e.servedLiveness && (
								<LivenessDot liveness={livenessAttr(e.servedLiveness)} />
							)}
							{e.env}
						</button>
					</li>
				))}
			</ol>

			{/* The selected env's detail — served phase + the live HTTPS URL. */}
			{current && (
				<div
					data-testid="cockpit-env-detail"
					data-env={current.env}
					className="space-y-2 rounded-lg bg-muted p-4"
				>
					{current.servedPhaseId ? (
						<>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<span className="text-xs font-medium text-foreground">
									{t("cockpitServesLabel")}
								</span>
								<a
									href={current.liveUrl}
									data-testid="cockpit-live-url"
									data-env={current.env}
									className="font-mono text-xs text-blue-600 underline"
								>
									{current.liveUrl}
								</a>
							</div>
							<p className="font-mono text-xs text-muted-foreground">
								{t("phaseLabel")}: {current.servedPhaseId}
							</p>
							{current.domain && (
								<p
									data-testid="cockpit-env-domain"
									data-tls={current.tls ? "true" : "false"}
									className="font-mono text-xs text-emerald-700"
								>
									{current.domain} ·{" "}
									{current.tls ? t("cockpitTlsOn") : t("cockpitTlsOff")}
								</p>
							)}
							{current.env === "preview" && (
								<p
									data-testid="cockpit-staging-promotable"
									data-ok={current.stagingPromotable ? "true" : "false"}
									className={
										current.stagingPromotable
											? "text-xs text-emerald-700"
											: "text-xs text-muted-foreground"
									}
								>
									{current.stagingPromotable
										? t("cockpitPromotableOk")
										: t("cockpitPromotableNo")}
								</p>
							)}
						</>
					) : (
						<p
							data-testid="cockpit-env-empty"
							className="text-xs text-muted-foreground"
						>
							{t("cockpitEnvEmpty")}
						</p>
					)}
				</div>
			)}

			{/* EXECUTABLE rollback — re-project an earlier phase (DP28 envAction). */}
			<form
				action={rollbackAction}
				className="flex flex-wrap items-center gap-3"
			>
				<input type="hidden" name="project" value={project} />
				<input type="hidden" name="intent" value="rollback" />
				<input type="hidden" name="devPhase" value="phase-dev-current" />
				<CockpitRollbackButton />
			</form>
			{rollback.ok && rollback.rollback && (
				<div
					data-testid="cockpit-rollback-result"
					className="space-y-1 rounded-lg border border-border p-4"
				>
					<p className="text-xs font-medium text-foreground">
						{t("rollbackDoneHeading")}
					</p>
					<p
						data-testid="cockpit-rollback-to"
						className="font-mono text-xs text-foreground"
					>
						{rollback.rollback.fromPhaseHash} → {rollback.rollback.toPhaseHash}
					</p>
					<p
						data-testid="cockpit-rollback-hash"
						data-phase={rollback.rollback.toPhaseHash}
						className="font-mono text-xs text-emerald-700"
					>
						{t("rollbackAppHashLabel")}: {rollback.rollback.reProjectedAppHash}
					</p>
				</div>
			)}
		</section>
	);
}

function CockpitRollbackButton() {
	const t = useTranslations("deploy");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="cockpit-rollback"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
		>
			{pending ? t("working") : t("cockpitRollbackLabel")}
		</button>
	);
}

function DeploySection({
	state,
	action,
}: {
	state: DeployView;
	action: (formData: FormData) => void;
}) {
	const t = useTranslations("deploy");

	// The Stop-gate verdict drives the « Déployer » affordance. Before the first submit
	// (state.stable === undefined) the default form deploys a STABLE phase, so the button is
	// enabled; after a submit it reflects the COMPUTED verdict (a non-stable phase disables it).
	const gateStable = state.stable !== false;

	return (
		<div className="space-y-8">
			{/* DP26 — « Déployer cette phase » : the inherited Stop-gate state + the launch
			    control (enabled ONLY from a stable phase) + the complete ordered plan. */}
			<form
				action={action}
				data-testid="deploy-phase-section"
				className="space-y-5 rounded-xl border border-border p-5"
			>
				<h2 className="text-sm font-semibold text-foreground">
					{t("launchPhaseHeading")}
				</h2>
				<div className="space-y-2">
					<label
						htmlFor="project"
						className="text-sm font-medium text-foreground"
					>
						{t("projectLabel")}
					</label>
					<input
						id="project"
						name="project"
						defaultValue="shop"
						data-testid="project-input"
						className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div className="space-y-2">
					<label
						htmlFor="phaseHash"
						className="text-sm font-medium text-foreground"
					>
						{t("phaseLabel")}
					</label>
					<input
						id="phaseHash"
						name="phaseHash"
						defaultValue="phase-0123456789abcdef"
						data-testid="phase-input"
						className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<label className="flex items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						name="withMigration"
						defaultChecked
						data-testid="migration-toggle"
						className="size-4 rounded border-input"
					/>
					{t("migrationLabel")}
				</label>
				<label className="flex items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						name="unstable"
						data-testid="unstable-toggle"
						className="size-4 rounded border-input"
					/>
					{t("unstableLabel")}
				</label>

				{/* The inherited Stop-gate state — « done is computed ». */}
				<div
					data-testid="deploy-gate"
					data-stable={gateStable ? "true" : "false"}
					className={
						gateStable
							? "rounded-lg border border-emerald-500/40 bg-emerald-50/40 p-3 text-xs text-emerald-700"
							: "rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
					}
				>
					{gateStable ? t("gateStable") : t("gateNotStable")}
					{!gateStable && state.reasons && state.reasons.length > 0 && (
						<span className="font-mono"> · {state.reasons.join(", ")}</span>
					)}
				</div>

				<div className="flex flex-wrap gap-3">
					{/* « Déployer cette phase » — enabled ONLY from a stable phase. */}
					<LaunchPhase enabled={gateStable} />
					{/* The legacy deploy control (kept — anti-overwrite §9, S96 e2e relies on it). */}
					<Submit label={t("deployLabel")} />
				</div>
			</form>

			{state.blockExplanation && !state.ok && (
				<section
					data-testid="block-reason"
					data-code={state.blockCode}
					className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-5"
				>
					<h2 className="text-sm font-semibold text-destructive">
						{t("blockedHeading")} · {state.blockCode}
					</h2>
					{/* DP26 — the « Déployer cette phase » refusal, naming the gate reasons. */}
					<p
						data-testid="deploy-blockreason"
						data-code={state.blockCode}
						className="text-sm leading-relaxed text-muted-foreground"
					>
						{state.blockExplanation}
					</p>
				</section>
			)}

			{state.ok && state.plan && (
				<div className="space-y-6" data-testid="deploy-result">
					{/* The deploy plan — URL, hashes, boot/teardown. */}
					<section className="space-y-3 rounded-xl border border-border p-5">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<h2 className="text-sm font-semibold text-foreground">
								{t("planHeading")}
							</h2>
							<a
								href={state.plan.url}
								data-testid="deploy-url"
								className="font-mono text-xs text-blue-600 underline"
							>
								{state.plan.url}
							</a>
						</div>
						<dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
							<div>
								<dt className="text-muted-foreground">{t("phaseLabel")}</dt>
								<dd
									data-testid="plan-phase"
									className="font-mono text-foreground"
								>
									{state.plan.phaseHash}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{t("appHashLabel")}</dt>
								<dd
									data-testid="emitted-app-hash"
									className="font-mono text-foreground"
								>
									{state.plan.emittedAppHash}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{t("stackLabel")}</dt>
								<dd
									data-testid="plan-stack"
									className="font-mono text-foreground"
								>
									{state.plan.stackName}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{t("planIdLabel")}</dt>
								<dd data-testid="plan-id" className="font-mono text-foreground">
									{state.plan.id}
								</dd>
							</div>
						</dl>
						<div className="space-y-1">
							<p className="text-xs font-medium text-foreground">
								{t("bootLabel")}
							</p>
							<pre
								data-testid="plan-boot"
								className="overflow-auto rounded-lg bg-muted p-3 font-mono text-xs text-foreground"
							>
								{state.plan.boot.join(" ")}
							</pre>
						</div>
						<div className="space-y-1">
							<p className="text-xs font-medium text-foreground">
								{t("teardownLabel")}
							</p>
							<pre
								data-testid="plan-teardown"
								className="overflow-auto rounded-lg bg-muted p-3 font-mono text-xs text-foreground"
							>
								{state.plan.teardown.join(" ")}
							</pre>
						</div>
					</section>

					{/* The PROBE — served-app hash ≟ emitted-app hash (the re-projection property). */}
					<section className="space-y-2 rounded-xl border border-border p-5">
						<h2 className="text-sm font-semibold text-foreground">
							{t("probeHeading")}
						</h2>
						<p
							data-testid="served-match"
							data-match={state.servedMatches ? "true" : "false"}
							className={
								state.servedMatches
									? "font-mono text-xs text-emerald-600"
									: "font-mono text-xs text-destructive"
							}
						>
							{state.servedMatches ? t("matchOk") : t("matchFail")} ·{" "}
							{state.servedAppHash}
						</p>
					</section>

					{/* DP26 — the artefact hash + the hash-artefact = hash-phase indicator (the
					    re-projection: the deployed artefact IS the phase's app, never stale). */}
					<section className="space-y-2 rounded-xl border border-border p-5">
						<h2 className="text-sm font-semibold text-foreground">
							{t("artifactHeading")}
						</h2>
						<dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
							<div>
								<dt className="text-muted-foreground">
									{t("artifactHashLabel")}
								</dt>
								<dd
									data-testid="deploy-artifact-hash"
									className="font-mono text-foreground"
								>
									{state.plan.emittedAppHash}
								</dd>
							</div>
						</dl>
						<p
							data-testid="deploy-hash-matches"
							data-ok={state.servedMatches ? "true" : "false"}
							className={
								state.servedMatches
									? "font-mono text-xs text-emerald-600"
									: "font-mono text-xs text-destructive"
							}
						>
							{state.servedMatches
								? t("hashArtefactOk")
								: t("hashArtefactFail")}
						</p>
					</section>

					{/* DP26 — the COMPLETE deploy ORDER: network → volumes → datastore →
					    migration → bootstrap → healthcheck → URL (the deterministic timeline). */}
					{state.plan.order && (
						<section className="space-y-3 rounded-xl border border-border p-5">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<h2 className="text-sm font-semibold text-foreground">
									{t("orderHeading")}
								</h2>
								<span className="font-mono text-xs text-muted-foreground">
									{t("orderHashLabel")}: {state.plan.order.hash}
								</span>
							</div>
							<ol className="space-y-2" data-testid="deploy-order">
								{state.plan.order.stages.map((s) => (
									<li
										key={s.kind}
										data-testid="deploy-step"
										data-step={s.kind}
										data-seq={s.seq}
										className="flex items-start gap-3 rounded-lg bg-muted p-3"
									>
										<span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
											{s.seq}
										</span>
										<div className="min-w-0">
											<p className="text-xs font-semibold tracking-wide text-foreground uppercase">
												{s.kind}
											</p>
											<p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
												{s.detail}
											</p>
										</div>
									</li>
								))}
							</ol>
						</section>
					)}

					{/* The forward-only data migration (expand → backfill → contract). */}
					{state.plan.hasMigration && (
						<section className="space-y-3 rounded-xl border border-border p-5">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<h2 className="text-sm font-semibold text-foreground">
									{t("migrationHeading")}
								</h2>
								<span
									data-testid="forward-only"
									data-forward={state.forwardOnly ? "true" : "false"}
									className={
										state.forwardOnly
											? "inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
											: "inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive"
									}
								>
									{state.forwardOnly
										? t("forwardOnlyOk")
										: t("forwardOnlyFail")}
								</span>
							</div>
							<ol className="space-y-2" data-testid="migration-steps">
								{state.plan.migration.steps.map((s) => (
									<li
										key={s.stage}
										data-stage={s.stage}
										className="rounded-lg bg-muted p-3"
									>
										<p className="text-xs font-semibold tracking-wide text-foreground uppercase">
											{s.stage}
										</p>
										<pre className="mt-1 overflow-auto font-mono text-xs text-muted-foreground">
											{s.sql}
										</pre>
										<p className="mt-1 text-xs text-muted-foreground">
											{s.note}
										</p>
									</li>
								))}
							</ol>
						</section>
					)}
				</div>
			)}
		</div>
	);
}

/** A preview control button — submits the form with its `intent` (launch | teardown | emitted). */
function PreviewButton({
	label,
	intent,
	testid,
	variant = "primary",
}: {
	label: string;
	intent: "launch" | "teardown" | "emitted";
	testid: string;
	variant?: "primary" | "secondary" | "destructive";
}) {
	const t = useTranslations("deploy");
	const { pending } = useFormStatus();
	const cls =
		variant === "destructive"
			? "border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
			: variant === "secondary"
				? "border border-border bg-background text-foreground hover:bg-muted"
				: "bg-primary text-primary-foreground hover:bg-primary/90";
	return (
		<button
			type="submit"
			name="intent"
			value={intent}
			data-testid={testid}
			disabled={pending}
			className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 ${cls}`}
		>
			{pending ? t("working") : label}
		</button>
	);
}

/**
 * PreviewSection — the DP25 « Preview éphémère » tab (EPIC F — extends S94). A DP11 profile
 * selector, a « Lancer le preview » button (shows the preview URL keyed on the content-addressed
 * phase + the app-hash + the hash-matches=ok indicator, the CAPITAL invariant), an EMITTED button
 * (declares the linked operation via the web-preview sidecar) and a deterministic « Démonter »
 * button. The source is the PURE twin of the extended PreviewPlan (lib/preview-bootstrap).
 */
function PreviewSection({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("deploy");
	const [state, action] = useActionState<PreviewView, FormData>(
		previewAction,
		PREVIEW_INITIAL,
	);

	return (
		<div className="space-y-6" data-testid="preview-section">
			<form
				action={action}
				className="space-y-5 rounded-xl border border-border p-5"
			>
				<div className="space-y-2">
					<label
						htmlFor="preview-project"
						className="text-sm font-medium text-foreground"
					>
						{t("projectLabel")}
					</label>
					<input
						id="preview-project"
						name="project"
						defaultValue={activeProjectId ?? "shop"}
						data-testid="preview-project-input"
						className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div className="space-y-2">
					<label
						htmlFor="preview-phase"
						className="text-sm font-medium text-foreground"
					>
						{t("phaseLabel")}
					</label>
					<input
						id="preview-phase"
						name="phaseHash"
						defaultValue="phase-0123456789abcdef"
						data-testid="preview-phase-input"
						className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div className="space-y-2">
					<label
						htmlFor="preview-profile"
						className="text-sm font-medium text-foreground"
					>
						{t("profileLabel")}
					</label>
					<select
						id="preview-profile"
						name="profile"
						defaultValue="core"
						data-testid="preview-profile-select"
						className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{PREVIEW_PROFILES.map((p) => (
							<option key={p} value={p}>
								{p}
							</option>
						))}
					</select>
					<p className="text-xs text-muted-foreground">{t("profileHint")}</p>
				</div>
				<div className="flex flex-wrap gap-3">
					<PreviewButton
						label={t("launchLabel")}
						intent="launch"
						testid="preview-launch"
					/>
					{state.ok && state.plan && (
						<>
							<PreviewButton
								label={t("emittedLabel")}
								intent="emitted"
								testid="preview-emitted-button"
								variant="secondary"
							/>
							<PreviewButton
								label={t("teardownActionLabel")}
								intent="teardown"
								testid="preview-teardown"
								variant="destructive"
							/>
						</>
					)}
				</div>
			</form>

			{state.blockExplanation && !state.ok && (
				<section
					data-testid="preview-block-reason"
					data-code={state.blockCode}
					className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-5"
				>
					<h2 className="text-sm font-semibold text-destructive">
						{t("blockedHeading")} · {state.blockCode}
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{state.blockExplanation}
					</p>
				</section>
			)}

			{state.ok && state.plan && (
				<div className="space-y-6" data-testid="preview-result">
					{/* The preview plan — URL keyed on the content-addressed phase, app-hash, profile. */}
					<section className="space-y-3 rounded-xl border border-border p-5">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<h2 className="text-sm font-semibold text-foreground">
								{t("previewPlanHeading")}
							</h2>
							<a
								href={state.plan.url}
								data-testid="preview-url"
								className="font-mono text-xs text-blue-600 underline"
							>
								{state.plan.url}
							</a>
						</div>
						<dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
							<div>
								<dt className="text-muted-foreground">{t("appHashLabel")}</dt>
								<dd
									data-testid="preview-app-hash"
									className="font-mono text-foreground"
								>
									{state.plan.emittedAppHash}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{t("profileLabel")}</dt>
								<dd
									data-testid="preview-active-profile"
									className="font-mono text-foreground"
								>
									{state.plan.profile}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{t("stackLabel")}</dt>
								<dd
									data-testid="preview-stack"
									className="font-mono text-foreground"
								>
									{state.plan.stackName}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{t("planIdLabel")}</dt>
								<dd
									data-testid="preview-plan-id"
									className="font-mono text-foreground"
								>
									{state.plan.id}
								</dd>
							</div>
						</dl>
						{/* The CAPITAL INVARIANT — preview app-hash EQUALS the phase's emitted hash. */}
						<p
							data-testid="preview-hash-matches"
							data-ok={state.hashMatches ? "true" : "false"}
							className={
								state.hashMatches
									? "font-mono text-xs text-emerald-600"
									: "font-mono text-xs text-destructive"
							}
						>
							{state.hashMatches ? t("hashMatchOk") : t("hashMatchFail")}
						</p>
					</section>

					{/* The DP11-filtered DP12 bootstrap — the services the profile amorces. */}
					{state.plan.bootstrap && (
						<section className="space-y-2 rounded-xl border border-border p-5">
							<h2 className="text-sm font-semibold text-foreground">
								{t("bootstrapHeading")}
							</h2>
							<ul
								className="flex flex-wrap gap-2"
								data-testid="preview-bootstrap-services"
							>
								{state.plan.bootstrap.services.map((svc) => (
									<li
										key={svc}
										className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono text-xs text-foreground"
									>
										{svc}
									</li>
								))}
							</ul>
							<p className="font-mono text-xs text-muted-foreground">
								{t("sequenceHashLabel")}: {state.plan.bootstrap.sequenceHash}
							</p>
						</section>
					)}

					{/* The EMITTED button result — the linked operation it declares (web-preview sidecar). */}
					{state.emittedRun && (
						<section
							data-testid="preview-emitted-result"
							className="space-y-1 rounded-xl border border-emerald-500/40 bg-emerald-50/40 p-5"
						>
							<h2 className="text-sm font-semibold text-foreground">
								{t("emittedHeading")}
							</h2>
							<p
								data-testid="preview-emitted-op"
								className="font-mono text-xs text-emerald-700"
							>
								{t("emittedDeclared")}: {state.emittedOp}
							</p>
						</section>
					)}

					{/* The deterministic demount — services unwind in REVERSE boot order. */}
					{state.teardownDone && (
						<section
							data-testid="preview-teardown-result"
							className="space-y-2 rounded-xl border border-border p-5"
						>
							<h2 className="text-sm font-semibold text-foreground">
								{t("teardownHeading")}
							</h2>
							<ol
								className="flex flex-wrap gap-2"
								data-testid="preview-teardown-services"
							>
								{(state.teardownServices ?? []).map((svc, i) => (
									<li
										key={svc}
										data-order={i}
										className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono text-xs text-foreground"
									>
										{svc}
									</li>
								))}
							</ol>
							<p className="text-xs text-muted-foreground">
								{t("teardownNote")}
							</p>
						</section>
					)}
				</div>
			)}
		</div>
	);
}

/** An env-section control button — submits the form with its `intent`. */
function EnvButton({
	label,
	intent,
	testid,
	enabled = true,
	variant = "primary",
}: {
	label: string;
	intent:
		| "validate"
		| "refuse"
		| "promote-staging"
		| "promote-prod"
		| "rollback";
	testid: string;
	enabled?: boolean;
	variant?: "primary" | "secondary" | "destructive";
}) {
	const t = useTranslations("deploy");
	const { pending } = useFormStatus();
	const cls =
		variant === "destructive"
			? "border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
			: variant === "secondary"
				? "border border-border bg-background text-foreground hover:bg-muted"
				: "bg-primary text-primary-foreground hover:bg-primary/90";
	return (
		<button
			type="submit"
			name="intent"
			value={intent}
			data-testid={testid}
			disabled={pending || !enabled}
			className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 ${cls}`}
		>
			{pending ? t("working") : label}
		</button>
	);
}

/**
 * EnvSection — the DP28 « Promotion d'environnement + porte humaine + rollback » tab (EPIC F —
 * EXTENDS S98 envrollback, never duplicates).
 *
 * THE HUMAN-VALIDATION GATE (the heart of DP28). The human SEES the live dev/preview deployment of
 * an EXACT phase (DP25 — the real app has a URL, data-testid=dev-deploy-url) and VALIDATES
 * (data-testid=dev-validate) or REFUSES (data-testid=dev-refuse) it — the validation_humaine.
 * APRÈS une validation validated=true de CETTE phase, « Promouvoir vers staging »
 * (data-testid=promote-staging) est permise → data-testid=staging-promoted ; SANS validation (ou un
 * refus) la promotion staging est REFUSÉE DEV_NOT_HUMAN_VALIDATED (data-testid=promote-blockreason).
 * La validation est PAR PHASE : « Redéployer le dev (nouvelle phase) » change la phase dev courante
 * et redemande une validation. La PROMOTION (env-ladder) et le ROLLBACK (re-projeter une phase
 * antérieure → l'app re-émise de N-1, hash = N-1) sont exécutables depuis l'écran.
 *
 * The source is the PURE twin (lib/env-rollback, the verdict-for-verdict twin of Go envrollback).
 * THE WALL (§2/§9): la validation_humaine + le rollback sont des décisions HITL RUNTIME below-the-
 * line (provenancées, append-only), JAMAIS authority.Decide / une écriture-vers-le-kernel.
 */
function EnvSection({ activeProjectId }: { activeProjectId: string | null }) {
	const t = useTranslations("deploy");
	const [state, action] = useActionState<EnvView, FormData>(
		envAction,
		ENV_INITIAL,
	);
	// The CURRENT dev phase the screen operates on. « Redéployer le dev » bumps it → a NEW phase that
	// REQUIRES a fresh validation (per-phase law). Local state so the screen reflects re-deploys.
	const [devPhase, setDevPhase] = useState("phase-dev-current");

	// The validation_humaine for the CURRENT dev phase — only counts if it MATCHES the current phase
	// (per-phase fail-closed). A validation of a previous dev phase does NOT unlock the current one.
	const validation = state.devValidation ?? null;
	const validatedForCurrent =
		validation != null &&
		validation.phaseHash === devPhase &&
		validation.validated === true;
	const refusedForCurrent =
		validation != null &&
		validation.phaseHash === devPhase &&
		validation.validated === false;

	// The validation we thread back on a promote (the gate compares its phaseHash to the promoted
	// phase). Empty when no validation for the current phase → the staging promote is fail-closed.
	const carriedJson =
		validation != null && validation.phaseHash === devPhase
			? JSON.stringify(validation)
			: "";

	const project = activeProjectId ?? "shop";

	return (
		<div className="space-y-6" data-testid="env-section">
			{/* THE HUMAN-VALIDATION GATE (the heart of DP28). */}
			<section
				data-testid="human-validation-gate"
				data-validated={validatedForCurrent ? "true" : "false"}
				data-phase={devPhase}
				className="space-y-4 rounded-xl border border-border p-5"
			>
				<h2 className="text-sm font-semibold text-foreground">
					{t("humanGateHeading")}
				</h2>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{t("humanGateIntro")}
				</p>

				{/* The live dev/preview deployment the human SEES (DP25 — the real app has a URL). */}
				<div className="space-y-1">
					<p className="text-xs font-medium text-foreground">
						{t("devDeployHeading")}
					</p>
					<a
						href={liveUrl("preview", devPhase)}
						data-testid="dev-deploy-url"
						className="font-mono text-xs text-blue-600 underline"
					>
						{liveUrl("preview", devPhase)}
					</a>
					<p className="font-mono text-xs text-muted-foreground">
						{t("phaseLabel")}:{" "}
						<span data-testid="dev-current-phase">{devPhase}</span>
					</p>
				</div>

				{/* Valider / Refuser the dev deployment → the validation_humaine. */}
				<form action={action} className="flex flex-wrap items-center gap-3">
					<input type="hidden" name="project" value={project} />
					<input type="hidden" name="devPhase" value={devPhase} />
					<EnvButton
						label={t("devValidateLabel")}
						intent="validate"
						testid="dev-validate"
					/>
					<EnvButton
						label={t("devRefuseLabel")}
						intent="refuse"
						testid="dev-refuse"
						variant="destructive"
					/>
				</form>

				{/* The recorded validation_humaine verdict for the current phase. */}
				{validatedForCurrent && (
					<p
						data-testid="dev-validated-badge"
						className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
					>
						{t("devValidatedBadge")} · {validation?.by}
					</p>
				)}
				{refusedForCurrent && (
					<p
						data-testid="dev-refused-badge"
						className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive"
					>
						{t("devRefusedBadge")}
					</p>
				)}

				{/* « Redéployer le dev » — a NEW dev phase REQUIRES a fresh validation (per-phase law). */}
				<button
					type="button"
					data-testid="dev-redeploy"
					onClick={() => setDevPhase(`phase-dev-${Date.now().toString(36)}`)}
					className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
				>
					{t("devRedeployLabel")}
				</button>
			</section>

			{/* THE ENV LADDER (preview/dev → staging → prod). */}
			<section className="space-y-3 rounded-xl border border-border p-5">
				<h2 className="text-sm font-semibold text-foreground">
					{t("ladderHeading")}
				</h2>
				<ol
					className="flex flex-wrap items-center gap-2"
					data-testid="env-ladder"
				>
					{(["preview", "staging", "prod"] as const).map((env) => (
						<li
							key={env}
							data-testid="env-rung"
							data-env={env}
							data-current={state.env === env ? "true" : "false"}
							className={
								state.env === env
									? "inline-flex items-center rounded-full bg-primary px-3 py-1 font-mono text-xs font-semibold text-primary-foreground"
									: "inline-flex items-center rounded-full bg-muted px-3 py-1 font-mono text-xs text-foreground"
							}
						>
							{env}
						</li>
					))}
				</ol>
			</section>

			{/* PROMOTE — preview/dev → staging (gated) ; → prod (ungated). */}
			<form
				action={action}
				className="space-y-4 rounded-xl border border-border p-5"
			>
				<input type="hidden" name="project" value={project} />
				<input type="hidden" name="devPhase" value={devPhase} />
				{/* The validation_humaine threaded back — the gate compares its phase to the promoted one. */}
				<input type="hidden" name="devValidationJson" value={carriedJson} />
				<h2 className="text-sm font-semibold text-foreground">
					{t("promoteHeading")}
				</h2>
				<div className="flex flex-wrap gap-3">
					{/* « Promouvoir vers staging » — fail-closed without a validation, but always submittable
					    (the screen surfaces the DEV_NOT_HUMAN_VALIDATED refusal — ui-completeness). */}
					<EnvButton
						label={t("promoteStagingLabel")}
						intent="promote-staging"
						testid="promote-staging"
					/>
					<EnvButton
						label={t("promoteProdLabel")}
						intent="promote-prod"
						testid="promote-prod"
						variant="secondary"
					/>
				</div>
				{validatedForCurrent && (
					<p
						className="text-xs text-emerald-700"
						data-testid="promote-unlocked"
					>
						{t("promoteUnlocked")}
					</p>
				)}
			</form>

			{/* The promotion result — staging now serves the RE-EMITTED app of the validated phase. */}
			{state.ok && state.promotion && (
				<section
					data-testid={
						state.promotion.env === "staging"
							? "staging-promoted"
							: "prod-promoted"
					}
					className="space-y-2 rounded-xl border border-emerald-500/40 bg-emerald-50/40 p-5"
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h2 className="text-sm font-semibold text-foreground">
							{t("promotedHeading")} · {state.promotion.env}
						</h2>
						<a
							href={state.promotion.liveUrl}
							data-testid="promoted-url"
							className="font-mono text-xs text-blue-600 underline"
						>
							{state.promotion.liveUrl}
						</a>
					</div>
					<p
						data-testid="promoted-app-hash"
						className="font-mono text-xs text-emerald-700"
					>
						{t("appHashLabel")}: {state.promotion.emittedAppHash}
					</p>
				</section>
			)}

			{/* The DEV_NOT_HUMAN_VALIDATED / ENV_PROMOTE_NOT_STABLE / ROLLBACK_NOT_EARLIER refusal. */}
			{state.blockExplanation && !state.ok && (
				<section
					data-testid="promote-blockreason"
					data-code={state.blockCode}
					className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-5"
				>
					<h2 className="text-sm font-semibold text-destructive">
						{t("blockedHeading")} · {state.blockCode}
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{state.blockExplanation}
					</p>
				</section>
			)}

			{/* ROLLBACK — re-project an EARLIER stable phase (N-1). */}
			<form
				action={action}
				className="space-y-4 rounded-xl border border-border p-5"
			>
				<input type="hidden" name="project" value={project} />
				<input type="hidden" name="devPhase" value={devPhase} />
				<h2 className="text-sm font-semibold text-foreground">
					{t("rollbackHeading")}
				</h2>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{t("rollbackIntro")}
				</p>
				<EnvButton
					label={t("rollbackLaunchLabel")}
					intent="rollback"
					testid="rollback-launch"
					variant="destructive"
				/>
			</form>

			{/* The rollback result — prod serves the RE-EMITTED app of N-1 (hash = N-1). */}
			{state.ok && state.rollback && (
				<section
					data-testid="rollback-done"
					className="space-y-2 rounded-xl border border-border p-5"
				>
					<h2 className="text-sm font-semibold text-foreground">
						{t("rollbackDoneHeading")}
					</h2>
					<dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
						<div>
							<dt className="text-muted-foreground">
								{t("rollbackFromLabel")}
							</dt>
							<dd
								data-testid="rollback-from-phase"
								className="font-mono text-foreground"
							>
								{state.rollback.fromPhaseHash}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{t("rollbackToLabel")}</dt>
							<dd
								data-testid="rollback-to-phase"
								className="font-mono text-foreground"
							>
								{state.rollback.toPhaseHash}
							</dd>
						</div>
					</dl>
					{/* The app the env serves AFTER rollback = the RE-EMISSION of N-1 (hash égal). */}
					<p
						data-testid="rollback-app-hash"
						data-phase={state.rollback.toPhaseHash}
						className="font-mono text-xs text-emerald-700"
					>
						{t("rollbackAppHashLabel")}: {state.rollback.reProjectedAppHash}
					</p>
					<p className="font-mono text-xs text-muted-foreground">
						{t("provenanceLabel")}: {state.rollback.provenance.actor} ·{" "}
						{state.rollback.provenance.reason}
					</p>
				</section>
			)}
		</div>
	);
}

/** The « Lier » control — submits the domain-cabling form. */
function BindDomain({ label }: { label: string }) {
	const t = useTranslations("deploy");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="domain-bind"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

/**
 * DomainSection — the DP27 « Domaine custom + TLS » tab (EPIC F — EXTENDS S97 domainbind, never
 * duplicates). A domain field + an environment selector + a « Lier » button cable a custom domain
 * into a DP06 environment: on success the HTTPS URL (TLS via the ACME certresolver), the TLS
 * status (data-resolver=letsencrypt), and the EMITTED DP03-canonical Traefik labels are shown —
 * proving the domain SERVES the app over HTTPS. A domain owned by ANOTHER project is refused
 * DOMAIN_ALREADY_BOUND naming the owner: the binding domain→project is INJECTIVE. The source is
 * the PURE twin of the cabling (lib/env-domainbind, the twin of Go ResolveInEnvironment) — calques
 * the DP25/26 twins. THE WALL (§2): resolving writes NO truth; the domain IN the Environment moves
 * through propose → ChangeSet → approval (Go ProposeEnvironmentDomain).
 */
function DomainSection({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("deploy");
	const [state, action] = useActionState<DomainView, FormData>(
		domainAction,
		DOMAIN_INITIAL,
	);

	return (
		<div className="space-y-6" data-testid="domain-section">
			<form
				action={action}
				className="space-y-5 rounded-xl border border-border p-5"
			>
				<h2 className="text-sm font-semibold text-foreground">
					{t("domainHeading")}
				</h2>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{t("domainIntro")}
				</p>
				<div className="space-y-2">
					<label
						htmlFor="domain-project"
						className="text-sm font-medium text-foreground"
					>
						{t("projectLabel")}
					</label>
					<input
						id="domain-project"
						name="project"
						defaultValue={activeProjectId ?? "shop"}
						data-testid="domain-project-input"
						className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div className="space-y-2">
					<label
						htmlFor="domain-input"
						className="text-sm font-medium text-foreground"
					>
						{t("domainLabel")}
					</label>
					<input
						id="domain-input"
						name="domain"
						defaultValue="shop.acme.com"
						placeholder="shop.acme.com"
						data-testid="domain-input"
						className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div className="space-y-2">
					<label
						htmlFor="domain-environment"
						className="text-sm font-medium text-foreground"
					>
						{t("environmentLabel")}
					</label>
					<select
						id="domain-environment"
						name="environment"
						defaultValue="prod"
						data-testid="domain-environment-select"
						className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{DOMAIN_ENVIRONMENTS.map((e) => (
							<option key={e} value={e}>
								{e}
							</option>
						))}
					</select>
					<p className="text-xs text-muted-foreground">
						{t("environmentHint")}
					</p>
				</div>
				<BindDomain label={t("bindLabel")} />
			</form>

			{state.blockExplanation && !state.ok && (
				<section
					data-testid="domain-blockreason"
					data-code={state.blockCode}
					data-owner={state.blockOwner}
					className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-5"
				>
					<h2 className="text-sm font-semibold text-destructive">
						{t("blockedHeading")} · {state.blockCode}
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{state.blockExplanation}
					</p>
				</section>
			)}

			{state.ok && state.binding && (
				<div className="space-y-6" data-testid="domain-result">
					{/* The resolved cabling — the HTTPS URL + the TLS status (ACME certresolver). */}
					<section className="space-y-3 rounded-xl border border-border p-5">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<h2 className="text-sm font-semibold text-foreground">
								{t("domainResolvedHeading")}
							</h2>
							<a
								href={state.binding.url}
								data-testid="domain-https-url"
								className="font-mono text-xs text-blue-600 underline"
							>
								{state.binding.url}
							</a>
						</div>
						<dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
							<div>
								<dt className="text-muted-foreground">
									{t("environmentLabel")}
								</dt>
								<dd
									data-testid="domain-environment-value"
									className="font-mono text-foreground"
								>
									{state.binding.environment}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{t("routerLabel")}</dt>
								<dd
									data-testid="domain-router"
									className="font-mono text-foreground"
								>
									{state.binding.routerName}
								</dd>
							</div>
						</dl>
						{/* The TLS status — the ACME certresolver that mints the domain's certificate. */}
						<p
							data-testid="domain-tls-status"
							data-resolver={state.binding.certResolver}
							data-tls={state.servesHTTPS ? "true" : "false"}
							className={
								state.servesHTTPS
									? "font-mono text-xs text-emerald-600"
									: "font-mono text-xs text-destructive"
							}
						>
							{state.servesHTTPS ? t("tlsOk") : t("tlsFail")} ·{" "}
							{state.binding.certResolver}
						</p>
					</section>

					{/* The EMITTED DP03-canonical Traefik labels (one source, never a 2nd divergent jeu). */}
					<section className="space-y-3 rounded-xl border border-border p-5">
						<h2 className="text-sm font-semibold text-foreground">
							{t("labelsHeading")}
						</h2>
						<ul className="space-y-1" data-testid="domain-traefik-labels">
							{(state.labels ?? []).map((l) => (
								<li
									key={l.label}
									data-testid="domain-traefik-label"
									data-label={l.label}
									className="flex flex-col gap-0.5 rounded-lg bg-muted p-2 font-mono text-xs sm:flex-row sm:items-center sm:gap-2"
								>
									<span className="text-foreground">{l.label}</span>
									<span className="text-muted-foreground">= {l.value}</span>
								</li>
							))}
						</ul>
					</section>
				</div>
			)}
		</div>
	);
}

/** A Pulumi-section control button — submits the form with its `intent`. */
function PulumiButton({
	label,
	intent,
	testid,
	variant = "primary",
}: {
	label: string;
	intent: "emit" | "up" | "down";
	testid: string;
	variant?: "primary" | "secondary" | "destructive";
}) {
	const t = useTranslations("deploy");
	const { pending } = useFormStatus();
	const cls =
		variant === "destructive"
			? "border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
			: variant === "secondary"
				? "border border-border bg-background text-foreground hover:bg-muted"
				: "bg-primary text-primary-foreground hover:bg-primary/90";
	return (
		<button
			type="submit"
			name="intent"
			value={intent}
			data-testid={testid}
			disabled={pending}
			className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 ${cls}`}
		>
			{pending ? t("working") : label}
		</button>
	);
}

/**
 * DeployTargetSection — the DP33 « Cible de déploiement » selector (clôture EPIC G + la piste DP) :
 * PORTABILITÉ FUTURE-CLOUD. Le MÊME StackManifest se projette vers self-hosted (@pulumi/docker) OU
 * future-cloud (cloud managé) SANS réécrire la déclaration : « une source → N projections ».
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : un toggle self-hosted / future-cloud recalcule
 * la PROJECTION depuis la MÊME source (target-program montre le programme émis recalculé). Un
 * indicateur prouve que la SOURCE (le StackManifest, son sourceHash) est INCHANGÉE entre les cibles
 * (source-invariant data-ok=true). En future-cloud, les services managés affichent leur managed_url
 * (managed-service data-url=${<NAME>_MANAGED_URL}, DP07).
 *
 * Source = le twin PUR de l'émetteur cible (lib/pulumi-target.emitPulumiStackTarget, le twin de Go
 * honoemit.EmitPulumiStackTarget) — il calque le twin Pulumi existant. THE WALL (§2/§6/§8) :
 * recalculer une projection n'écrit AUCUNE vérité (below-the-line) ; la projection est une fonction
 * PURE, déterministe, byte-stable, jamais un LLM. Thème ADR 0010, bilingue ADR 0011.
 */
function DeployTargetSection({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("deploy");
	const [state, action] = useActionState<TargetView, FormData>(
		targetAction,
		TARGET_INITIAL,
	);
	const project = activeProjectId ?? "shop";
	// The active target the operator toggled; toggling re-runs the PURE projection from the SAME source.
	const [target, setTarget] = useState<"self_hosted" | "future_cloud">(
		"self_hosted",
	);
	const [loaded, setLoaded] = useState(false);

	// Recalculate the projection whenever the target changes (and on first mount). The source is
	// NEVER re-declared — only the target dimension moves; the PURE twin re-projects the same manifest.
	useEffect(() => {
		if (!loaded) setLoaded(true);
		const fd = new FormData();
		fd.set("project", project);
		fd.set("target", target);
		action(fd);
	}, [target, project, action, loaded]);

	return (
		<section
			data-testid="deploy-target"
			data-target={target}
			className="space-y-4 rounded-xl border border-border p-5"
		>
			<div className="space-y-1">
				<h2 className="text-sm font-semibold text-foreground">
					{t("targetHeading")}
				</h2>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{t("targetIntro")}
				</p>
			</div>

			{/* The closed target toggle — self-hosted (@pulumi/docker) vs future_cloud (managed). */}
			<div
				className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/40 p-1"
				role="tablist"
			>
				{DEPLOY_TARGETS.map((dt) => (
					<button
						key={dt.target}
						type="button"
						role="tab"
						data-testid="target-toggle"
						data-target={dt.testid}
						aria-selected={target === dt.target}
						onClick={() => setTarget(dt.target)}
						className={
							target === dt.target
								? "flex-1 rounded-md bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm"
								: "flex-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
						}
					>
						{dt.target === "self_hosted"
							? t("targetSelfHostedLabel")
							: t("targetFutureCloudLabel")}
					</button>
				))}
			</div>

			{state.blockExplanation && !state.ok && (
				<div
					data-testid="target-block-reason"
					data-code={state.blockCode}
					className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
				>
					<p className="text-sm font-semibold text-destructive">
						{t("blockedHeading")} · {state.blockCode}
					</p>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{state.blockExplanation}
					</p>
				</div>
			)}

			{state.ok && (
				<div className="space-y-4" data-testid="target-result">
					{/* The SOURCE-INVARIANT indicator — the same source content address across targets. */}
					<div className="grid gap-2 text-xs sm:grid-cols-2">
						<div>
							<p className="text-muted-foreground">
								{t("targetProviderLabel")}
							</p>
							<p
								data-testid="target-provider"
								className="font-mono text-foreground"
							>
								{state.provider}
							</p>
						</div>
						<div>
							<p className="text-muted-foreground">{t("sourceHashLabel")}</p>
							<p
								data-testid="target-source-hash"
								className="truncate font-mono text-foreground"
							>
								{state.sourceHash}
							</p>
						</div>
					</div>
					<p
						data-testid="source-invariant"
						data-ok={state.sourceInvariant ? "true" : "false"}
						data-source-hash={state.sourceHash}
						className={
							state.sourceInvariant
								? "rounded-lg border border-emerald-500/40 bg-emerald-50/40 p-3 text-xs text-emerald-700"
								: "rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
						}
					>
						{state.sourceInvariant
							? t("sourceInvariantOk")
							: t("sourceInvariantFail")}
					</p>

					{/* The MANAGED services (future_cloud only) → managed_url (DP07). */}
					{(state.managed?.length ?? 0) > 0 && (
						<div className="space-y-2 rounded-lg border border-border p-4">
							<p className="text-xs font-medium text-foreground">
								{t("managedHeading")}
							</p>
							<ul className="space-y-1" data-testid="managed-services">
								{(state.managed ?? []).map((mr) => (
									<li
										key={mr.service}
										data-testid="managed-service"
										data-service={mr.service}
										data-role={mr.role}
										data-mode={mr.mode}
										data-url={mr.url}
										className="flex flex-col gap-0.5 rounded-lg bg-muted p-2 font-mono text-xs sm:flex-row sm:items-center sm:gap-2"
									>
										<span className="text-foreground">{mr.service}</span>
										<span className="text-muted-foreground">
											{mr.role} · {mr.mode} · {mr.url}
										</span>
									</li>
								))}
							</ul>
						</div>
					)}

					{/* The recalculated PROJECTION — the emitted program, re-projected from the SAME source. */}
					<div className="space-y-2 rounded-lg border border-border p-4">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<p className="text-xs font-medium text-foreground">
								{t("targetProgramHeading")}
							</p>
							<span
								data-testid="target-output-hash"
								className="font-mono text-xs text-muted-foreground"
							>
								{t("outputHashLabel")}: {state.outputHash?.slice(0, 16)}
							</span>
						</div>
						<pre
							data-testid="target-program"
							data-target={state.target}
							className="max-h-80 overflow-auto rounded-lg border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed text-foreground"
						>
							{state.program}
						</pre>
					</div>
				</div>
			)}
		</section>
	);
}

/**
 * PulumiSection — the « Déployer ce projet (Pulumi) » tab (intention utilisatrice 2026-06-13 :
 * « du Pulumi qui fait les docker par projet »). It makes the /deploy route REALLY deploy a
 * per-project×env Pulumi stack (one stack per project×env, deployed FOR REAL by @pulumi/docker).
 *
 * Action-capable surfaces (ui-completeness, CLAUDE.md §7):
 *  - « Voir le programme émis » (pulumi-emit) — reads the PURE emitter (Go honoemit.EmitPulumiStack
 *    via `aidospulumi emit`): the program text, the URL, the containers — a byte-stable projection,
 *    NO truth written. Shown for review (pulumi-program-preview).
 *  - « Déployer ce projet (Pulumi) » (pulumi-deploy) — the GATED SIDE-EFFECT (exactly like
 *    deployStack runs `docker compose up -d`): execs `aidospulumi up`, drives a real `pulumi up`.
 *    Shows the live URL (pulumi-url) + the created containers (pulumi-container).
 *  - « Démonter » (pulumi-down) — `aidospulumi down` (`pulumi destroy`).
 *
 * La porte de validation humaine DP28 reste EN AMONT du staging (onglet Environnements) ; ce geste
 * cible un env NON-PROD (dev) par défaut. DETERMINISM-FIRST : l'émetteur est PUR, byte-stable ;
 * l'exécuteur ne juge rien, il exécute le programme émis (le mur §2/§6/§8).
 */
function PulumiSection({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("deploy");
	const [state, action] = useActionState<PulumiView, FormData>(
		pulumiAction,
		PULUMI_INITIAL,
	);

	return (
		<div className="space-y-6" data-testid="pulumi-section">
			{/* DP33 — « Cible de déploiement » : la MÊME source, deux projections (self-hosted / future-cloud). */}
			<DeployTargetSection activeProjectId={activeProjectId} />

			<form
				action={action}
				className="space-y-5 rounded-xl border border-border p-5"
			>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{t("pulumiIntro")}
				</p>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<label
							htmlFor="pulumi-project"
							className="text-sm font-medium text-foreground"
						>
							{t("projectLabel")}
						</label>
						<input
							id="pulumi-project"
							name="project"
							defaultValue={activeProjectId ?? "shop"}
							data-testid="pulumi-project-input"
							className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
					<div className="space-y-2">
						<label
							htmlFor="pulumi-env"
							className="text-sm font-medium text-foreground"
						>
							{t("pulumiEnvLabel")}
						</label>
						<input
							id="pulumi-env"
							name="env"
							defaultValue="dev"
							data-testid="pulumi-env-input"
							className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
						<p className="text-xs text-muted-foreground">
							{t("pulumiEnvHint")}
						</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-3">
					<PulumiButton
						label={t("pulumiEmitLabel")}
						intent="emit"
						testid="pulumi-emit"
						variant="secondary"
					/>
					<PulumiButton
						label={t("pulumiDeployLabel")}
						intent="up"
						testid="pulumi-deploy"
					/>
					{state.ok && (state.intent === "up" || state.intent === "down") && (
						<PulumiButton
							label={t("pulumiDownLabel")}
							intent="down"
							testid="pulumi-down"
							variant="destructive"
						/>
					)}
				</div>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{t("pulumiGateNote")}
				</p>
			</form>

			{state.blockExplanation && !state.ok && (
				<section
					data-testid="pulumi-block-reason"
					data-code={state.blockCode}
					className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-5"
				>
					<h2 className="text-sm font-semibold text-destructive">
						{t("blockedHeading")} · {state.blockCode}
					</h2>
					<p className="font-mono text-xs leading-relaxed text-muted-foreground">
						{state.blockExplanation}
					</p>
				</section>
			)}

			{state.ok && (
				<div className="space-y-6" data-testid="pulumi-result">
					{/* The stack identity + the live URL + the containers (created on `up`, listed on `emit`). */}
					<section className="space-y-3 rounded-xl border border-border p-5">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<h2 className="text-sm font-semibold text-foreground">
								{t("pulumiStackHeading")}
							</h2>
							{state.url && (
								<a
									href={state.url}
									data-testid="pulumi-url"
									className="font-mono text-xs text-blue-600 underline"
								>
									{state.url}
								</a>
							)}
						</div>
						<dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
							<div>
								<dt className="text-muted-foreground">{t("stackLabel")}</dt>
								<dd
									data-testid="pulumi-stack"
									className="font-mono text-foreground"
								>
									{state.stack}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">
									{t("pulumiStatusLabel")}
								</dt>
								<dd
									data-testid="pulumi-status"
									data-status={state.status ?? state.intent}
									className="font-mono text-foreground"
								>
									{state.status === "up"
										? t("pulumiStatusUp")
										: state.status === "down"
											? t("pulumiStatusDown")
											: t("pulumiStatusEmitted")}
								</dd>
							</div>
						</dl>
						{state.detail && (
							<p
								data-testid="pulumi-detail"
								className="font-mono text-xs text-muted-foreground"
							>
								{state.detail}
							</p>
						)}
						{/* The containers the stack runs / will run (<stack>-app, <stack>-db). */}
						{(state.containers?.length ?? 0) > 0 && (
							<div className="space-y-1">
								<p className="text-xs font-medium text-foreground">
									{t("pulumiContainersHeading")}
								</p>
								<ul
									className="flex flex-wrap gap-2"
									data-testid="pulumi-containers"
								>
									{(state.containers ?? []).map((c) => (
										<li
											key={c}
											data-testid="pulumi-container"
											data-name={c}
											className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono text-xs text-foreground"
										>
											{c}
										</li>
									))}
								</ul>
							</div>
						)}
					</section>

					{/* The EMITTED Pulumi program (the index.ts) — the PURE emitter output, shown for review. */}
					{state.program && (
						<section className="space-y-2 rounded-xl border border-border p-5">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<h2 className="text-sm font-semibold text-foreground">
									{t("pulumiProgramHeading")}
								</h2>
								{state.programPath && (
									<span
										data-testid="pulumi-program-path"
										className="font-mono text-xs text-muted-foreground"
									>
										{state.programPath}
									</span>
								)}
							</div>
							<p className="text-xs leading-relaxed text-muted-foreground">
								{t("pulumiProgramNote")}
							</p>
							<pre
								data-testid="pulumi-program-preview"
								className="max-h-96 overflow-auto rounded-lg border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed text-foreground"
							>
								{state.program}
							</pre>
						</section>
					)}
				</div>
			)}
		</div>
	);
}
