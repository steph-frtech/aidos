import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { MirrorLibraryPanel } from "./MirrorLibraryPanel";

export const metadata: Metadata = {
	title: "Librairie de miroirs par projet — AIDOS Workbench",
	description:
		"Les miroirs du user listés par app avec leur liveness, plus la complétude/détection de monstre scopée au projet (S70, KRD §29/§33/§34) : une vérité sans miroir vivant, un miroir orphelin — DANS le projet. La portée n'est pas cosmétique : un miroir inter-projet est un orphelin dans le projet (un monstre que la coupe globale aurait caché). LE MUR : la détection LIT une projection et calcule un verdict, elle n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /mirror-library — « la librairie de miroirs par projet » (S70, app-builder EPIC 5). Vos miroirs
 * listés PAR APP avec leur liveness, et la loi de complétude SCOPÉE à un projet : un monstre (vérité
 * sans miroir vivant ; miroir orphelin) est chassé DANS le projet seul. La portée change le verdict —
 * un miroir d'un projet A qui reflète une couche d'un projet B est un ORPHELIN dans A (un monstre que
 * la coupe globale aurait caché).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : un contrôle lié au moteur, exécutable depuis l'écran
 * (choisir un projet → exécuter la loi scopée), prouvé par l'e2e Playwright. THE WALL (§2) : exécuter
 * n'écrit AUCUNE vérité — S70 ne fait que LIRE une projection mirrors ⋈ kernel et calculer un verdict ;
 * l'isolation par projet est le mur RLS (S55), rendue explicite comme une portée. Ne touche aucune
 * route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function MirrorLibraryPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("mirrorLibrary");

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
					<MirrorLibraryPanel activeProjectId={ctx.activeId} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
