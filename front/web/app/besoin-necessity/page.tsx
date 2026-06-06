import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BesoinNecessityPanel } from "@/components/BesoinNecessityPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the necessity comparison (BesoinGraph vs flat prompt → richer/ordered backlog)
// is a pure projection in lib/besoin-necessity.ts (the twin of spike/besoin), covered by
// lib/besoin-necessity.test.ts (vitest + fast-check). This Server Component renders the intro +
// tutorial + example; the action-capable panel runs the SAME pure decide() the Go probe runs — no
// I/O, no clock, no LLM — so the verdict on screen matches the probe. SPIKE-scoped + READ-ONLY
// (the wall): the spike writes no truth; EL02+ builds the real back/runtime/besoin package.

export const metadata: Metadata = {
	title:
		"Nécessité du besoin — le besoin doit-il suivre l'architecture ? (AIDOS Workbench)",
	description:
		"Le spike EL01 de nécessité : il PROUVE qu'une boîte texte-libre (la S64 « capturez votre idée » actuelle) est insuffisante pour capturer un besoin d'app. Le MÊME besoin (la demo checkout S46) est capturé deux façons — un BesoinGraph top-down rung-par-rung (product→…→entity) avec porte de forçage, vs un prompt plat — et le backlog d'Ideas produit par le graphe est STRICTEMENT plus riche/ordonné (plus d'Ideas, dépendances résolues, métadonnées typées, ancres). Verdict CALCULÉ (jamais déclaré) contre un plancher déclaré, reproductible (fonction pure, sans LLM). Spike confiné, lecture seule (le mur) ; la leçon est harvestée en Idea DRAFT.",
};

/**
 * /besoin-necessity — the EL01 necessity spike panel. The human clicks COMPARER LES DEUX CAPTURES;
 * the panel runs the pure twin decide() and renders a GO/NO-GO badge, the side-by-side richness
 * table (BesoinGraph vs flat prompt), the strict-dominance deltas, the computed rationale, and the
 * harvested DRAFT candidate-Idea (no mirror, no frozen version — the wall). SPIKE-scoped, READ-ONLY
 * (CLAUDE.md §7 ui-completeness, the wall). Themed on ADR 0010 tokens; bilingual (ADR 0011).
 */
export default async function BesoinNecessityPage() {
	const t = await getTranslations("besoinNecessity");

	const labels = {
		runCta: t("runCta"),
		goBadge: t("goBadge"),
		noGoBadge: t("noGoBadge"),
		pending: t("pending"),
		tableHeading: t("tableHeading"),
		colMetric: t("colMetric"),
		colGraph: t("colGraph"),
		colFlat: t("colFlat"),
		colDelta: t("colDelta"),
		rowIdeas: t("rowIdeas"),
		rowResolved: t("rowResolved"),
		rowTyped: t("rowTyped"),
		rowAnchored: t("rowAnchored"),
		rowOrdered: t("rowOrdered"),
		rowNoEmit: t("rowNoEmit"),
		yes: t("yes"),
		no: t("no"),
		floor: t("floor"),
		rationaleLabel: t("rationaleLabel"),
		harvestHeading: t("harvestHeading"),
		harvestProposes: t("harvestProposes"),
		harvestStatus: t("harvestStatus"),
		harvestNoMirror: t("harvestNoMirror"),
		harvestNoVersion: t("harvestNoVersion"),
		harvestIntentLabel: t("harvestIntentLabel"),
		harvestOqLabel: t("harvestOqLabel"),
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
							{t("spikeBadge")}
						</span>
					</div>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				{/* Tutorial — how to read & drive the screen */}
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
					<BesoinNecessityPanel labels={labels} />
				</div>

				{/* Worked example */}
				<section
					aria-label={t("exampleHeading")}
					data-testid="example"
					className="mt-10 space-y-2 rounded-xl border border-border bg-card p-5"
				>
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("exampleHeading")}
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{t("exampleBody")}
					</p>
				</section>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
