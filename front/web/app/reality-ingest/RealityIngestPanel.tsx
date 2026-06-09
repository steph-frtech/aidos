"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ingestAction } from "./actions";
import { REALITY_INGEST_INITIAL } from "./view";

/**
 * RealityIngestPanel makes the /reality-ingest route action-capable (ui-completeness law, CLAUDE.md
 * §7): S106 has ONE control bound to the REAL ingestion pipeline, with a toggle that drives the
 * done-criterion from the screen —
 *
 *   - INGEST THE DIVERGENCE over the canonical out-of-stock telemetry (createOrder fails 30%): a
 *     project-scoped RealityMirror (provenance=incident) → a DRAFT idea whose Intent is the
 *     DETERMINISTIC TEMPLATE text (names the mirror, operation, observed vs expected, traffic).
 *   - HEALTHY TOGGLE: feed a within-promise report → NO divergence, NO idea invented (reality
 *     never declares a truth from a healthy app).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/reality-ingest, never an
 * LLM — same input → identical draft. THE WALL (§2): reality WRITES NOTHING — the draft is a value
 * (wroteKernel=false; the direct Reality→Kernel edge is always refused). Themed on ADR 0010 tokens;
 * strings via next-intl (0011).
 */

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("realityIngest");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid={testId}
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

export function RealityIngestPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("realityIngest");
	const [view, dispatch] = useActionState(ingestAction, REALITY_INGEST_INITIAL);
	const draft = view.draft;

	return (
		<div className="space-y-10">
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

			{/* ── The ingestion control: ingest + healthy toggle ── */}
			<section className="space-y-4 rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("ingestHeading")}
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("ingestBody")}
				</p>
				<form action={dispatch} className="space-y-4">
					<label className="flex items-center gap-2 text-sm text-foreground">
						<input
							type="checkbox"
							name="healthy"
							data-testid="healthy-toggle"
							className="h-4 w-4 rounded border-border"
						/>
						{t("healthyLabel")}
					</label>
					<Submit label={t("ingest")} testId="ingest-divergence" />
				</form>

				{view.error ? (
					<p data-testid="ingest-error" className="text-sm text-destructive">
						{view.error}
					</p>
				) : null}
			</section>

			{/* ── The result: divergence verdict ── */}
			{view.ok && view.diverged === false ? (
				<section
					data-testid="no-divergence"
					className="rounded-xl border border-border bg-card p-5"
				>
					<div className="text-xs uppercase tracking-wide text-muted-foreground">
						{t("verdict")}
					</div>
					<div className="mt-1 inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs text-emerald-600 dark:text-emerald-400">
						{t("withinPromise")}
					</div>
					<p className="mt-2 text-sm text-muted-foreground">{t("noIdea")}</p>
				</section>
			) : null}

			{draft ? (
				<div data-testid="ingest-result" className="space-y-8">
					{/* ── The RealityMirror record (project-scoped, provenance=incident) ── */}
					<section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
						<div className="rounded-xl border border-border bg-card p-4">
							<div className="text-xs uppercase tracking-wide text-muted-foreground">
								{t("projectScope")}
							</div>
							<div
								data-testid="project-scope"
								className="mt-1 font-mono text-xs text-foreground"
							>
								{draft.projectId}
							</div>
						</div>
						<div className="rounded-xl border border-border bg-card p-4">
							<div className="text-xs uppercase tracking-wide text-muted-foreground">
								{t("provenance")}
							</div>
							<div
								data-testid="provenance"
								className="mt-1 inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 font-mono text-xs text-amber-600 dark:text-amber-400"
							>
								{draft.idea.provenanceSource}
							</div>
						</div>
						<div className="rounded-xl border border-border bg-card p-4">
							<div className="text-xs uppercase tracking-wide text-muted-foreground">
								{t("wallStatus")}
							</div>
							<div
								data-testid="wall-status"
								className="mt-1 inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs text-emerald-600 dark:text-emerald-400"
							>
								{draft.wroteKernel ? t("wroteKernel") : t("noKernelWrite")}
							</div>
						</div>
					</section>

					{/* ── The divergence record ── */}
					<section className="space-y-3 rounded-xl border border-border bg-card p-5">
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{t("divergenceHeading")}
						</h3>
						<dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
							<div>
								<dt className="text-xs uppercase text-muted-foreground">
									{t("operationLabel")}
								</dt>
								<dd
									data-testid="divergence-operation"
									className="font-mono text-foreground"
								>
									{draft.divergence.operation}
								</dd>
							</div>
							<div>
								<dt className="text-xs uppercase text-muted-foreground">
									{t("kindLabel")}
								</dt>
								<dd
									data-testid="divergence-kind"
									className="font-mono text-foreground"
								>
									{draft.divergence.kind}
								</dd>
							</div>
							<div>
								<dt className="text-xs uppercase text-muted-foreground">
									{t("observedLabel")}
								</dt>
								<dd
									data-testid="divergence-observed"
									className="font-mono text-destructive"
								>
									{(draft.divergence.observed * 100).toFixed(1)}%
								</dd>
							</div>
							<div>
								<dt className="text-xs uppercase text-muted-foreground">
									{t("mirrorLabel")}
								</dt>
								<dd
									data-testid="divergence-mirror"
									className="font-mono text-foreground"
								>
									{draft.divergence.mirrorRef}
								</dd>
							</div>
						</dl>
					</section>

					{/* ── The DRAFT idea: the deterministic TEMPLATE text ── */}
					<section className="space-y-3 rounded-xl border border-border bg-card p-5">
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{t("ideaHeading")}
						</h3>
						<p className="text-xs text-muted-foreground">
							{t("ideaTemplateNote")}
						</p>
						<p
							data-testid="idea-text"
							className="rounded-lg bg-muted/40 p-4 text-sm leading-relaxed text-foreground"
						>
							{draft.idea.intent}
						</p>
						<div className="text-xs text-muted-foreground">{t("nextStep")}</div>
					</section>
				</div>
			) : null}
		</div>
	);
}
