import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { KernelGardenPanel } from "./KernelGardenPanel";

export const metadata: Metadata = {
	title:
		"Jardinage du KernelDebt + /trim par projet — surfacer la dette, proposer des réductions sans rien supprimer (AIDOS Workbench)",
	description:
		"S112 (§82.4) : le jardinage de la dette du noyau PAR PROJET. Il surface les CINQ pourritures de la tranche d'un projet — miroir orphelin, fixture périmée, mutant survivant (repris de S41), LIVENESS MORTE (un miroir déclaré mort qui épingle encore une vérité vivante) et CONTRAINTE À FAIBLE VALEUR (une cellule au-dessus de son HarnessCostBudget sans ValueCase justifiée, repris de S51). /trim PROPOSE des réductions — il NE SUPPRIME RIEN : accepter une proposition OUVRE une idée → miroir → /goal → approbation humaine (la seule porte). Le scan est isolé par projet : le projet A ne voit jamais la dette du projet B. LE MUR (§2) : le cockpit n'écrit AUCUNE vérité ; le juge est déterministe, jamais un LLM.",
};

export const dynamic = "force-dynamic";

/**
 * /kernel-garden — le cockpit « jardinage du KernelDebt + /trim par projet » (S112,
 * app-builder, KRD §82.4). Il COMPOSE des moteurs déjà verts : le diagnostic KernelDebt
 * (debt.Scan, S41), l'évaluateur §66.3 (economics.Evaluate, S51) et le compteur de coût
 * (costmeter, S111) — pour surfacer les cinq pourritures de la tranche d'UN projet et
 * proposer un /trim qui ne supprime rien.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : trois contrôles liés au twin pur RÉEL
 * (lib/kernel-garden), exécutables depuis l'écran — (1) SÉLECTIONNER un projet (scope le
 * scan, §82.4) ; (2) JARDINER → le registre de dette + le plan de trim ; (3) ACCEPTER une
 * proposition → une OpenIdea qui OUVRE TOUJOURS une idée et NE SUPPRIME JAMAIS. Prouvé par
 * l'e2e Playwright. THE WALL (§2) : le cockpit n'écrit AUCUNE vérité ; agir sur une
 * proposition passe par idée → miroir → /goal → approbation. Ne touche aucune route
 * existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function KernelGardenPage() {
	const t = await getTranslations("kernelGarden");

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
					<p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				<div className="mt-10">
					<KernelGardenPanel />
				</div>
			</main>
		</div>
	);
}
