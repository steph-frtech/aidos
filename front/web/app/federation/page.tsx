import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { FederationPanel } from "./FederationPanel";

export const metadata: Metadata = {
	title:
		"Fédération transverse — invariants de cellules + red wave global (AIDOS Workbench)",
	description:
		"S103 (§51) câble S48 GlobalInvariant / S49 SagaInvariant / S50 TemporalInvariant sur de VRAIES cellules multiples (S100). Une saga (payment_captured ⇒ order_confirmed ∨ compensation) tient sur deux cellules ; casser une jambe déclenche la compensation. Une policy globale exprimée UNE FOIS fan-out vers une RedWorkQueue par cellule — les cellules non affectées restent VERTES. Déterministe ; le red wave déploie globalement, chaque cellule réconcilie localement. LE MUR : composer n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /federation — « composition des invariants de fédération + changement transverse » (S103,
 * app-builder EPIC 11, §51). Le red wave déploie GLOBALEMENT (une policy → fan-out à travers la
 * fédération), chaque cellule réconcilie LOCALEMENT (sa propre RedWorkQueue, son propre cliquet).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : DEUX contrôles liés au moteur réel, exécutables
 * depuis l'écran — (1) lancer la saga sur deux vraies cellules, avec un toggle « casser une jambe »
 * qui déclenche la compensation ; (2) tirer la policy globale qui fan-out vers une RedWorkQueue par
 * cellule. Prouvé par l'e2e Playwright. THE WALL (§2) : composer n'écrit AUCUNE vérité — les lignes
 * de RedWorkQueue sont une projection (le hook S22 fait l'INSERT sous la ligne d'eau). Ne touche
 * aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function FederationPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("federation");

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
					<FederationPanel activeProjectId={ctx.activeId} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
