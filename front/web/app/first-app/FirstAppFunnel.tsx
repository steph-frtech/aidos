"use client";

import { useActionState } from "react";
import type { FunnelState } from "@/lib/first-app-funnel";
import { runFunnelAction } from "./actions";

/**
 * FirstAppFunnel — the REAL, action-capable onboarding funnel for /first-app (S115). It
 * REPLACES the retired local simulation (the confetti `FirstAppBuilder`). The user fills a
 * real form (path · account · template · slug · first modification · grill verdict · build
 * outcome) and submits; the Server Action runs the PURE funnel (lib/first-app-funnel) and
 * returns a FunnelState whose checklist is tied to REAL artefacts (a content-addressed
 * starterId, a content-addressed ideaId, a computed red set, the non-gameable build verdict,
 * a content-addressed deploy subdomain) — never confetti.
 *
 * Two paths from ONE engine: TEMPLATE-FIRST (the default — a newcomer instantiates a green
 * S81 starter then modifies it, so the acceptance gate is already green) and BLANK-IDEA (the
 * advanced path — a free-text idea with no starter). The default is template-first.
 *
 * Client component (form interaction only); all strings arrive translated from the server
 * (next-intl, ADR 0011), design tokens only (ADR 0010). It writes NO truth — the action is a
 * dry-run value computation over the twins (the wall, §2). A truth proposed by the funnel
 * goes through propose → ChangeSet → /goal, never a write from this screen.
 */

export type FunnelLabels = {
	pathLabel: string;
	pathTemplate: string;
	pathTemplateHint: string;
	pathBlank: string;
	pathBlankHint: string;
	emailLabel: string;
	templateLabel: string;
	slugLabel: string;
	intentLabel: string;
	intentTemplateHint: string;
	intentBlankHint: string;
	verdictLabel: string;
	verdictSharp: string;
	verdictFuzzy: string;
	verdictBad: string;
	buildLabel: string;
	buildGreen: string;
	buildRed: string;
	buildLowMutation: string;
	run: string;
	reset: string;
	checklistHeading: string;
	artefactsHeading: string;
	deployedTitle: string;
	deployedBody: string;
	notDeployedTitle: string;
	notDeployedBody: string;
	stepNames: Record<string, string>;
	artefactStarter: string;
	artefactIdea: string;
	artefactRedSet: string;
	artefactBuild: string;
	artefactSubdomain: string;
	previewCta: string;
	deployCta: string;
};

export type TemplateOption = { id: string; label: string };

export function FirstAppFunnel({
	labels,
	templates,
}: {
	labels: FunnelLabels;
	templates: TemplateOption[];
}) {
	const [state, formAction] = useActionState<FunnelState | null, FormData>(
		runFunnelAction,
		null,
	);

	return (
		<section data-testid="first-app-funnel" className="space-y-6">
			<form
				action={formAction}
				data-testid="funnel-form"
				className="space-y-5 rounded-xl border border-border bg-card p-5"
			>
				{/* Path — template-first DEFAULT, blank-idea advanced */}
				<fieldset className="space-y-2">
					<legend className="text-sm font-semibold text-card-foreground">
						{labels.pathLabel}
					</legend>
					<div className="grid gap-2 sm:grid-cols-2">
						<label
							data-testid="path-template"
							className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
						>
							<input
								type="radio"
								name="path"
								value="template-first"
								defaultChecked
								className="mt-0.5"
							/>
							<span>
								<span className="font-medium text-card-foreground">
									{labels.pathTemplate}
								</span>
								<span className="mt-0.5 block text-xs text-muted-foreground">
									{labels.pathTemplateHint}
								</span>
							</span>
						</label>
						<label
							data-testid="path-blank"
							className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
						>
							<input
								type="radio"
								name="path"
								value="blank-idea"
								className="mt-0.5"
							/>
							<span>
								<span className="font-medium text-card-foreground">
									{labels.pathBlank}
								</span>
								<span className="mt-0.5 block text-xs text-muted-foreground">
									{labels.pathBlankHint}
								</span>
							</span>
						</label>
					</div>
				</fieldset>

				<div className="grid gap-4 sm:grid-cols-2">
					<label className="space-y-1 text-sm">
						<span className="font-medium text-card-foreground">
							{labels.emailLabel}
						</span>
						<input
							type="email"
							name="email"
							data-testid="funnel-email"
							defaultValue="alice@example.com"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
						/>
					</label>
					<label className="space-y-1 text-sm">
						<span className="font-medium text-card-foreground">
							{labels.slugLabel}
						</span>
						<input
							type="text"
							name="slug"
							data-testid="funnel-slug"
							defaultValue="ma-boutique"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
						/>
					</label>
					<label className="space-y-1 text-sm">
						<span className="font-medium text-card-foreground">
							{labels.templateLabel}
						</span>
						<select
							name="template"
							data-testid="funnel-template"
							defaultValue={templates[0]?.id ?? "ecommerce"}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
						>
							{templates.map((t) => (
								<option key={t.id} value={t.id}>
									{t.label}
								</option>
							))}
						</select>
					</label>
					<label className="space-y-1 text-sm">
						<span className="font-medium text-card-foreground">
							{labels.verdictLabel}
						</span>
						<select
							name="verdict"
							data-testid="funnel-verdict"
							defaultValue="sharp"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
						>
							<option value="sharp">{labels.verdictSharp}</option>
							<option value="fuzzy">{labels.verdictFuzzy}</option>
							<option value="bad">{labels.verdictBad}</option>
						</select>
					</label>
				</div>

				<label className="block space-y-1 text-sm">
					<span className="font-medium text-card-foreground">
						{labels.intentLabel}
					</span>
					<input
						type="text"
						name="intent"
						data-testid="funnel-intent"
						defaultValue="ajouter un code promo au paiement"
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
					/>
					<span className="block text-xs text-muted-foreground">
						{labels.intentTemplateHint}
					</span>
				</label>

				<label className="block space-y-1 text-sm">
					<span className="font-medium text-card-foreground">
						{labels.buildLabel}
					</span>
					<select
						name="build"
						data-testid="funnel-build"
						defaultValue="green"
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
					>
						<option value="green">{labels.buildGreen}</option>
						<option value="red">{labels.buildRed}</option>
						<option value="low-mutation">{labels.buildLowMutation}</option>
					</select>
				</label>

				<button
					type="submit"
					data-testid="funnel-run"
					className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/80"
				>
					{labels.run}
				</button>
			</form>

			{state ? <FunnelResult state={state} labels={labels} /> : null}
		</section>
	);
}

