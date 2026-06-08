import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { BuildConsolePanel } from "./BuildConsolePanel";

export const metadata: Metadata = {
	title: "Console de build — AIDOS Workbench",
	description:
		"La console de build live (S86, app-builder EPIC 8) : l'agrégation déterministe et en lecture seule de tout ce qu'un humain regarde pendant un build — le diff streamé par tentative, les résultats de senseurs, la consommation du HarnessCostBudget (minutes CI, tokens LLM/goal — S51), l'état du disjoncteur (S83), la timeline AgentRun (S52) et la porte d'approbation humaine (S85). Plus l'enregistrement de phase stable par projet : aidos stable enregistre un nœud DAG quand le verdict S23/S40 passe. L'état streamé ÉGALE l'AgentRun enregistré ; une coupe incohérente est refusée (BlockReason).",
};

/**
 * /build-console — la « Console de build » (S86, app-builder EPIC 8). La console qui STREAME
 * l'état d'un build : vous fournissez l'AgentRun enregistré + l'historique d'itérations + la
 * décision de terminaison + le budget consommé + les approbations en attente, et AIDOS PROJETTE
 * DÉTERMINISTIQUEMENT l'état de la console — en prouvant qu'il ÉGALE l'AgentRun enregistré (la
 * console ne peut jamais inventer une tentative ou un vert). Et l'enregistrement de phase stable
 * par projet : un §43 vert enregistre un nœud DAG ; une coupe incohérente est REFUSÉE.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : les deux ops (projeter l'état / enregistrer
 * une phase) ont chacune un contrôle lié, exécutable depuis l'écran, prouvé par l'e2e Playwright.
 * THE WALL (§2) : les deux sont des read/compute SOUS la ligne — elles n'écrivent AUCUNE vérité ;
 * le nœud DAG est enregistré par le rôle privilégié `aidos` dans un ChangeSet. Ne touche aucune
 * route existante. Thème ADR 0010, bilingue next-intl ADR 0011.
 */
export default async function BuildConsolePage() {
	const t = await getTranslations("buildConsole");

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
					<BuildConsolePanel />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
