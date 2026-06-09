import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { FacetsPanel } from "./FacetsPanel";

export const metadata: Metadata = {
	title: "Les 8 facettes déclarées (F/I/S/B/R/V/M/X) — AIDOS Workbench",
	description:
		"FK02 : un kernel déclare quelles LENTILLES il instancie (fonctionnel F · invariants I · sécurité S · budgets B · fiabilité R · évolutivité V · maintenabilité M · expérience X), COLLAPSIBLE. F est toujours présente (incompressible : intention + paire de preuve). La validation refuse un kernel sans facette fonctionnelle, une facette vide, ou une facette déclarée sans sa paire de preuve (un monstre ; X soft est advisory). LE MUR : la validation n'écrit aucune vérité à la main.",
};

export const dynamic = "force-dynamic";

/**
 * /facets — « les 8 facettes déclarées » (FK02, piste FKE).
 * Un kernel déclare quelles LENTILLES il instancie (F/I/S/B/R/V/M/X, FKE-1.3), COLLAPSIBLE :
 * il ne porte que les facettes de sa nature de vérité. La FONCTIONNELLE (F) est toujours
 * présente — l'incompressible = intention (s1) + paire de preuve (s4↔s5/s6). La validation
 * refuse un kernel sans F, une facette vide, ou une facette déclarée sans sa paire (un
 * MONSTRE ; X soft §13.6 reste advisory). La signature de facette est content-adressée
 * (même facettes → même hash, indépendant de l'ordre).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : un contrôle FILTRE PAR FACETTE lié au
 * moteur, exécutable depuis l'écran (choisir une facette → voir les kernels qui l'instancient
 * + leur badge de validité 🟢/🔴), prouvé par l'e2e Playwright. THE WALL (§2) : la validation
 * n'écrit AUCUNE vérité à la main. Ne touche aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function FacetsPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("facets");

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
					<FacetsPanel activeProjectId={ctx.activeId} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
