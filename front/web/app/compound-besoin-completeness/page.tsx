import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BesoinCompletenessPanel } from "@/components/BesoinCompletenessPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: EL09 is the completeness law applied to the BESOIN. BesoinCompleteness(graph,
// mirrors) → { complete, monsters[] } — every `resolved` node must have its right-form level-mirror +
// live metadata, and no level-mirror may dangle (orphan). Breaking the node↔mirror link in EITHER
// direction makes a monster appear (NEED_LEVEL_WITHOUT_MIRROR / ORPHAN_NEED_MIRROR). Monster detection
// is COUNTING + MATCHING (a pure function), never an LLM. Computed by lib/besoin-completeness.ts (the
// byte-equivalent twin of back/runtime/besoin/completeness.go), covered by lib/besoin-completeness.test.ts
// (vitest + fast-check). ABOVE the wall: reads the node set + a NEED-side level-mirror set, writes no
// real mirror and no truth (§2).

export const metadata: Metadata = {
	title:
		"Complétude du besoin — la loi de complétude appliquée au BESOIN (AIDOS Workbench)",
	description:
		"EL09 : BesoinCompleteness(graph) → { complete, monsters[] }, le miroir de la loi de complétude pour le BESOIN. Un niveau `resolved` sans son miroir-de-niveau = monstre (NEED_LEVEL_WITHOUT_MIRROR) ; un miroir-de-niveau ne reflétant aucun nœud = orphelin (ORPHAN_NEED_MIRROR). Casser le lien nœud↔miroir-de-niveau (dans les deux sens) vire le détecteur au rouge. Détection = fonction pure ; aucun miroir réel écrit ; above-the-wall.",
};

/**
 * /compound-besoin-completeness — the EL09 panel. The human EXECUTES the completeness law FROM THE
 * SCREEN: "Vérifier la complétude" (besoinCompleteness), "Casser le lien (retirer le miroir)" and
 * "Casser le lien (miroir orphelin)" (the fault-injection both directions), "Réinitialiser".
 * ui-completeness (CLAUDE.md §7): no headless capability. ABOVE the wall: writes no real mirror.
 * Themed (ADR 0010), bilingual (ADR 0011).
 */
export default async function BesoinCompletenessPage() {
	const t = await getTranslations("besoinCompleteness");

	const labels = {
		checkCta: t("checkCta"),
		breakMirrorCta: t("breakMirrorCta"),
		orphanCta: t("orphanCta"),
		resetCta: t("resetCta"),
		caseLabel: t("caseLabel"),
		caseIntact: t("caseIntact"),
		mirrorsHeading: t("mirrorsHeading"),
		verdictHeading: t("verdictHeading"),
		complete: t("complete"),
		incomplete: t("incomplete"),
		monstersHeading: t("monstersHeading"),
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
					<BesoinCompletenessPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
