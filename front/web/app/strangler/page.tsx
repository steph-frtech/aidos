import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { StranglerPanel } from "./StranglerPanel";

export const metadata: Metadata = {
	title:
		"Strangler-fig — absorber le legacy avec des tests de caractérisation (AIDOS Workbench)",
	description:
		"S104 (§50) taille une cellule autour du legacy, la GÈLE avec des miroirs de caractérisation auto-générés sur son comportement courant (input→output, bug-for-bug), publie son contrat, puis laisse la boucle-build refactorer DANS la cellule gelée. Les miroirs de caractérisation restent VERTS à travers un refactor interne et le contrat publié est honoré ; un changement de comportement (drift) ou un contrat cassé est REFUSÉ. Déterministe — la génération de miroirs est du code, jamais un LLM. LE MUR : carve/freeze/refactor n'écrivent aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /strangler — « absorption de legacy par strangler-fig » (S104, app-builder EPIC 11, §50).
 * Le fig grandit autour du host : on taille une cellule autour du legacy, on gèle son
 * comportement courant avec des miroirs de caractérisation auto-générés, on publie son contrat,
 * puis on laisse la boucle-build refactorer DANS la cellule gelée — rien de ce que faisait le
 * legacy n'est silencieusement perdu.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : DEUX contrôles liés au moteur réel,
 * exécutables depuis l'écran — (1) DÉMARRER une cellule strangler (carve + freeze), (2) lancer
 * un REFACTOR dans la cellule gelée, avec des toggles « casser le comportement » (drift) et
 * « casser le contrat ». Prouvé par l'e2e Playwright. THE WALL (§2) : carve/freeze/refactor
 * n'écrivent AUCUNE vérité — la cellule + ses miroirs sont une valeur (le ChangeSet les propose
 * au-dessus de la ligne). Ne touche aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function StranglerPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("strangler");

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
					<StranglerPanel activeProjectId={ctx.activeId} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
