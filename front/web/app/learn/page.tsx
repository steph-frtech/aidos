import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { LearnPanel } from "./LearnPanel";

export const metadata: Metadata = {
	title: "/learn — incident → nouveau miroir → nouvelle dent (AIDOS Workbench)",
	description:
		"S107 (E12) : un RealityMirror (idée draft, provenance=incident) re-rentre à idée→grill→goal ; sur APPROBATION HUMAINE un NOUVEAU miroir (ex. out-of-stock-during-checkout) est attaché, le hash policy/operation CHANGE (mécaniquement), et un RED WAVE CIBLÉ (mirror-first) devient la worklist — « facts change » résolu mécaniquement. Le bump de hash et le red wave sont des fonctions PURES déterministes ; LE MUR : la boucle n'écrit AUCUNE vérité (wroteKernel=false ; l'arête Reality→Kernel toujours refusée), et l'humain rédige le miroir approuvé au /goal — rien n'apprend sa propre fitness.",
};

export const dynamic = "force-dynamic";

/**
 * /learn — « incident → nouveau miroir → nouvelle dent » (S107, app-builder EPIC 12 / E12). La
 * boucle EXTERNE se referme : un RealityMirror (idée draft, provenance=incident, S106) re-rentre à
 * idée→grill→goal ; sur APPROBATION HUMAINE un NOUVEAU miroir est attaché à l'opération/policy, son
 * adresse de contenu (le hash) CHANGE mécaniquement, et un RED WAVE CIBLÉ (mirror-first) devient la
 * worklist.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : UN contrôle lié au moteur réel, avec un toggle
 * exécutable depuis l'écran — (1) fermer la boucle sur le miroir approuvé → le hash de createOrder
 * BUMP → un red wave ciblé devient la worklist ; (2) toggle « re-reflect » → re-attacher un miroir
 * DÉJÀ reflété → AUCUN bump, une wave VIDE (une re-réflexion cosmétique n'est pas une nouvelle
 * dent). Prouvé par l'e2e Playwright. THE WALL (§2) : la boucle n'écrit AUCUNE vérité — l'outcome
 * est une valeur (wroteKernel=false ; l'arête directe Reality→Kernel est toujours refusée) ;
 * l'humain rédige le miroir approuvé au /goal — rien n'apprend sa propre fitness. Ne touche aucune
 * route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function LearnPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("learn");

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
					<LearnPanel activeProjectId={ctx.activeId} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
