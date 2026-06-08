import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { BuildLoopPanel } from "./BuildLoopPanel";

export const metadata: Metadata = {
	title: "Boucle de build — AIDOS Workbench",
	description:
		"La console de la boucle de build (S83) : l'agent exécutant prend un red set → compile un ContextPack (algorithme S33) → appelle le LLM → écrit le code dans le bac à sable (S82) → exécute les miroirs affectés → itère red→green → enregistre l'AgentRun (S52), et S'ARRÊTE HONNÊTEMENT dès que le Stop non-gameable passe OU qu'un build qui dépense sans avancer est détecté (BUILD_LOOP_NO_PROGRESS), câblé au HarnessCostBudget (S51). La terminaison est une FONCTION PURE DE L'HISTORIQUE — jamais un jugement LLM.",
};

/**
 * /build-loop — la « Boucle de build » (S83, app-builder EPIC 8). La console qui EXÉCUTE
 * la décision de terminaison de l'agent exécutant : vous fournissez le red set, les
 * verdicts de senseurs vivants, les conditions du Stop non-gameable (vert antérieur /
 * mutation / plancher / monstres), l'historique d'itérations et le budget déclaré, et AIDOS
 * CALCULE DÉTERMINISTIQUEMENT si la boucle termine VERT, S'ARRÊTE (no_progress) ou CONTINUE.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : l'op de terminaison a un contrôle lié,
 * exécutable depuis l'écran, prouvé par l'e2e Playwright. THE WALL (§2) : la décision est un
 * read/compute SOUS la ligne — elle n'écrit AUCUNE vérité ; l'AgentRun ride la voie INSERT
 * sous la ligne (S52) ; une vérité proposée passe par propose→ChangeSet (S85). Ne touche
 * aucune route existante. Thème ADR 0010, bilingue next-intl ADR 0011.
 */
export default async function BuildLoopPage() {
	const t = await getTranslations("buildLoop");

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
					<BuildLoopPanel />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
