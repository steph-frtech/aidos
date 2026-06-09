import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { ConsciencePanel } from "./ConsciencePanel";

export const metadata: Metadata = {
	title: "La conscience — AIDOS Workbench",
	description:
		"FK09 : la conscience compose les verdicts des juges EXISTANTS (runner, complétude, facettes, SemanticDiff, RealityMirror, senseurs, ledger) en un rapport par kernel + les decision cards (§FKE-31). AUCUN nouveau juge — elle lit des verdicts sourcés et les route. Une divergence produit sa decision card actionnable ; X reste advisory. Le juge est un CALCUL. LE MUR : l'écran réconcilie, il n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /conscience — « la conscience » (FK09, piste FKE).
 * La conscience est un AGRÉGATEUR DÉTERMINISTE (KRD FKE-6.3) : une fonction pure qui compose les
 * verdicts des juges EXISTANTS (runner de miroirs, complétude/monstre, facettes S/R/V/M/X,
 * SemanticDiff, RealityMirror, senseurs, ledger) en un ConsciousnessReport par kernel + les
 * decision cards (§FKE-31). AUCUN nouveau juge — un organe-évaluateur actif serait « le second
 * agent qui valide » que le Tome refuse comme preuve (§8). Elle LIT des verdicts sourcés et les
 * ROUTE ; chaque ligne du rapport porte le juge qui l'a produite.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : un contrôle RÉCONCILIER lié au moteur pur
 * lib/conscience — choisir un scénario, exécuter l'agrégateur, voir les paires réconciliées + les
 * decision cards + le verdict global (aligné/drift), plus la preuve de déterminisme. THE WALL
 * (§2) : l'écran n'écrit AUCUNE vérité — le rapport et les cartes sont des projections ; agir sur
 * une carte passe par idea → mirror → /goal → décision humaine. Thème ADR 0010, bilingue 0011.
 */
export default async function ConsciencePage() {
	const t = await getTranslations("conscience");

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

				<ConsciencePanel />
			</main>
		</div>
	);
}
