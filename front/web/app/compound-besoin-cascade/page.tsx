import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BesoinCascadePanel } from "@/components/BesoinCascadePanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: EL08 is the anchor CASCADE + the MEASURED constraint inheritance (the compound
// PROVEN). AnchorsAbove(graph, level) = the frozen (resolved) rungs strictly above (the grounding the
// rung below reads). Descend(graph, fromLevel) opens fromLevel+1 ONLY when CanDescend.enough — a
// premature descent is REFUSED (CANNOT_DESCEND_LEVEL_NOT_RIGHTSIZED). ShrinkOptionSpaceCascade
// measures |OptionSpace| BEFORE vs AFTER the frozen anchors: STRICTLY smaller under a frozen anchor
// (the compound), 0 without (compounding failed). Reopening a frozen anchor REQUIRES a ChangeSet
// (BESOIN_ANCHOR_OVERWRITE, anti-overwrite §9). Computed by lib/besoin-cascade.ts (the byte-equivalent
// twin of back/runtime/besoin/cascade.go), covered by lib/besoin-cascade.test.ts (vitest + fast-check).
// ABOVE the wall: reads the node set, writes no truth.

export const metadata: Metadata = {
	title:
		"Cascade des ancres — l'héritage de contrainte mesuré (AIDOS Workbench)",
	description:
		"EL08 : l'ancre cascade AnchorsAbove + Descend (gated par CanDescend) + l'héritage de contrainte mesuré ShrinkOptionSpace (le compound prouvé). Une descente prématurée est refusée (CANNOT_DESCEND_LEVEL_NOT_RIGHTSIZED) ; |OptionSpace| est STRICTEMENT plus petit sous une ancre figée ; rouvrir une ancre figée exige un ChangeSet (BESOIN_ANCHOR_OVERWRITE, anti-overwrite §9). La cascade ne lit que le BesoinGraph, n'écrit aucune vérité.",
};

/**
 * /compound-besoin-cascade — the EL08 panel. The human EXECUTES the cascade FROM THE SCREEN:
 * "Lister les ancres" (anchorsAbove), "Descendre" (descend, refused if not right-sized), "Mesurer le
 * rétrécissement" (shrinkOptionSpaceCascade → Before/After/Shrink), "Rouvrir l'ancre" with a ChangeSet
 * token (refused without one). ui-completeness (CLAUDE.md §7): no headless capability. ABOVE the wall.
 * Themed (ADR 0010), bilingual (ADR 0011).
 */
export default async function BesoinCascadePage() {
	const t = await getTranslations("besoinCascade");

	const labels = {
		anchorsCta: t("anchorsCta"),
		descendCta: t("descendCta"),
		shrinkCta: t("shrinkCta"),
		reopenCta: t("reopenCta"),
		resetCta: t("resetCta"),
		caseLabel: t("caseLabel"),
		caseFrozenNarrowing: t("caseFrozenNarrowing"),
		caseFrozenVacant: t("caseFrozenVacant"),
		caseDraftingProduct: t("caseDraftingProduct"),
		caseOperationLeaf: t("caseOperationLeaf"),
		anchorsHeading: t("anchorsHeading"),
		descendHeading: t("descendHeading"),
		descendOk: t("descendOk"),
		descendRefused: t("descendRefused"),
		openedLabel: t("openedLabel"),
		shrinkHeading: t("shrinkHeading"),
		beforeLabel: t("beforeLabel"),
		afterLabel: t("afterLabel"),
		shrinkLabel: t("shrinkLabel"),
		shrinkStrict: t("shrinkStrict"),
		shrinkNone: t("shrinkNone"),
		shrinkSentinel: t("shrinkSentinel"),
		reopenHeading: t("reopenHeading"),
		changeSetLabel: t("changeSetLabel"),
		reopenOk: t("reopenOk"),
		reopenRefused: t("reopenRefused"),
		none: t("none"),
		pending: t("pending"),
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
					<BesoinCascadePanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
