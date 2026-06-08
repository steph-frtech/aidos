import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { ArchFitnessPanel } from "./ArchFitnessPanel";

export const metadata: Metadata = {
	title: "Cliquet structurel (arch-fitness) — AIDOS Workbench",
	description:
		"S102 : le second cliquet (KRD §47). L'arch-fitness sur le graphe de dépendances inter-cellules — quatre métriques 'lower-is-better' (violations de frontière, cycles inter-cellules, arêtes inter-BC, complexité max) ne peuvent que TENIR ou S'AMÉLIORER. Une nouvelle violation de frontière ou un cycle inter-cellule ROUGIT le cliquet structurel et BLOQUE LA COUPE, indépendamment des miroirs comportementaux verts. Empêche « tests verts, système pourri ». LE MUR : la base structurelle se déplace via un ChangeSet DRAFT (propose → ChangeSet → approbation).",
};

export const dynamic = "force-dynamic";

/**
 * /arch-fitness — « Cliquet structurel (arch-fitness) » (S102, app-builder EPIC 11, §47). Quatre
 * gestes action-capables (ui-completeness, CLAUDE.md §7) : (1) MESURER les quatre métriques
 * arch-fitness de la coupe propre ; (2) CLIQUETER la coupe propre contre elle-même → TENU ;
 * (3) la PORTE (fault-injection) — injecter une nouvelle violation de frontière OU un cycle
 * inter-cellule : le cliquet structurel ROUGIT (BRISÉ) et BLOQUE LA COUPE, indépendamment des
 * miroirs comportementaux verts (la done-criterion) ; (4) PROPOSER la base structurelle en
 * ChangeSet DRAFT (le seul moyen légal de déplacer une vérité Kernel — le mur). Ne touche aucune
 * route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function ArchFitnessPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("archFitness");

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
					<ArchFitnessPanel activeProjectId={ctx.activeId} />
				</div>
			</main>
		</div>
	);
}
