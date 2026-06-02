import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdoptionPanel } from "@/components/AdoptionPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the adoption ladder + the release pack are computed by a PURE twin
// of back/runtime/adoption.Plan + back/runtime/adoption/release.Assemble (lib/adoption.ts),
// covered by fast-check (lib/adoption.test.ts) anchored on the Go fixtures. The panel
// re-runs the SAME twin on a selected scenario and renders (1) the five-tier ladder
// T0..T4 — current tier highlighted, next smallest installable tier marked, each
// unsatisfiable tier's Gaps, with the three load-bearing facts visible (T1 shows NO QD
// requirement, T2 blocked until RealityMirror live, T4 blocked until EvolutionSandbox
// exists) — and (2) the release pack (CLI surface, routes, demo, docs, test inventory,
// changelog, honest known-limits), assembled only — NO install/ship/publish affordance.
// The recorded pack lives in fitness.release_pack (SELECT-only — the wall, §2). Themed
// (ADR 0010), bilingual (ADR 0011).

export const metadata: Metadata = {
	title:
		"Adoption + Release v0 — le plus petit cliquet qui clique, le pack assemblé | AIDOS Workbench",
	description:
		"AdoptionStage (S47) : l'échelle en lecture seule T0→T4 qui nomme le plus petit cliquet à installer (KRD §82.5). T1 ne requiert PAS la QualityDiversity (avancée, §82.6) ; T2 exige un RealityMirror vivant (Livre XX) ; T4 exige un EvolutionSandbox (§66.1). Le Release v0 est ASSEMBLÉ — un inventaire de ce qui existe (surface CLI, routes Workbench, démo, docs, inventaire de tests, changelog, limites connues honnêtes) — content-addressed, en lecture seule. Assemble ; n'installe rien, ne livre rien, n'écrit aucune vérité.",
};

export default async function AdoptionPage() {
	const t = await getTranslations("adoption");
	const labels = {
		scenarioLabel: t("scenarioLabel"),
		ladderTitle: t("ladderTitle"),
		packTitle: t("packTitle"),
		currentBadge: t("currentBadge"),
		nextBadge: t("nextBadge"),
		satisfiedBadge: t("satisfiedBadge"),
		blockedBadge: t("blockedBadge"),
		requiresLabel: t("requiresLabel"),
		grantsLabel: t("grantsLabel"),
		gapLabel: t("gapLabel"),
		noQdNote: t("noQdNote"),
		cliSurfaceTitle: t("cliSurfaceTitle"),
		routesTitle: t("routesTitle"),
		demoTitle: t("demoTitle"),
		docsTitle: t("docsTitle"),
		testInventoryTitle: t("testInventoryTitle"),
		changelogTitle: t("changelogTitle"),
		knownLimitsTitle: t("knownLimitsTitle"),
		emptyPack: t("emptyPack"),
		assembleOnlyNote: t("assembleOnlyNote"),
		allGreenBadge: t("allGreenBadge"),
		scenarioFloor: t("scenarioFloor"),
		scenarioT1Cell: t("scenarioT1Cell"),
		scenarioT2Reality: t("scenarioT2Reality"),
		scenarioT4Blocked: t("scenarioT4Blocked"),
		scenarioEmpty: t("scenarioEmpty"),
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

				<AdoptionPanel labels={labels} />
			</main>
		</div>
	);
}
