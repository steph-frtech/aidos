"use client";

// CompoundingSection (CE05) — the action-capable « Compounding » surface on /agents. It CLOSES
// the capitalisation loop on screen: a SUBSEQUENT similar goal REUSES the behaviors+procédures a
// prior green goal captured (CE03/CE04), so its effort/tokens DROP. The « historique de
// capitalisation » renders the per-unit routing (recall procédural / expansion behavior / dérivé
// frais) and the computed token delta.
//
// ACTION-CAPABLE, WALL-SAFE (CLAUDE.md §7 ui-completeness): the "Router le goal suivant" control
// runs the pure lib/compound.reuse router (a READ over the declared corpus + a recall below the
// line — NO truth touched). A toggle flips the next goal SIMILAR↔DISSIMILAR to prove the
// anti-false-positive frontier (a dissimilar goal reuses nothing). Determinism-first: every
// number on screen is computed by the same pure router the Go core runs (reuse.go), never an LLM.
// A behavior reuse is marked VIA LE MUR (freezing still goes idée → miroir → /goal); a procedural
// recall is below the line. Themed on ADR 0010 (design tokens), bilingual on ADR 0011 (next-intl).

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
	COMPOUND_CORPUS,
	DISSIMILAR_NEXT_GOAL,
	type ReusePlan,
	reuse,
	SIMILAR_NEXT_GOAL,
} from "@/lib/compound";

type Mode = "similar" | "dissimilar";

function originLabel(
	origin: ReusePlan["routes"][number]["origin"],
	t: ReturnType<typeof useTranslations>,
): string {
	switch (origin) {
		case "reused_procedural":
			return t("originProcedural");
		case "reused_behavior":
			return t("originBehavior");
		default:
			return t("originFresh");
	}
}

export function CompoundingSection() {
	const t = useTranslations("compoundingSection");
	const [plan, setPlan] = useState<ReusePlan | null>(null);
	const [mode, setMode] = useState<Mode>("similar");

	const run = (m: Mode) => {
		setMode(m);
		const next = m === "similar" ? SIMILAR_NEXT_GOAL : DISSIMILAR_NEXT_GOAL;
		setPlan(reuse(COMPOUND_CORPUS, next));
	};

	const reusedTotal = plan ? plan.reusedProcedural + plan.reusedBehavior : 0;
	const reductionPct = plan ? Math.round(plan.reductionFrac * 100) : 0;

	return (
		<section
			data-testid="compounding-section"
			aria-label={t("heading")}
			className="mt-10 space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<header className="space-y-1">
				<span className="text-xs font-medium uppercase tracking-wide text-primary">
					{t("eyebrow")}
				</span>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("heading")}
				</h2>
				<p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
					{t("intro")}
				</p>
			</header>

			<div className="flex flex-wrap items-center gap-2">
				<button
					type="button"
					data-testid="compounding-run-similar"
					onClick={() => run("similar")}
					className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
				>
					{t("runSimilar")}
				</button>
				<button
					type="button"
					data-testid="compounding-run-dissimilar"
					onClick={() => run("dissimilar")}
					className="rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted/70"
				>
					{t("runDissimilar")}
				</button>
			</div>

			{plan === null ? (
				<p
					data-testid="compounding-pending"
					className="text-sm italic text-muted-foreground"
				>
					{t("pending")}
				</p>
			) : (
				<div className="space-y-4">
					{/* The compound payoff — effort before vs after. */}
					<div
						data-testid="compounding-verdict"
						data-mode={mode}
						data-reused={reusedTotal}
						data-saved={plan.savedTokens}
						data-effort-before={plan.effortBefore}
						data-effort-after={plan.effortAfter}
						className="rounded-lg border border-border bg-muted/40 p-4"
					>
						<div className="flex flex-wrap items-baseline justify-between gap-2">
							<span className="text-sm font-semibold text-foreground">
								{t("payoffHeading", {
									source: plan.sourceGoal,
									goal: plan.goal,
								})}
							</span>
							{reusedTotal > 0 ? (
								<span
									data-testid="compounding-drop-badge"
									className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary"
								>
									{t("dropBadge", { pct: reductionPct })}
								</span>
							) : (
								<span
									data-testid="compounding-nodrop-badge"
									className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
								>
									{t("noDropBadge")}
								</span>
							)}
						</div>
						<dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
							<div>
								<dt className="text-xs text-muted-foreground">
									{t("effortBefore")}
								</dt>
								<dd className="font-mono text-foreground">
									{plan.effortBefore}
								</dd>
							</div>
							<div>
								<dt className="text-xs text-muted-foreground">
									{t("effortAfter")}
								</dt>
								<dd className="font-mono text-foreground">
									{plan.effortAfter}
								</dd>
							</div>
							<div>
								<dt className="text-xs text-muted-foreground">
									{t("savedTokens")}
								</dt>
								<dd
									data-testid="compounding-saved"
									className="font-mono text-primary"
								>
									{plan.savedTokens}
								</dd>
							</div>
							<div>
								<dt className="text-xs text-muted-foreground">
									{t("reuseSplit")}
								</dt>
								<dd className="font-mono text-foreground">
									{plan.reusedProcedural}P · {plan.reusedBehavior}B ·{" "}
									{plan.derivedFresh}F
								</dd>
							</div>
						</dl>
					</div>

					{/* The « historique de capitalisation » — per-unit routing. */}
					<div>
						<h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{t("historyHeading")}
						</h3>
						<ul data-testid="compounding-routes" className="space-y-1.5">
							{plan.routes.map((r) => (
								<li
									key={r.name}
									data-testid={`compounding-route-${r.name}`}
									data-origin={r.origin}
									className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
								>
									<code className="font-mono text-foreground">{r.name}</code>
									<span className="flex items-center gap-2">
										<span
											className={
												r.origin === "derived_fresh"
													? "rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
													: "rounded bg-primary/15 px-2 py-0.5 text-xs text-primary"
											}
										>
											{originLabel(r.origin, t)}
										</span>
										{r.viaWall && (
											<span
												data-testid={`compounding-viawall-${r.name}`}
												className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400"
											>
												{t("viaWall")}
											</span>
										)}
										<span className="font-mono text-xs text-muted-foreground">
											{r.tokens}
										</span>
									</span>
								</li>
							))}
						</ul>
					</div>

					<p
						data-testid="compounding-wall-note"
						data-wrote-kernel={plan.wroteKernel}
						className="text-xs italic text-muted-foreground"
					>
						{t("wallNote")}
					</p>
				</div>
			)}
		</section>
	);
}
