"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { promoteAction, rollbackAction } from "./actions";
import {
	PROMOTE_INITIAL,
	type PromoteView,
	ROLLBACK_INITIAL,
	type RollbackView,
} from "./view";

/**
 * EnvRollbackPanel makes the /env-rollback route action-capable (ui-completeness, CLAUDE.md §7):
 * the S98 environments + rollback-to-phase plane has controls bound to the REAL pure twin
 * (lib/env-rollback), reachable AND executable from the screen.
 *
 * Action-capable surfaces (the done-criteria):
 *  1. PROMOTE — bind a stable phase to an environment; a "non-stable" toggle proves the
 *     ENV_PROMOTE_NOT_STABLE refusal.
 *  2. ROLLBACK — roll the env back to an EARLIER stable phase = a re-projection of N-1; toggles
 *     prove ROLLBACK_NOT_EARLIER (same phase / non-ancestor). The result shows the re-emitted app
 *     hash of N-1, the provenance, and the re-projection property (serves fresh / rejects stale).
 *
 * DETERMINISM-FIRST (§6/§8): the twin is PURE, never an LLM. THE WALL (§2/§9): a rollback is a
 * recorded DECISION, proposed as a ChangeSet — never a direct truth-write. Themed (ADR 0010),
 * bilingual (ADR 0011).
 */

