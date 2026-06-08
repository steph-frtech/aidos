import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { EntityModelerPanel } from "./EntityModelerPanel";

export const metadata: Metadata = {
	title: "Modeleur entité/relation — AIDOS Workbench",
	description:
		"Modéliser sur un canvas un schéma entité/relation (attributs scalaires + identifiants, relations 1-1 / 1-N / N-N) et le PROPOSER comme source Kernel project-scopée via propose → ChangeSet → approbation — jamais d'écriture-vérité directe depuis l'écran (le mur). L'édition concurrente du canvas (présence/lock/CRDT) ne s'écrase pas. Un reject laisse le Kernel intact (S75).",
};

export const dynamic = "force-dynamic";

/**
 * /entity-modeler — « le modeleur entité/relation (canvas) + concurrence draft-level » (S75,
 * app-builder EPIC 6). On modélise des entités (attributs scalaires + identifiants) et des
 * relations sur un canvas, puis on PROPOSE le brouillon comme source Kernel project-scopée
 * via propose → ChangeSet → approbation. Le modeleur produit un ChangeSet `proposed` (DRAFT).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : deux contrôles liés au moteur, exécutables
 * depuis l'écran — (1) modéliser Customer↔Order + proposer (ChangeSet DRAFT + entity-map),
 * (2) deux éditeurs simultanés du canvas qui ne s'écrasent pas (merge CRDT). Prouvés par
 * l'e2e Playwright. THE WALL (§2) : proposer n'écrit AUCUNE vérité — le ChangeSet reste
 * DRAFT ; seul le CLI `aidos`, après approbation humaine, l'applique ; un reject laisse le
 * Kernel intact. Ne touche aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function EntityModelerPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("entityModeler");

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
					<EntityModelerPanel activeProjectId={ctx.activeId} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
