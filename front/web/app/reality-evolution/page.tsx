import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { CockpitPanel } from "./CockpitPanel";

export const metadata: Metadata = {
	title:
		"Cockpit réalité & évolution par projet — incident → miroir appris → red wave (AIDOS Workbench)",
	description:
		"S109 (E12) : le COCKPIT par projet qui compose les trois moteurs déjà construits — l'ingestion incident→idée (S106), la porte d'approbation /learn (S107) et l'archive QD des élites (S108) — en UN écran action-capable. Le parcours canonique exécutable depuis l'écran : INGÉRER un incident → APPROUVER le miroir appris → VOIR le red wave APPARAÎTRE. LE MUR : le cockpit n'écrit AUCUNE vérité (wroteKernel/writesTruth=false ; l'arête Reality→Kernel toujours refusée) ; l'humain rédige le miroir approuvé et gèle une promotion au /goal — rien n'apprend sa propre fitness. Tout est déterministe : le juge est le miroir, jamais un LLM.",
};

export const dynamic = "force-dynamic";

/**
 * /reality-evolution — le COCKPIT « réalité & évolution par projet » (S109, app-builder EPIC 12 /
 * E12, KRD §53/§62/§64/§66/§67/§98). Il n'invente AUCUN mécanisme : il COMPOSE en un seul écran les
 * trois moteurs déjà construits — l'ingestion télémétrie→RealityMirror→idée draft (S106), la porte
 * d'approbation /learn qui referme la boucle externe (S107), et l'archive QD des élites par projet
 * (S108).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : des contrôles liés aux moteurs RÉELS (les twins
 * purs lib/reality-evolution), exécutables depuis l'écran — (1) le parcours canonique : INGÉRER un
 * incident → APPROUVER le miroir appris → le hash de createOrder BUMP → un red wave ciblé APPARAÎT
 * (le done-critère §S109) ; (2) promouvoir une élite QD → une PROPOSITION avec l'autorité
 * (writesTruth=false), refusée sans. Prouvé par l'e2e Playwright. THE WALL (§2) : le cockpit n'écrit
 * AUCUNE vérité — l'humain rédige le miroir approuvé et gèle la promotion au /goal ; rien n'apprend
 * sa propre fitness. Ne touche aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function RealityEvolutionPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("realityEvolution");

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
					<CockpitPanel activeProjectId={ctx.activeId} />
				</div>
			</main>
		</div>
	);
}
