"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { closeLoopAction } from "./actions";
import { LEARN_INITIAL } from "./view";

/**
 * LearnPanel makes the /learn route action-capable (ui-completeness law, CLAUDE.md §7): S107 has
 * ONE control bound to the REAL loop-closure engine, with a toggle that drives the done-criterion
 * from the screen —
 *
 *   - CLOSE THE LOOP over the canonical out-of-stock incident: attach the human-approved NEW mirror
 *     → the createOrder operation's content address BUMPS → a TARGETED red wave (mirror-first)
 *     becomes the worklist.
 *   - RE-REFLECT TOGGLE: re-attach an ALREADY-reflected mirror → NO bump, an EMPTY wave (a cosmetic
 *     re-reflection is not a new tooth).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/learn, never an LLM —
 * same input → identical outcome. THE WALL (§2): the loop WRITES NOTHING — the outcome is a value
 * (wroteKernel=false; the direct Reality→Kernel edge is always refused); the human authors the
 * approved mirror at /goal — nothing learns its own fitness. Themed on ADR 0010 tokens; strings via
 * next-intl (0011).
 */

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("learn");
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

export function LearnPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("learn");
	const [view, dispatch] = useActionState(closeLoopAction, LEARN_INITIAL);
	const outcome = view.outcome;

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

			{/* ── The loop-closure control: close + re-reflect toggle ── */}
			<section className="space-y-4 rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("closeHeading")}
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("closeBody")}
				</p>
				<form action={dispatch} className="space-y-4">
					<label className="flex items-center gap-2 text-sm text-foreground">
						<input
							type="checkbox"
							name="reReflect"
							data-testid="re-reflect-toggle"
							className="h-4 w-4 rounded border-border"
						/>
						{t("reReflectLabel")}
					</label>
					<Submit label={t("close")} testId="close-loop" />
				</form>

				{view.error ? (
					<p data-testid="close-error" className="text-sm text-destructive">
						{view.error}
					</p>
				) : null}
			</section>

			{outcome ? (
				<div data-testid="learn-result" className="space-y-8">
					{/* ── Provenance + wall status ── */}
					<section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
						<div className="rounded-xl border border-border bg-card p-4">
							<div className="text-xs uppercase tracking-wide text-muted-foreground">
								{t("provenance")}
							</div>
							<div
								data-testid="provenance"
								className="mt-1 inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 font-mono text-xs text-amber-600 dark:text-amber-400"
							>
								{outcome.provenanceSource} {outcome.provenanceDetail}
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
								{outcome.wroteKernel ? t("wroteKernel") : t("noKernelWrite")}
							</div>
						</div>
						<div className="rounded-xl border border-border bg-card p-4">
							<div className="text-xs uppercase tracking-wide text-muted-foreground">
								{t("wallCodeLabel")}
							</div>
							<div
								data-testid="wall-code"
								className="mt-1 font-mono text-xs text-foreground"
							>
								{outcome.wallCode}
							</div>
						</div>
					</section>

					{/* ── The hash bump (the operation/policy address changed) ── */}
					<section className="space-y-3 rounded-xl border border-border bg-card p-5">
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{t("bumpHeading")}
						</h3>
						<p className="text-xs text-muted-foreground">{t("bumpNote")}</p>
						<dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
							<div>
								<dt className="text-xs uppercase text-muted-foreground">
									{t("targetLabel")}
								</dt>
								<dd
									data-testid="bump-target"
									className="font-mono text-foreground"
								>
									{outcome.bump.targetId}
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
									{outcome.bump.before}
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
									{outcome.bump.after}
								</dd>
							</div>
						</dl>
						<div
							data-testid="bump-moved"
							className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-xs ${
								outcome.bump.moved
									? "bg-primary/10 text-primary"
									: "bg-muted text-muted-foreground"
							}`}
						>
							{outcome.bump.moved ? t("moved") : t("notMoved")}
						</div>
					</section>

					{/* ── The targeted red wave (the worklist) ── */}
					<section className="space-y-3 rounded-xl border border-border bg-card p-5">
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{t("waveHeading")}
						</h3>
						<p className="text-xs text-muted-foreground">{t("waveNote")}</p>
						{outcome.wave.items.length === 0 ? (
							<p
								data-testid="wave-empty"
								className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground"
							>
								{t("waveEmpty")}
							</p>
						) : (
							<ol data-testid="wave-list" className="space-y-2 text-sm">
								{outcome.wave.items.map((item, i) => (
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
						)}
					</section>

					<div className="text-xs text-muted-foreground">{t("nextStep")}</div>
				</div>
			) : null}
		</div>
	);
}
