import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LexiconPanel } from "@/components/LexiconPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the lint is a pure projection in lib/lexicon.ts (mirroring back/kernel/lexicon),
// covered by lib/lexicon.test.ts (fast-check). This Server Component renders the intro + tutorial;
// the action-capable panel runs the same pure `lint` the Go lexicon.Lint emits — no I/O, no clock,
// no rng, NO LLM — so the drifts shown are computed exactly as Go Lint computes them (the judge is a
// set-membership check, never a prompt). READ-ONLY (the wall): the screen lints; freezing/updating a
// lexicon goes via propose → /goal → approval, never a write here.

export const metadata: Metadata = {
	title: "Lexicon Kernel — linter inter-couches — AIDOS Workbench",
	description:
		"Panneau du Lexicon Kernel d'AIDOS (FKE-21, FK14) : un concept NOMMÉ à travers les 16 couches (humain/BDD/code/test/DB/API/event/log/metric/MCP/skill/agent/doc/CI/policy/memory) comme source unique, et un linter PUR qui détecte un symbole hors lexique par couche — un drift de langue vérifiable par calcul. Renommer une table hors lexique → rouge (RENAMED).",
};

/**
 * /lexicon — the Lexicon Kernel panel (FK14). It lints observed symbols against a concept's lexicon:
 * pick one of the canonical scenarios (the FKE-21 ReturnRequest in lexicon, or the FK14
 * fault-injection — a renamed DB table out of lexicon, plus the unknown-symbol / unknown-layer
 * drifts) and RUN the lint (the action), then read the drifts (RENAMED / UNKNOWN_SYMBOL /
 * UNKNOWN_LAYER) — or the clean verdict.
 *
 * THE DONE CRITERIA, executable from the screen: linting the renamed-table scenario shows one
 * RENAMED drift (a symbol out of lexicon → red); the in-lexicon scenario is CLEAN (green).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall). Themed on ADR 0010 tokens; bilingual via
 * next-intl (ADR 0011).
 */
export default async function LexiconPage() {
	const t = await getTranslations("lexicon");

	const labels = {
		pickLabel: t("pickLabel"),
		lintLabel: t("lintLabel"),
		awaiting: t("awaiting"),
		conceptLabel: t("conceptLabel"),
		cleanNote: t("cleanNote"),
		driftsHeading: t("driftsHeading"),
		expectedLabel: t("expectedLabel"),
		bodyLabel: t("bodyLabel"),
		caseNames: {
			caseInLexicon: t("caseInLexicon"),
			caseRenamedTable: t("caseRenamedTable"),
			caseUnknownSymbol: t("caseUnknownSymbol"),
			caseUnknownLayer: t("caseUnknownLayer"),
		},
		driftNames: {
			RENAMED: t("driftRenamed"),
			UNKNOWN_SYMBOL: t("driftUnknownSymbol"),
			UNKNOWN_LAYER: t("driftUnknownLayer"),
		},
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
					<LexiconPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
