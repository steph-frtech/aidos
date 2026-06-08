import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { BuildApprovalsPanel } from "./BuildApprovalsPanel";

export const metadata: Metadata = {
	title: "Approbations de build — AIDOS Workbench",
	description:
		"L'inbox d'approbation des vérités proposées par la boucle de build (S85) : quand le travail de la boucle implique une vérité, elle PROPOSE un ChangeSet (proposed, jamais admitted) ; un humain détenant l'autorité du scope approuve depuis l'écran (réutilise S52 + S63). Une écriture agent above-the-waterline est refusée AGENT_WRITE_ABOVE_WATERLINE ; une vérité proposée exige l'approbation humaine avant d'atterrir.",
};

/**
 * /build-approvals — « Approbations de build » (S85, app-builder EPIC 8). La console qui EXÉCUTE
 * les deux ops du seam : (1) PROPOSER une vérité que la boucle a impliquée → un ChangeSet
 * `proposed` (jamais admitted) — le mur refuse une écriture directe AGENT_WRITE_ABOVE_WATERLINE ;
 * (2) APPROUVER une proposition en attente → la vérité n'atterrit (admitted) que si un humain
 * RÉEL détenant l'autorité du scope l'approuve (sinon INSUFFICIENT_AUTHORITY / PLACEHOLDER_ACTOR,
 * et la proposition reste proposed).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : chaque op a un contrôle lié, exécutable depuis
 * l'écran, prouvé par l'e2e Playwright. THE WALL (§2) : l'écran PROPOSE et un humain ADMET via le
 * graphe d'autorité — il n'écrit AUCUNE vérité ; le write kernel reste le rôle `aidos` via /goal
 * une fois admis. Determinism-first : le juge est le graphe d'autorité déterministe, jamais le LLM.
 * Ne touche aucune route existante. Thème ADR 0010, bilingue next-intl ADR 0011.
 */
export default async function BuildApprovalsPage() {
	const t = await getTranslations("buildApprovals");

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
					<BuildApprovalsPanel />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
