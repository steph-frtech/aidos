import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BesoinMirrorformPanel } from "@/components/BesoinMirrorformPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// /compound-besoin-mirrorform — EL10. The NEW table LevelMirrorForm(level) → MirrorForm (the expected
// mirror form per rung, for the above-the-wall rungs derive-mirror does NOT cover: product/journey/view)
// + the NEW deterministic view/journey schema validators (no Go pkg backs view/journey). The table is
// TOTAL over the 9 grammar rungs; for the 5 derive-mirror-covered rungs its output ≡ derive-mirror (no
// fork). Computed by lib/besoin-completeness.ts (the byte-equivalent twin of mirrorform.go +
// validators.go). ABOVE the wall: annexes a form / reads a body, writes no mirror and no truth (§2).

export const metadata: Metadata = {
	title:
		"Forme de miroir par niveau — LevelMirrorForm + validateurs view/journey (AIDOS Workbench)",
	description:
		"EL10 : la table neuve LevelMirrorForm(level) → MirrorForm (forme attendue par rung, pour product/journey/view que derive-mirror ne couvre pas) + les validateurs déterministes neufs view (but+zones+données nommées) et journey (Gherkin parsable). Totale sur les 8 rungs ; ≡ derive-mirror pour les 5 couverts ; un view sans zones ou un journey non-Gherkin échoue. Fonctions pures ; aucun miroir écrit ; above-the-wall.",
};

/**
 * /compound-besoin-mirrorform — the EL10 panel. The human EXECUTES the mirror-form table + the new
 * view/journey validators FROM THE SCREEN: "Valider la vue" / "Valider le journey" (the new
 * validators), "Casser les zones" / "Casser le Gherkin" (the fault-injection both directions),
 * "Réinitialiser". ui-completeness (CLAUDE.md §7): no headless capability. ABOVE the wall: writes no
 * mirror. Themed (ADR 0010), bilingual (ADR 0011).
 */
export default async function BesoinMirrorformPage() {
	const t = await getTranslations("besoinMirrorform");

	const labels = {
		tableHeading: t("tableHeading"),
		rungCol: t("rungCol"),
		formCol: t("formCol"),
		sourceCol: t("sourceCol"),
		derived: t("derived"),
		declared: t("declared"),
		viewHeading: t("viewHeading"),
		journeyHeading: t("journeyHeading"),
		validateViewCta: t("validateViewCta"),
		validateJourneyCta: t("validateJourneyCta"),
		breakZonesCta: t("breakZonesCta"),
		breakGherkinCta: t("breakGherkinCta"),
		resetCta: t("resetCta"),
		valid: t("valid"),
		invalid: t("invalid"),
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
					<BesoinMirrorformPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
