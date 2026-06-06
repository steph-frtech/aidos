import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BesoinThresholdsPanel } from "@/components/BesoinThresholdsPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: EL06 declares TWO above-the-wall, never-learned capabilities (CLAUDE.md §8).
// (1) BesoinThresholds — ONE content-addressed record of every gate threshold (the product's ≤5
// scenarios; the per-rung required fields sourced from the grammar, no second copy), read by EL07
// (CanDescend) and EL11 (the Stop hook) so a threshold cannot drift between callers. (2) OptionSpace
// — the enumerable declared metric per adjacent rung pair: |OptionSpace| is a pure integer count over
// a closed set, never an LLM judgment; a non-enumerable pair is a declared OpenQuestion (size -1),
// never fabricated to 0. The verdicts are computed by lib/besoin-thresholds.ts (the byte-for-byte
// twin of back/runtime/besoin/thresholds.go — the content hash is byte-identical), covered by
// lib/besoin-thresholds.test.ts (vitest + fast-check). ABOVE the wall: declared config, no truth.

export const metadata: Metadata = {
	title:
		"BesoinThresholds & OptionSpace — seuils déclarés + métrique énumérable (AIDOS Workbench)",
	description:
		"EL06 : le config déclaré BesoinThresholds (record content-adressé above-the-line, jamais appris — le ≤5 scénarios du product, les champs requis par rung sourcés de la grammaire) lu par EL07 et EL11 (aucun seuil inliné en double) ; et la métrique OptionSpace énumérable par paire de rungs adjacents (l'ensemble clos comptable des choix que le rung inférieur admet). |OptionSpace| = comptage pur, jamais un jugement LLM ; une paire non-énumérable est une OpenQuestion déclarée (taille -1), jamais fabriquée à 0. Au-dessus du mur, aucune écriture vérité.",
};

/**
 * /compound-besoin-thresholds — the EL06 panel. The human EXECUTES the declared config FROM THE
 * SCREEN: load the thresholds record + its content-addressed hash, prove the single source (no second
 * required-fields copy), and count |OptionSpace(L→L+1)| (positive for enumerable, -1 OpenQuestion for
 * non-enumerable — never a fabricated 0). ui-completeness (CLAUDE.md §7): no headless capability.
 * ABOVE the wall, read-only. Themed (ADR 0010), bilingual (ADR 0011).
 */
export default async function BesoinThresholdsPage() {
	const t = await getTranslations("besoinThresholds");

	const labels = {
		loadCta: t("loadCta"),
		sourceCta: t("sourceCta"),
		countCta: t("countCta"),
		resetCta: t("resetCta"),
		pairLabel: t("pairLabel"),
		thresholdsHeading: t("thresholdsHeading"),
		maxScenariosLabel: t("maxScenariosLabel"),
		hashLabel: t("hashLabel"),
		requiredHeading: t("requiredHeading"),
		colLevel: t("colLevel"),
		colFields: t("colFields"),
		sourceHeading: t("sourceHeading"),
		sourceOk: t("sourceOk"),
		sourceFail: t("sourceFail"),
		optionSpaceHeading: t("optionSpaceHeading"),
		colPair: t("colPair"),
		colSize: t("colSize"),
		colChoices: t("colChoices"),
		enumerable: t("enumerable"),
		openQuestion: t("openQuestion"),
		countHeading: t("countHeading"),
		countEnumerable: t("countEnumerable"),
		countOpenQuestion: t("countOpenQuestion"),
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
					<BesoinThresholdsPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
