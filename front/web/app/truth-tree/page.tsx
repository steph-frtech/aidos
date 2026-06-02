import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TruthTree } from "@/components/TruthTree";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the recursive compositional-truth aggregate is a pure projection in
// lib/truth-tree.ts (mirroring back/kernel/composes), covered by lib/truth-tree.test.ts. This
// Server Component renders the intro + tutorial + example; the tree runs the pure aggregate per
// node in the client component — no I/O, no clock, no rng — so each verdict shown is computed
// exactly as the Go Aggregate computes it.

export const metadata: Metadata = {
	title: "Arbre de vérité — AIDOS Workbench",
	description:
		"Panneau en lecture seule de l'agrégat de vérité compositionnelle d'AIDOS (KRD §108–§112) : le 7e lien composes (un tout contient une partie, pondéré load-bearing|cosmetic, épinglé en version) et la loi de complétude récursive — un composite est VERT seulement si son propre miroir ET tous ses enfants sont VERTS. Un enfant rouge rougit le parent agrégé.",
};

/**
 * /truth-tree — the compositional-truth panel (S18). It renders the KRD §114 composition chain
 * (product → journey → view → control + a cosmetic helptext leaf): each node's own_mirror verdict
 * + its recursive AGGREGATE verdict, each edge's composes weight (load-bearing|cosmetic) and pinned
 * @version, and the parent's declared activation_threshold. A scenario toggle shows all-green ⇒
 * GREEN, a red load-bearing leaf ⇒ RED with a drill-down naming it (the done criterion), and a
 * cosmetic change below threshold ⇒ GREEN.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): it renders the aggregate's verdict via lib/truth-tree.ts;
 * it never writes truth (the wall — truth-writes go via propose → ChangeSet → approval). No
 * headless capability here. Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */
export default async function TruthTreePage() {
	const t = await getTranslations("truthTree");

	const labels = {
		scenarioHeading: t("scenarioHeading"),
		scenarioAllGreen: t("scenarioAllGreen"),
		scenarioRedControl: t("scenarioRedControl"),
		scenarioCosmetic: t("scenarioCosmetic"),
		nodeHeading: t("nodeHeading"),
		ownLabel: t("ownLabel"),
		aggregateLabel: t("aggregateLabel"),
		thresholdLabel: t("thresholdLabel"),
		weightLabel: t("weightLabel"),
		badgeGreen: t("badgeGreen"),
		badgeRed: t("badgeRed"),
		rootHeading: t("rootHeading"),
		rootAggregateLabel: t("rootAggregateLabel"),
		drillHeading: t("drillHeading"),
		drillEmpty: t("drillEmpty"),
		weightLoadBearing: t("weightLoadBearing"),
		weightCosmetic: t("weightCosmetic"),
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

				{/* Tutorial — how to read the screen */}
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

				{/* The tree — the recursive aggregate per node against the toggled own-mirrors */}
				<section aria-label={t("treeHeading")} className="mt-10 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("treeHeading")}
					</h2>
					<TruthTree labels={labels} />
				</section>

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
