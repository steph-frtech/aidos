import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { GridPanel } from "./GridPanel";

export const metadata: Metadata = {
	title: "La grille niveau × facette (les deux axes) — AIDOS Workbench",
	description:
		"FK03 : toute vérité porte DEUX coordonnées — le niveau (la verticale produit→entité, l'axe LATÉRAL couplant) × la facette (la nature, FK02, l'axe ORTHOGONAL séparant) — et résout à une CELLULE déterministe que le ContextRouter expose. La verticale COUPLE : un changement bas marque les rungs source au-dessus. Les facettes N'INTERAGISSENT PAS : un changement sur une facette ne touche jamais une autre. LE MUR : la grille n'écrit aucune vérité — une cellule est une coordonnée, jamais posée à la main.",
};

export const dynamic = "force-dynamic";

/**
 * /grid — « la grille niveau × facette » (FK03, piste FKE).
 * Toute vérité porte DEUX coordonnées (FKE-1.4) : le NIVEAU (la verticale produit→entité —
 * l'axe LATÉRAL, COUPLANT) × la FACETTE (la nature de la vérité, FK02 — l'axe ORTHOGONAL,
 * SÉPARANT) — et résout à une CELLULE déterministe. La verticale COUPLE : un changement bas
 * (entité) marque les rungs SOURCE au-dessus (opération…produit). Les facettes ne s'influencent
 * pas : un changement sur la sécurité (S) ne touche jamais le budget (B).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : un contrôle RÉSOUDRE & MARQUER lié au moteur
 * pur lib/grid, exécutable depuis l'écran (choisir un rung + une facette → la cellule résolue +
 * son adresse, les cellules stales au-dessus à facette constante, les facettes intactes),
 * prouvé par l'e2e Playwright. THE WALL (§2) : la grille n'écrit AUCUNE vérité — une cellule est
 * une coordonnée. Ne touche aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function GridPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("grid");

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
					<GridPanel activeProjectId={ctx.activeId} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
