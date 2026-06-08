import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { AppRegeneratorPanel } from "./AppRegeneratorPanel";

export const metadata: Metadata = {
	title: "Régénérer mon app — AIDOS Workbench",
	description:
		"Une action liée au Kernel du user qui exécute les émetteurs déterministes pour TOUTES les entités/operations (sync+async)/controls/blobs du projet vers la cible d'émission ; détection de projection périmée par source-hash. La régénération est byte-stable et REFUSE si un fichier généré est hand-edité (GEN_FILE_HAND_EDITED). LE MUR : régénérer n'écrit aucune vérité (gen/ est une projection).",
};

export const dynamic = "force-dynamic";

/**
 * /app-regenerator — « Régénérer mon app » (S78, app-builder EPIC 6).
 * Une action Runtime, liée au Kernel du user, qui ré-émet TOUTE l'app du projet (entités +
 * relations + operations sync+async + controls + blobs) vers sa cible d'émission en UNE passe
 * déterministe, classe ce qui change (périmé par source-hash / nouveau / inchangé), et REFUSE
 * si un fichier émis a été édité à la main — gen/ est une projection régénérable, jamais
 * écrasée en silence (§9). Réutilisée par preview/deploy (E10 : S94/S96/S98).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : un contrôle lié au moteur, exécutable depuis
 * l'écran (lancer la régénération sur un arbre fidèle → un Plan ; ou sur un arbre hand-edité →
 * refus GEN_FILE_HAND_EDITED), prouvé par l'e2e Playwright. THE WALL (§2) : régénérer n'écrit
 * AUCUNE vérité. Ne touche aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function AppRegeneratorPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("appRegenerator");

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
					<AppRegeneratorPanel activeProjectId={ctx.activeId} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
