"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { GardenKind, Severity } from "@/lib/kernel-garden";
import { acceptAction, tendAction } from "./actions";
import {
	ACCEPT_INITIAL,
	DEFAULT_PROJECT,
	GARDEN_INITIAL,
	PROJECT_REFS,
} from "./view";

/**
 * KernelGardenPanel makes the /kernel-garden route action-capable (ui-completeness,
 * CLAUDE.md §7): S112's three controls, each bound to the REAL pure twin
 * lib/kernel-garden —
 *
 *   1. SELECT PROJECT: choosing a project scopes the scan (§82.4 — a scan of proj A
 *      never surfaces proj B's debt).
 *   2. TEND: garden the selected project → the ranked debt ledger (five kinds) + the
 *      trim plan (one open_idea_* per item, suggest-only).
 *   3. ACCEPT: accept a proposal → an OpenIdea that ALWAYS opens an idea and NEVER
 *      deletes (idea → mirror → /goal → human approval, the only door).
 *
 * DETERMINISM-FIRST (§6/§8): every control runs the pure twin — same input → identical
 * output, never an LLM. THE WALL (§2): the cockpit WRITES NOTHING; /trim deletes nothing.
 * Themed on ADR 0010 tokens; strings via next-intl (0011).
 */

function severityBadgeClass(s: Severity): string {
	if (s === "high") return "bg-destructive/15 text-destructive";
	if (s === "medium")
		return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
	return "bg-muted text-muted-foreground";
}

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("kernelGarden");
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

export function KernelGardenPanel() {
	const t = useTranslations("kernelGarden");
	const [garden, tendSubmit] = useActionState(tendAction, GARDEN_INITIAL);
	const [accept, acceptSubmit] = useActionState(acceptAction, ACCEPT_INITIAL);
	const [project, setProject] = useState(DEFAULT_PROJECT);

	function kindLabel(k: GardenKind): string {
		return t(`kind.${k}`);
	}

	return (
		<div className="space-y-12">
			{/* ── 1. SELECT PROJECT + TEND ── */}
			<section className="space-y-4" data-testid="section-tend">
				<h2 className="text-lg font-semibold text-foreground">
					{t("tendHeading")}
				</h2>
				<p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
					{t("tendBody")}
				</p>
				<form
					action={tendSubmit}
					className="space-y-3 rounded-lg border border-border bg-muted/40 p-4"
				>
					<label className="block text-xs text-muted-foreground">
						{t("projectLabel")}
						<select
							name="project"
							data-testid="project-select"
							value={project}
							onChange={(e) => setProject(e.target.value)}
							className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
						>
							{PROJECT_REFS.map((p) => (
								<option key={p} value={p}>
									{p}
								</option>
							))}
						</select>
					</label>
					<Submit label={t("tend")} testId="tend-submit" />
				</form>

				{garden.ran && garden.garden ? (
					<div className="space-y-3" data-testid="garden-result">
						<div className="flex flex-wrap items-center gap-2 text-sm">
							<span className="font-medium text-foreground">
								{t("scopedTo")}:
							</span>
							<code
								data-testid="scoped-project"
								className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
							>
								{garden.garden.projectRef}
							</code>
							<span
								data-testid="debt-count"
								className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
							>
								{t("itemCount", { count: garden.garden.items.length })}
							</span>
						</div>

						{garden.garden.items.length === 0 ? (
							<p
								data-testid="clean-garden"
								className="rounded-lg border border-border bg-card p-3 text-sm text-emerald-600 dark:text-emerald-400"
							>
								{t("cleanGarden")}
							</p>
						) : (
							<ul className="space-y-2" data-testid="debt-list">
								{garden.garden.items.map((item, idx) => {
									const sug = garden.plan?.suggestions[idx];
									return (
										<li
											key={item.id}
											data-testid="debt-item"
											data-kind={item.kind}
											className="rounded-lg border border-border bg-card p-3 text-sm"
										>
											<div className="flex flex-wrap items-center gap-2">
												<span
													className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${severityBadgeClass(item.severity)}`}
												>
													{item.severity}
												</span>
												<span className="font-medium text-foreground">
													{kindLabel(item.kind)}
												</span>
												<code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
													{item.targetRef}
												</code>
											</div>
											<p className="mt-2 text-xs text-muted-foreground">
												{item.reason}
											</p>
											{sug ? (
												<div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
													<span className="text-xs text-muted-foreground">
														{t("proposes")}:
													</span>
													<code className="rounded bg-muted px-1.5 py-0.5 text-xs text-primary">
														{sug.proposedAction}
													</code>
													<form action={acceptSubmit} className="ml-auto">
														<input
															type="hidden"
															name="project"
															value={project}
														/>
														<input
															type="hidden"
															name="debtItemRef"
															value={item.id}
														/>
														<button
															type="submit"
															data-testid="accept-submit"
															data-debt-id={item.id}
															className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
														>
															{t("accept")}
														</button>
													</form>
												</div>
											) : null}
										</li>
									);
								})}
							</ul>
						)}
						<p
							className="text-xs text-muted-foreground"
							data-testid="suggest-only"
						>
							{t("suggestOnly")}
						</p>
					</div>
				) : null}
			</section>

			{/* ── ACCEPT → OPEN IDEA (never delete) ── */}
			{accept.ran && accept.openIdea ? (
				<section className="space-y-3" data-testid="accept-result">
					<h2 className="text-lg font-semibold text-foreground">
						{t("acceptHeading")}
					</h2>
					<div className="rounded-lg border border-border bg-card p-3 text-sm">
						<div className="flex flex-wrap items-center gap-2">
							<span
								data-testid="opens-idea-badge"
								className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary"
							>
								{t("opensIdea")}
							</span>
							<span
								data-testid="never-deletes-badge"
								className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
							>
								{t("neverDeletes")}
							</span>
						</div>
						<p className="mt-2 text-xs text-muted-foreground">
							<span className="font-medium">{t("doorLabel")}: </span>
							<code data-testid="the-door">{accept.openIdea.door}</code>
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							<span className="font-medium">{t("intentLabel")}: </span>
							{accept.openIdea.intentPrefix}
						</p>
					</div>
				</section>
			) : null}
		</div>
	);
}
