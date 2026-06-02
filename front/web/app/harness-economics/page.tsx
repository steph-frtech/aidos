import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { HarnessEconomicsPanel } from "@/components/HarnessEconomicsPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the harness-economics evaluator is a pure projection in lib/economics.ts
// (mirroring back/runtime/economics), covered by lib/economics.test.ts. The panel runs the pure
// evaluator per row — no I/O, no Date.now() — so each verdict shown is computed exactly as the Go
// evaluator decides it. The measured cost is CONSUMED (telemetry / changesets / the S40 run / the
// goal's spend), never produced here.

export const metadata: Metadata = {
	title: "Économie du harnais — AIDOS Workbench",
	description:
		"Read-only panel of AIDOS harness economics (KRD §66.3): the checkout cell's declared HarnessCostBudget surfaced beside its measured cost, the economics table (within_budget / over_budget_flagged / over_budget_justified) and the ValueCase that justifies a costly truth. Plus une contrainte coûte cher à maintenir, plus elle doit justifier sa valeur.",
};

/**
 * /harness-economics — the harness-economics panel (S51, KRD §66.3 « l'économie du harnais »). Each
 * cell DECLARES a HarnessCostBudget (max_ci_minutes, max_llm_tokens_per_goal, max_mutation_runtime,
 * max_human_review_minutes, expected_risk_reduction); a costly truth carries a ValueCase
 * (truth, risk_if_broken, expected_impact, harness_cost, decision ∈ {justified, too_expensive,
 * revisit}). The done law: a truth whose measured harness cost exceeds its budget WITHOUT a
 * `justified` ValueCase is FLAGGED (HARNESS_COST_EXCEEDS_BUDGET), while the caps are SURFACED.
 *
 * WALL-SAFE (CLAUDE.md §2/§7/§8): the budget is the DECLARED bar above the line — the panel READS it
 * and offers NO budget-edit affordance (raising it is a /goal) and NO delete affordance (advisory
 * only). The "Proposer un ChangeSet" control routes a truth-write via propose → ChangeSet →
 * approval (S20 stub). Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */
export default async function HarnessEconomicsPage() {
	const t = await getTranslations("economics");

	const labels = {
		budgetHeading: t("budgetHeading"),
		cellLabel: t("cellLabel"),
		capLabel: t("capLabel"),
		measuredLabel: t("measuredLabel"),
		maxCiMinutes: t("maxCiMinutes"),
		maxLlmTokens: t("maxLlmTokens"),
		maxMutationRuntime: t("maxMutationRuntime"),
		maxHumanReview: t("maxHumanReview"),
		expectedRiskReduction: t("expectedRiskReduction"),
		overTag: t("overTag"),
		tableHeading: t("tableHeading"),
		caseLabel: t("caseLabel"),
		verdictLabel: t("verdictLabel"),
		reasonLabel: t("reasonLabel"),
		howToFixLabel: t("howToFixLabel"),
		badgeWithin: t("badgeWithin"),
		badgeJustified: t("badgeJustified"),
		badgeFlagged: t("badgeFlagged"),
		keptTag: t("keptTag"),
		valueCaseHeading: t("valueCaseHeading"),
		truthLabel: t("truthLabel"),
		riskLabel: t("riskLabel"),
		impactLabel: t("impactLabel"),
		decisionLabel: t("decisionLabel"),
		reEvaluateHeading: t("reEvaluateHeading"),
		reEvaluateButton: t("reEvaluateButton"),
		reEvaluateDone: t("reEvaluateDone"),
		proposeHeading: t("proposeHeading"),
		proposeButton: t("proposeButton"),
		proposeStubHeading: t("proposeStubHeading"),
		proposeStubBody: t("proposeStubBody"),
	};

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />

			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-8 sm:py-16">
				<header className="space-y-4">
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{t("eyebrow")}
					</span>
					<div className="flex flex-wrap items-center gap-3">
						<h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
							{t("title")}
						</h1>
						<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("subtitle")}
						</span>
						<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("readOnly")}
						</span>
					</div>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				<section
					aria-label={t("tutorialHeading")}
					data-testid="tutorial"
					className="mt-10 space-y-2 rounded-xl border border-border bg-muted/40 p-5"
				>
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("tutorialHeading")}
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{t("tutorialBody")}
					</p>
				</section>

				<div className="mt-10">
					<HarnessEconomicsPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t.rich("footer", {
						code: (chunks) => (
							<code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem] text-foreground">
								{chunks}
							</code>
						),
					})}
				</footer>
			</main>
		</div>
	);
}