function Submit({ label, testid }: { label: string; testid: string }) {
	const t = useTranslations("envRollback");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid={testid}
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

function Block({ code, explanation }: { code?: string; explanation?: string }) {
	const t = useTranslations("envRollback");
	if (!code || !explanation) return null;
	return (
		<section
			data-testid="block-reason"
			data-code={code}
			className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-5"
		>
			<h2 className="text-sm font-semibold text-destructive">
				{t("blockedHeading")} · {code}
			</h2>
			<p className="text-sm leading-relaxed text-muted-foreground">
				{explanation}
			</p>
		</section>
	);
}

export function EnvRollbackPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("envRollback");
	const [promoteState, promote] = useActionState<PromoteView, FormData>(
		promoteAction,
		PROMOTE_INITIAL,
	);
	const [rollbackState, doRollback] = useActionState<RollbackView, FormData>(
		rollbackAction,
		ROLLBACK_INITIAL,
	);

	const project = activeProjectId ?? "shop";

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

			{/* Control 1 — PROMOTE a stable phase into an environment. */}
			<form
				action={promote}
				className="space-y-5 rounded-xl border border-border p-5"
			>
				<h2 className="text-sm font-semibold text-foreground">
					{t("promoteHeading")}
				</h2>
				<input type="hidden" name="project" value={project} />
				<div className="space-y-2">
					<label
						htmlFor="promote-domain"
						className="text-sm font-medium text-foreground"
					>
						{t("domainLabel")}
					</label>
					<input
						id="promote-domain"
						name="domainRoot"
						placeholder={t("domainPlaceholder")}
						data-testid="promote-domain"
						className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<label
							htmlFor="promote-env"
							className="text-sm font-medium text-foreground"
						>
							{t("envLabel")}
						</label>
						<select
							id="promote-env"
							name="env"
							defaultValue="prod"
							data-testid="promote-env"
							className="block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<option value="preview">preview</option>
							<option value="staging">staging</option>
							<option value="prod">prod</option>
						</select>
					</div>
					<div className="space-y-2">
						<label
							htmlFor="promote-phase"
							className="text-sm font-medium text-foreground"
						>
							{t("phaseLabel")}
						</label>
						<input
							id="promote-phase"
							name="phaseHash"
							defaultValue="phase-n"
							data-testid="promote-phase"
							className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
				</div>
				<label className="flex items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						name="red"
						data-testid="promote-red-toggle"
						className="size-4 rounded border-input"
					/>
					{t("promoteRedToggle")}
				</label>
				<Submit label={t("promoteLabel")} testid="promote-button" />
			</form>

			<Block
				code={!promoteState.ok ? promoteState.blockCode : undefined}
				explanation={
					!promoteState.ok ? promoteState.blockExplanation : undefined
				}
			/>

			{promoteState.ok && promoteState.promotion && (
				<section
					data-testid="promote-result"
					className="space-y-3 rounded-xl border border-border p-5"
				>
					<h2 className="text-sm font-semibold text-foreground">
						{t("promotedHeading")}
					</h2>
					<dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
						<div>
							<dt className="text-muted-foreground">{t("envLabel")}</dt>
							<dd
								data-testid="promote-env-out"
								className="font-mono text-foreground"
							>
								{promoteState.promotion.env}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{t("stackLabel")}</dt>
							<dd
								data-testid="promote-stack"
								className="font-mono text-foreground"
							>
								{promoteState.promotion.stackName}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{t("appHashLabel")}</dt>
							<dd
								data-testid="promote-app-hash"
								className="font-mono text-foreground"
							>
								{promoteState.promotion.emittedAppHash}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{t("idLabel")}</dt>
							<dd
								data-testid="promote-id"
								className="font-mono text-foreground"
							>
								{promoteState.promotion.id}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{t("domainLabel")}</dt>
							<dd
								data-testid="promote-domain-out"
								className="font-mono text-foreground"
							>
								{promoteState.promotion.domainRoot}
							</dd>
						</div>
						<div className="sm:col-span-2">
							<dt className="text-muted-foreground">{t("liveUrlLabel")}</dt>
							<dd>
								<a
									data-testid="promote-live-url"
									href={promoteState.promotion.liveUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="font-mono text-primary underline-offset-2 hover:underline"
								>
									{promoteState.promotion.liveUrl}
								</a>
							</dd>
						</div>
					</dl>
				</section>
			)}

			{/* Control 2 — ROLLBACK the environment to an earlier stable phase. */}
			<form
				action={doRollback}
				className="space-y-5 rounded-xl border border-border p-5"
			>
				<h2 className="text-sm font-semibold text-foreground">
					{t("rollbackHeading")}
				</h2>
				<input type="hidden" name="project" value={project} />
				<input type="hidden" name="env" value="prod" />
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<label
							htmlFor="current-phase"
							className="text-sm font-medium text-foreground"
						>
							{t("currentPhaseLabel")}
						</label>
						<input
							id="current-phase"
							name="currentHash"
							defaultValue="phase-n"
							data-testid="current-phase"
							className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
					<div className="space-y-2">
						<label
							htmlFor="target-phase"
							className="text-sm font-medium text-foreground"
						>
							{t("targetPhaseLabel")}
						</label>
						<input
							id="target-phase"
							name="targetHash"
							defaultValue="phase-n-1"
							data-testid="target-phase"
							className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
					<div className="space-y-2">
						<label
							htmlFor="actor"
							className="text-sm font-medium text-foreground"
						>
							{t("actorLabel")}
						</label>
						<input
							id="actor"
							name="actor"
							defaultValue="alice"
							data-testid="actor-input"
							className="block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
					<div className="space-y-2">
						<label
							htmlFor="reason"
							className="text-sm font-medium text-foreground"
						>
							{t("reasonLabel")}
						</label>
						<input
							id="reason"
							name="reason"
							defaultValue="incident checkout 500s"
							data-testid="reason-input"
							className="block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
				</div>
				<label className="flex items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						name="same"
						data-testid="rollback-same-toggle"
						className="size-4 rounded border-input"
					/>
					{t("rollbackSameToggle")}
				</label>
				<label className="flex items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						name="noAncestor"
						data-testid="rollback-no-ancestor-toggle"
						className="size-4 rounded border-input"
					/>
					{t("rollbackNoAncestorToggle")}
				</label>
				<Submit label={t("rollbackLabel")} testid="rollback-button" />
			</form>

			<Block
				code={!rollbackState.ok ? rollbackState.blockCode : undefined}
				explanation={
					!rollbackState.ok ? rollbackState.blockExplanation : undefined
				}
			/>

			{rollbackState.ok && rollbackState.decision && (
				<div className="space-y-6" data-testid="rollback-result">
					<section className="space-y-3 rounded-xl border border-border p-5">
						<h2 className="text-sm font-semibold text-foreground">
							{t("decisionHeading")}
						</h2>
						<dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
							<div>
								<dt className="text-muted-foreground">{t("fromLabel")}</dt>
								<dd
									data-testid="rollback-from"
									className="font-mono text-foreground"
								>
									{rollbackState.decision.fromPhaseHash}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{t("toLabel")}</dt>
								<dd
									data-testid="rollback-to"
									className="font-mono text-foreground"
								>
									{rollbackState.decision.toPhaseHash}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">
									{t("reProjectedLabel")}
								</dt>
								<dd
									data-testid="rollback-app-hash"
									className="font-mono text-foreground"
								>
									{rollbackState.decision.reProjectedAppHash}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{t("stackLabel")}</dt>
								<dd
									data-testid="rollback-stack"
									className="font-mono text-foreground"
								>
									{rollbackState.decision.stackName}
								</dd>
							</div>
							<div className="sm:col-span-2">
								<dt className="text-muted-foreground">
									{t("provenanceLabel")}
								</dt>
								<dd
									data-testid="rollback-provenance"
									className="font-mono text-foreground"
								>
									{rollbackState.decision.provenance.actor} ·{" "}
									{rollbackState.decision.provenance.reason}
								</dd>
							</div>
						</dl>
					</section>

					<section className="space-y-2 rounded-xl border border-border p-5">
						<h2 className="text-sm font-semibold text-foreground">
							{t("reProjectionHeading")}
						</h2>
						<p
							data-testid="serves-fresh"
							data-ok={rollbackState.servesFresh ? "true" : "false"}
							className={
								rollbackState.servesFresh
									? "font-mono text-xs text-emerald-600"
									: "font-mono text-xs text-destructive"
							}
						>
							{rollbackState.servesFresh ? "✓ " : "✗ "}
							{t("servesFresh")}
						</p>
						<p
							data-testid="rejects-stale"
							data-ok={rollbackState.rejectsStale ? "true" : "false"}
							className={
								rollbackState.rejectsStale
									? "font-mono text-xs text-emerald-600"
									: "font-mono text-xs text-destructive"
							}
						>
							{rollbackState.rejectsStale ? "✓ " : "✗ "}
							{t("rejectsStale")}
						</p>
					</section>
				</div>
			)}
		</div>
	);
}
