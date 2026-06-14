"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
	COCKPIT_FIXED_MIRROR,
	COCKPIT_VARIANTS,
	cockpitElites,
} from "@/lib/reality-evolution";
import { closeRealityAction, promoteEliteAction } from "./actions";
import { CLOSURE_INITIAL, PROMOTION_INITIAL } from "./view";

/**
 * CockpitPanel makes the /reality-evolution route action-capable (ui-completeness, CLAUDE.md §7):
 * S109 composes the three already-built engines into ONE per-project cockpit with controls bound to
 * the REAL pure twins —
 *
 *   1. CLOSE THE LOOP (primary, the §S109 done-journey): INGEST the out-of-stock incident → APPROVE
 *      the learned mirror → the createOrder hash BUMPS → a TARGETED red wave APPEARS (the worklist).
 *      A `healthy` toggle drives the within-promise path (no divergence, nothing learned).
 *   2. PROMOTE a QD ÉLITE: an authority toggle + a per-niche Promote button → a PROPOSAL with
 *      authority (writesTruth=false), refused without it; the mirror-breaker is NEVER an élite.
 *
 * DETERMINISM-FIRST (§6/§8): every control runs the PURE twin lib/reality-evolution — same input →
 * identical outcome, never an LLM. THE WALL (§2): the cockpit WRITES NOTHING (wroteKernel/
 * writesTruth=false; the direct Reality→Kernel edge is always refused). Themed on ADR 0010 tokens;
 * strings via next-intl (0011).
 */

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("realityEvolution");
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

