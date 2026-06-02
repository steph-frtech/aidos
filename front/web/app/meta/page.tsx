import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MetaPanel } from "@/components/MetaPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the meta-meta self-test verdict is computed by a PURE twin of
// back/hooks/sessionstart/selftest.Run (lib/meta.ts), covered by fast-check
// (lib/meta.test.ts) anchored on the Go fixtures. The action-capable panel re-runs the
// SAME twin on a selected harness scenario and renders the three guarantees live —
// every sensor fired, the wall refused on kernel · mirrors · fitness, the fitness
// unchanged. READ-ONLY on the fitness (the wall, §2): the graven NIVEAU 3 baseline is
// rendered, never editable (owned by human + reality, no loop edits it). Themed (ADR
// 0010), bilingual (ADR 0011).

export const metadata: Metadata = {
	title:
		"Méta-méta — le self-test du harness (fitness inviolable) | AIDOS Workbench",
	description:
		"Le self-test méta-méta d'AIDOS (S39, KRD LIVRE XIII §70) : à chaque démarrage de session, une injection de faute déterministe prouve les trois garanties inviolables du NIVEAU 3 — chaque capteur se déclenche encore, le mur refuse toujours les écritures kernel/mirrors/fitness de l'agent, et la fitness (définition de « réussi ») n'a pas été modifiée. La boucle méta peut AJOUTER un garde-fou, jamais en RETIRER un. La fitness est rendue en lecture seule : aucune boucle ne l'édite.",
};

export default async function MetaPage() {
	const t = await getTranslations("meta");
	const labels = {
		scenarioLabel: t("scenarioLabel"),
		runCta: t("runCta"),
		verdictLabel: t("verdictLabel"),
		verdictGreen: t("verdictGreen"),
		verdictRed: t("verdictRed"),
		guaranteeSensors: t("guaranteeSensors"),
		guaranteeWall: t("guaranteeWall"),
		guaranteeFitness: t("guaranteeFitness"),
		firedLabel: t("firedLabel"),
		notFiredLabel: t("notFiredLabel"),
		injectedFaultLabel: t("injectedFaultLabel"),
		refusedLabel: t("refusedLabel"),
		acceptedLabel: t("acceptedLabel"),
		baselineHashLabel: t("baselineHashLabel"),
		currentHashLabel: t("currentHashLabel"),
		unchangedYes: t("unchangedYes"),
		unchangedNo: t("unchangedNo"),
		blockReasonLabel: t("blockReasonLabel"),
		howToFixLabel: t("howToFixLabel"),
		baselinePanelTitle: t("baselinePanelTitle"),
		baselineOwner: t("baselineOwner"),
		readOnlyBadge: t("readOnlyBadge"),
		historyTitle: t("historyTitle"),
		scenarioHealthy: t("scenarioHealthy"),
		scenarioMutedSensor: t("scenarioMutedSensor"),
		scenarioBreachedWall: t("scenarioBreachedWall"),
		scenarioMutatedFitness: t("scenarioMutatedFitness"),
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

				{/* Tutorial — how to read this panel. */}
				<section className="mt-6 rounded-lg border border-border bg-card p-5">
					<h2 className="text-base font-semibold text-foreground">
						{t("tutorialTitle")}
					</h2>
					<ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
						<li>{t("tutorialStep1")}</li>
						<li>{t("tutorialStep2")}</li>
						<li>{t("tutorialStep3")}</li>
						<li>{t("tutorialStep4")}</li>
					</ol>
				</section>

				{/* Worked example — re-run the self-test on a chosen harness scenario. */}
				<section className="mt-6">
					<h2 className="mb-3 text-base font-semibold text-foreground">
						{t("exampleTitle")}
					</h2>
					<MetaPanel labels={labels} />
				</section>
			</main>
		</div>
	);
}
