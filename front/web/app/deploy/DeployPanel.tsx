"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { deployAction, previewAction } from "./actions";
import {
	DEPLOY_INITIAL,
	type DeployView,
	PREVIEW_INITIAL,
	type PreviewView,
} from "./view";

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
	const [tab, setTab] = useState<"deploy" | "preview">("deploy");

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

			{/* Tabs — DEPLOY (S96) | PREVIEW ÉPHÉMÈRE (DP25, EPIC F). */}
			<div
				className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1"
				role="tablist"
			>
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
			</div>

			{tab === "preview" ? (
				<PreviewSection activeProjectId={activeProjectId} />
			) : (
				<DeploySection state={state} action={action} />
			)}
		</div>
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

	return (
		<div className="space-y-8">
			{/* Control 1 — DEPLOY the phase deterministically. */}
			<form
				action={action}
				className="space-y-5 rounded-xl border border-border p-5"
			>
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
				<Submit label={t("deployLabel")} />
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
					<p className="text-sm leading-relaxed text-muted-foreground">
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