function FunnelResult({
	state,
	labels,
}: {
	state: FunnelState;
	labels: FunnelLabels;
}) {
	return (
		<div data-testid="funnel-result" className="space-y-5">
			{/* The checklist — tied to REAL artefacts (a step is done iff its artefact exists) */}
			<div className="rounded-xl border border-border bg-card p-5">
				<h3 className="text-base font-semibold text-card-foreground">
					{labels.checklistHeading}
				</h3>
				<ol className="mt-3 space-y-2">
					{state.checklist.map((row) => (
						<li
							key={row.step}
							data-testid={`checklist-${row.step}`}
							data-done={row.done ? "true" : "false"}
							className={
								row.done
									? "flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
									: "flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm opacity-60"
							}
						>
							<span
								className={
									row.done
										? "flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
										: "flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-xs text-muted-foreground"
								}
							>
								{row.done ? "✓" : "•"}
							</span>
							<span className="flex-1 font-medium text-card-foreground">
								{labels.stepNames[row.step] ?? row.step}
							</span>
							{row.artefact ? (
								<code
									data-testid={`artefact-${row.step}`}
									className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground"
								>
									{row.artefact}
								</code>
							) : null}
						</li>
					))}
				</ol>
			</div>

			{/* Terminal banner — a deployed app driven by the real engine, or an honest stop */}
			{state.deployed ? (
				<div
					data-testid="funnel-deployed"
					className="rounded-xl border border-primary/40 bg-primary/10 p-5 text-sm text-primary"
				>
					<p className="font-semibold">{labels.deployedTitle}</p>
					<p className="mt-1 leading-relaxed">{labels.deployedBody}</p>
					<div className="mt-3 flex flex-wrap items-center gap-2">
						<code
							data-testid="deploy-subdomain"
							className="rounded bg-background px-2 py-1 font-mono text-xs text-foreground"
						>
							{state.subdomain}.deploy.aidos.app
						</code>
						<a
							href="/preview"
							data-testid="funnel-preview-cta"
							className="rounded-md border border-primary/40 px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary/10"
						>
							{labels.previewCta} →
						</a>
						<a
							href="/deploy"
							data-testid="funnel-deploy-cta"
							className="rounded-md border border-primary/40 px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary/10"
						>
							{labels.deployCta} →
						</a>
					</div>
				</div>
			) : (
				<div
					data-testid="funnel-not-deployed"
					className="rounded-xl border border-border bg-muted/40 p-5 text-sm text-muted-foreground"
				>
					<p className="font-semibold text-card-foreground">
						{labels.notDeployedTitle}
					</p>
					<p className="mt-1 leading-relaxed">{labels.notDeployedBody}</p>
				</div>
			)}
		</div>
	);
}
