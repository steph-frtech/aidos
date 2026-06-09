import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { TruthLevelPanel } from "./TruthLevelPanel";

export const metadata: Metadata = {
	title: "Les 7 niveaux de vérité (Raw→Reconciled) — AIDOS Workbench",
	description:
		"FK01 : chaque vérité porte son niveau (1 raw → 7 reconciled, FKE-5), STOCKÉ sur le record mais écrit UNIQUEMENT par la transition déterministe (idea/changeset/miroir/evidence/conscience) — avec un miroir de parité stored == computed (divergence = rouge). « Done is computed » : le stockage est un cache prouvé du calcul. LE MUR : la transition n'écrit aucune vérité à la main.",
};

export const dynamic = "force-dynamic";

/**
 * /truth-level — « les 7 niveaux de vérité » (FK01, piste FKE).
 * Les 7 niveaux Raw→Reconciled (FKE-5) sont STOCKÉS sur le record mais écrits UNIQUEMENT
 * par la transition déterministe (fonction pure totale des portes idea/changeset/miroir/
 * evidence/conscience). Un miroir de parité prouve stored == computed (toute divergence = rouge) :
 * le stockage est un cache prouvé du calcul, pas une seconde source.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : un contrôle FILTRE PAR NIVEAU lié au moteur,
 * exécutable depuis l'écran (choisir un niveau → voir les records de ce niveau + leur badge de
 * parité 🟢/🔴), prouvé par l'e2e Playwright. THE WALL (§2) : la transition n'écrit AUCUNE vérité
 * à la main. Ne touche aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function TruthLevelPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("truthLevel");

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
					<TruthLevelPanel activeProjectId={ctx.activeId} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
