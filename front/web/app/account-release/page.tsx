import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccountReleasePanel } from "@/components/AccountReleasePanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// /account-release (S117) — the per-ACCOUNT Release-v0 panel. It generalises the S47
// /adoption release pack to a multi-project account: the account's projects (each with
// its HONEST demo-vs-real status), the completed CLI surface (5 core + 6 S117 gateway
// verbs), the docs index, the test inventory, the changelog, and the honest known-limits
// (Doltgres beta, async best-effort, plan quotas) — PLUS the adoption ladder advising the
// next smallest ratchet. Determinism-first: the panel re-runs the SAME pure twin of
// back/runtime/adoption/accountrelease.Assemble (lib/account-release.ts), covered by
// fast-check (lib/account-release.test.ts). Action-capable: the "Assembler" button binds
// the control to the assemble operation. ASSEMBLE-ONLY — no install/ship/publish
// affordance; it writes no truth (the wall, §2). Themed (ADR 0010), bilingual (ADR 0011).

export const metadata: Metadata = {
	title:
		"Release v0 par compte — l'inventaire honnête + la prochaine tier d'adoption | AIDOS Workbench",
	description:
		"S117 : le pack de release par COMPTE — énumère HONNÊTEMENT ce qui EXISTE dans le truth-store live du compte (projets avec statut démo-vs-réel, surface CLI complétée goal/grill/spike/harvest/trim/init, routes Workbench, docs, inventaire de tests, changelog, limites connues honnêtes) et conseille la prochaine tier d'adoption. Content-addressed, en lecture seule. Assemble ; n'installe rien, ne livre rien, n'écrit aucune vérité.",
};

export default async function AccountReleasePage() {
	const t = await getTranslations("accountRelease");
	const labels = {
		scenarioLabel: t("scenarioLabel"),
		assembleButton: t("assembleButton"),
		packTitle: t("packTitle"),
		accountLabel: t("accountLabel"),
		projectsTitle: t("projectsTitle"),
		realBadge: t("realBadge"),
		demoBadge: t("demoBadge"),
		cliSurfaceTitle: t("cliSurfaceTitle"),
		coreBadge: t("coreBadge"),
		gatewayBadge: t("gatewayBadge"),
		routesTitle: t("routesTitle"),
		docsTitle: t("docsTitle"),
		testInventoryTitle: t("testInventoryTitle"),
		changelogTitle: t("changelogTitle"),
		knownLimitsTitle: t("knownLimitsTitle"),
		nextTierTitle: t("nextTierTitle"),
		currentLabel: t("currentLabel"),
		nextLabel: t("nextLabel"),
		allGreenBadge: t("allGreenBadge"),
		assembleOnlyNote: t("assembleOnlyNote"),
		emptyNote: t("emptyNote"),
		scenarioStarter: t("scenarioStarter"),
		scenarioKernel: t("scenarioKernel"),
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

				<AccountReleasePanel labels={labels} />
			</main>
		</div>
	);
}
