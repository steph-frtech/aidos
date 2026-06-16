import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { KernelDebtPanel } from "@/components/KernelDebtPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { LiveMutation } from "./LiveMutation";
import { liveMutation } from "./liveActions";

// Read the engine's live mutation verdict on every request (the S59 cutover): the verdict is
// read through the gateway (run_mutation), never baked into a static page.
export const dynamic = "force-dynamic";

// Determinism-first: the debt ledger + the trim plan are computed by a PURE twin of
// back/runtime/debt.Scan + back/runtime/debt/trim.SuggestTrim (lib/kernel-debt.ts),
// covered by fast-check (lib/kernel-debt.test.ts) anchored on the Go fixtures. The
// action-capable panel re-runs the SAME twin on a selected scenario and renders the
// debt grouped under ORPHAN MIRRORS / STALE FIXTURES / SURVIVING MUTANTS plus the
// suggest-only trim plan (each suggestion an open_idea_* requiring the door
// idea → mirror → /goal → human approval, with NO delete/apply affordance). The
// recorded snapshot lives in fitness.kernel_debt_snapshot (SELECT-only — the wall,
// §2). Themed (ADR 0010), bilingual (ADR 0011).

export const metadata: Metadata = {
	title:
		"Dette du noyau — orphelins, fixtures périmées, mutants survivants | AIDOS Workbench",
	description:
		"KernelDebt (S41) : le diagnostic en lecture seule qui nomme la rouille du dépôt de vérité — miroirs orphelins (monstres de la loi de complétude, S12), fixtures périmées (épingle déplacée) et mutants survivants (consommés du run S40). /trim PROPOSE un plan de réduction : chaque action ouvre une idée, jamais une suppression, et exige la porte idea → mirror → /goal → human approval. Détecte et suggère ; ne supprime rien.",
};

export default async function KernelDebtPage() {
	const t = await getTranslations("kernelDebt");
	const tc = await getTranslations("common");
	const mutation = await liveMutation();
	const labels = {
		scenarioLabel: t("scenarioLabel"),
		ledgerTitle: t("ledgerTitle"),
		orphanHeader: t("orphanHeader"),
		staleHeader: t("staleHeader"),
		survivorHeader: t("survivorHeader"),
		emptyDebt: t("emptyDebt"),
		planTitle: t("planTitle"),
		planEmpty: t("planEmpty"),
		requiresLabel: t("requiresLabel"),
		proposalBadge: t("proposalBadge"),
		severityLabel: t("severityLabel"),
		targetLabel: t("targetLabel"),
		noDeleteNote: t("noDeleteNote"),
		scenarioAllThree: t("scenarioAllThree"),
		scenarioOrphan: t("scenarioOrphan"),
		scenarioStale: t("scenarioStale"),
		scenarioSurvivor: t("scenarioSurvivor"),
		scenarioClean: t("scenarioClean"),
		sevHigh: t("sevHigh"),
		sevMedium: t("sevMedium"),
		sevLow: t("sevLow"),
		actionRetire: t("actionRetire"),
		actionRepin: t("actionRepin"),
		actionStrengthen: t("actionStrengthen"),
	};

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />
			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-8">
				<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{t("eyebrow")}
				</span>
				<h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
					{t("title")}
				</h1>
				<p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
					{t("intro")}
				</p>

				<section className="mt-8 rounded-xl border border-border bg-card p-5">
					<h2 className="text-sm font-semibold text-foreground">
						{t("tutorialTitle")}
					</h2>
					<ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
						<li>{t("tutorialStep1")}</li>
						<li>{t("tutorialStep2")}</li>
						<li>{t("tutorialStep3")}</li>
						<li>{t("tutorialStep4")}</li>
					</ol>
				</section>

				<h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
					{t("exampleTitle")}
				</h2>

				<KernelDebtPanel labels={labels} />

				{/* Live mutation verdict — read through the gateway (run_mutation), demo fallback */}
				<LiveMutation
					view={mutation}
					labels={{
						heading: t("liveHeading"),
						intro: t("liveIntro"),
						live: tc("live"),
						demo: tc("demo"),
						liveTitle: t("liveTitle"),
						demoTitle: t("liveDemoTitle"),
						verdictLabel: t("liveVerdictLabel"),
						scoreLabel: t("liveScoreLabel"),
						thresholdLabel: t("liveThresholdLabel"),
						survivorsLabel: t("liveSurvivorsLabel"),
						noSurvivors: t("liveNoSurvivors"),
						blockLabel: t("liveBlockLabel"),
					}}
				/>
			</main>
		</div>
	);
}