export function CockpitPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("realityEvolution");
	const [closure, closeDispatch] = useActionState(
		closeRealityAction,
		CLOSURE_INITIAL,
	);
	const [promotion, promoteDispatch] = useActionState(
		promoteEliteAction,
		PROMOTION_INITIAL,
	);

	const result = closure.result;
	const learned = result?.phase === "learned" ? result : null;
	const elites = cockpitElites(COCKPIT_FIXED_MIRROR, COCKPIT_VARIANTS);

	return (
		<div className="space-y-12">
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

			{/* ══ 1. THE EXTERNAL LOOP: ingest → approve → red wave ══ */}
			<section className="space-y-4 rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("loopHeading")}
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("loopBody")}
				</p>
				<form action={closeDispatch} className="space-y-4">
					<label className="flex items-center gap-2 text-sm text-foreground">
						<input
							type="checkbox"
							name="healthy"
							data-testid="healthy-toggle"
							className="h-4 w-4 rounded border-border"
						/>
						{t("healthyLabel")}
					</label>
					<Submit label={t("closeLoop")} testId="close-reality" />
				</form>

				{closure.error ? (
					<p data-testid="closure-error" className="text-sm text-destructive">
						{closure.error}
					</p>
				) : null}

				{result?.phase === "no_divergence" ? (
					<div
						data-testid="no-divergence"
						className="rounded-lg border border-border bg-muted/40 p-4"
					>
						<div className="text-xs uppercase tracking-wide text-muted-foreground">
							{t("verdict")}
						</div>
						<div className="mt-1 inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs text-emerald-600 dark:text-emerald-400">
							{t("withinPromise")}
						</div>
						<p className="mt-2 text-sm text-muted-foreground">{t("noIdea")}</p>
					</div>
				) : null}
			</section>

			{learned ? (
				<div data-testid="closure-result" className="space-y-8">
					{/* ── Step 1 · the ingested incident (S106) ── */}
					<section className="space-y-3 rounded-xl border border-border bg-card p-5">
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{t("step1Heading")}
						</h3>
						<div className="flex flex-wrap items-center gap-2 text-xs">
							<span
								data-testid="provenance"
								className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 font-mono text-amber-600 dark:text-amber-400"
							>
								{t("provenance")}: {learned.draft.idea.provenanceSource}
							</span>
							<span
								data-testid="divergence-observed"
								className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 font-mono text-destructive"
							>
								{(learned.draft.divergence.observed * 100).toFixed(1)}%
							</span>
						</div>
						<p
							data-testid="idea-text"
							className="rounded-lg bg-muted/40 p-4 text-sm leading-relaxed text-foreground"
						>
							{learned.draft.idea.intent}
						</p>
					</section>

					{/* ── Step 2 · the approved mirror bumps the hash (S107) ── */}
					<section className="space-y-3 rounded-xl border border-border bg-card p-5">
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{t("step2Heading")}
						</h3>
						<dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
							<div>
								<dt className="text-xs uppercase text-muted-foreground">
									{t("targetLabel")}
								</dt>
								<dd
									data-testid="bump-target"
									className="font-mono text-foreground"
								>
									{learned.learn.bump.targetId}
								</dd>
							</div>
							<div>
								<dt className="text-xs uppercase text-muted-foreground">
									{t("beforeLabel")}
								</dt>
								<dd
									data-testid="bump-before"
									className="font-mono text-muted-foreground"
								>
									{learned.learn.bump.before}
								</dd>
							</div>
							<div>
								<dt className="text-xs uppercase text-muted-foreground">
									{t("afterLabel")}
								</dt>
								<dd
									data-testid="bump-after"
									className="font-mono text-foreground"
								>
									{learned.learn.bump.after}
								</dd>
							</div>
						</dl>
						<div
							data-testid="bump-moved"
							className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-xs ${
								learned.learn.bump.moved
									? "bg-primary/10 text-primary"
									: "bg-muted text-muted-foreground"
							}`}
						>
							{learned.learn.bump.moved ? t("moved") : t("notMoved")}
						</div>
					</section>

					{/* ── Step 3 · the red wave APPEARED (the §S109 done-criterion) ── */}
					<section className="space-y-3 rounded-xl border border-border bg-card p-5">
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{t("step3Heading")}
						</h3>
						<p className="text-xs text-muted-foreground">{t("waveNote")}</p>
						<div
							data-testid="red-wave-appeared"
							data-appeared={learned.redWaveAppeared ? "true" : "false"}
							className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-xs ${
								learned.redWaveAppeared
									? "bg-destructive/10 text-destructive"
									: "bg-muted text-muted-foreground"
							}`}
						>
							<span
								className={`h-2 w-2 rounded-full ${
									learned.redWaveAppeared
										? "bg-destructive"
										: "bg-muted-foreground"
								}`}
							/>
							{learned.redWaveAppeared
								? t("waveAppeared", { n: learned.redWaveCount })
								: t("waveEmpty")}
						</div>
						{learned.redWaveAppeared ? (
							<ol data-testid="wave-list" className="space-y-2 text-sm">
								{learned.learn.wave.items.map((item, i) => (
									<li
										key={item.target}
										data-testid="wave-item"
										className="flex items-center gap-3 rounded-lg bg-muted/40 p-3"
									>
										<span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 font-mono text-xs text-primary">
											{i + 1}
										</span>
										<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
											{item.layer}
										</span>
										<span className="font-mono text-foreground">
											{item.target}
										</span>
									</li>
								))}
							</ol>
						) : null}
					</section>

					{/* ── the wall: the cockpit wrote nothing ── */}
					<div
						data-testid="wall-status"
						className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs text-emerald-600 dark:text-emerald-400"
					>
						{t("noKernelWrite")} · {learned.wallCode}
					</div>
				</div>
			) : null}

			{/* ══ 2. THE QD ELITES ARCHIVE (S108) ══ */}
			<section className="space-y-4 rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("elitesHeading")}
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("elitesBody")}
				</p>
				<ul data-testid="elites-list" className="space-y-3">
					{elites.map((e) => (
						<li
							key={e.niche}
							data-testid="elite-row"
							className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3"
						>
							<div className="flex items-center gap-3 text-sm">
								<span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-xs text-primary">
									{e.niche}
								</span>
								<span className="font-mono text-foreground">{e.variantId}</span>
								<span className="font-mono text-xs text-muted-foreground">
									fit {e.fitness.toFixed(2)}
								</span>
								<span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-xs text-emerald-600 dark:text-emerald-400">
									{t("mirrorGreen")}
								</span>
							</div>
							<form
								action={promoteDispatch}
								className="flex items-center gap-3"
							>
								<input type="hidden" name="variantId" value={e.variantId} />
								<label className="flex items-center gap-1.5 text-xs text-foreground">
									<input
										type="checkbox"
										name="authority"
										data-testid={`authority-${e.niche}`}
										className="h-3.5 w-3.5 rounded border-border"
									/>
									{t("authorityLabel")}
								</label>
								<button
									type="submit"
									data-testid={`promote-${e.niche}`}
									className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
								>
									{t("promote")}
								</button>
							</form>
						</li>
					))}
				</ul>

				{promotion.result ? (
					<div
						data-testid="promotion-result"
						className="space-y-2 rounded-lg border border-border bg-card p-4"
					>
						<div className="flex flex-wrap items-center gap-2 text-xs">
							<span className="font-mono text-muted-foreground">
								{promotion.variantId}
							</span>
							<span
								data-testid="promotion-verdict"
								className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono ${
									promotion.result.verdict === "proposed"
										? "bg-primary/10 text-primary"
										: "bg-amber-500/10 text-amber-600 dark:text-amber-400"
								}`}
							>
								{promotion.result.verdict}
							</span>
							<span
								data-testid="promotion-writes-truth"
								className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-mono text-emerald-600 dark:text-emerald-400"
							>
								{promotion.result.writesTruth
									? t("wroteTruth")
									: t("noTruthWrite")}
							</span>
						</div>
						{promotion.result.reason ? (
							<p className="text-xs leading-relaxed text-muted-foreground">
								{promotion.result.reason}
							</p>
						) : null}
					</div>
				) : null}
			</section>
		</div>
	);
}
