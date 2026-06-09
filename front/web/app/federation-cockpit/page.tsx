import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { CockpitPanel } from "./CockpitPanel";

export const metadata: Metadata = {
	title:
		"Cockpit de fédération — graphe de cellules, deux ratchets, red wave (AIDOS Workbench)",
	description:
		"S105 (§50) : le cockpit de fédération. Un graphe de cellules montrant les cellules, les contrats inter-cellules, le statut des DEUX ratchets (S100 comportemental par cellule + S102 structurel sur la coupe), la stabilité locale vs globale, et le red wave fan-out. Exécutable : démarrer une cellule, tracer un contrat, voir le red wave global. Le done-criterion : une cellule montre une coupe locale verte et SHIP pendant qu'une voisine est encore ROUGE (§43 fractal). Déterministe ; LE MUR : composer n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /federation-cockpit — « cockpit de fédération » (S105, app-builder EPIC 11, §50). Le seul vrai
 * tableau de bord de la grandeur : la fédération de cellules vue d'un coup — le graphe, les
 * contrats, les DEUX ratchets, la stabilité locale vs globale, le red wave fan-out.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : UN contrôle lié au moteur réel, avec DEUX
 * toggles exécutables depuis l'écran — (1) « fire wave » fait déferler le red wave transverse
 * (rougit payment ; order reste vert et SHIP) ; (2) « break structure » nourrit une coupe
 * régressée (un nouvel arc inter-cellule non contracté) → le SECOND ratchet passe BROKEN et la
 * fédération n'est plus globalement stable, même avec des cellules vertes. Prouvé par l'e2e
 * Playwright. THE WALL (§2) : composer n'écrit AUCUNE vérité — le snapshot est une valeur.
 * Ne touche aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function FederationCockpitPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("federationCockpit");

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
					<CockpitPanel activeProjectId={ctx.activeId} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
