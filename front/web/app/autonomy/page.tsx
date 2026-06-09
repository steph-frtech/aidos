import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { AutonomyPanel } from "./AutonomyPanel";

export const metadata: Metadata = {
	title: "L'autonomie A0-A8 — AIDOS Workbench",
	description:
		"FK10 : autonomy_level ∈ {A0..A8} est le 6ᵉ axe de la couche agent — déclaré, fermé, fail-closed. Une action au-dessus du niveau déclaré est refusée (AGENT_AUTONOMY_EXCEEDED) ; A8 n'est jamais permis sur une action critique. La montée d'un cran est CALCULÉE depuis l'historique AgentRun (N runs verts E4+ sans incident), jamais déclarée. LE MUR : l'écran enforce et calcule, il n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /autonomy — « l'autonomie A0-A8 » (FK10, piste FKE).
 * L'autonomie est le 6ᵉ axe de la couche agent (FKE-11/34) : un niveau FERMÉ autonomy_level ∈
 * {A0..A8} DÉCLARÉ par le CoucheAgent, un enforcement FAIL-CLOSED (une action au-dessus du niveau
 * déclaré = un BlockReason AGENT_AUTONOMY_EXCEEDED), et une MONTÉE par preuve — une fonction pure
 * de l'historique AgentRun (N runs verts E4+ sans incident), jamais déclarée. A8 n'est jamais
 * permis sur une action critique (un merge, un deploy, une écriture-vérité irréversible).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : deux contrôles liés aux fonctions pures
 * lib/autonomy — ENFORCER (un niveau déclaré + une action → admis/refusé) et CALCULER LA MONTÉE
 * (un niveau + un historique → le niveau gagné). THE WALL (§2) : l'écran n'écrit AUCUNE vérité —
 * le verdict et le niveau proposé sont des projections ; figer une montée passe par idée → miroir
 * → /goal → approbation. Thème ADR 0010, bilingue 0011.
 */
export default async function AutonomyPage() {
	const t = await getTranslations("autonomy");

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

				<AutonomyPanel />
			</main>
		</div>
	);
}
