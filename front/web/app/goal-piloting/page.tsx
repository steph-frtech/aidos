import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { GoalPilotingPanel } from "./GoalPilotingPanel";

export const metadata: Metadata = {
	title: "/goal piloté — AIDOS Workbench",
	description:
		"Le /goal piloté par l'écran (S66, KRD §56–§59, §63 ①). Depuis une idée grilled, un user PORTEUR D'AUTORITÉ (S63) ouvre un goal : le moteur PROPOSE un ChangeSet DRAFT (Truth + Mirror) et calcule le VRAI set rouge ; le panel affiche la worklist red-set live. Le Stop reste NON-GAMEABLE (§57 ①/§8) : la fermeture est refusée tant que ≠ (set rouge → vert ∧ vert antérieur intact ∧ mutation ≥ seuil ∧ aucun monstre). L'écran PROPOSE un ChangeSet, n'écrit JAMAIS le Kernel (le mur). « Done » est calculé, jamais déclaré.",
};

export const dynamic = "force-dynamic";

/**
 * /goal-piloting — le « /goal piloté » (S66, app-builder EPIC 4). Vous ouvrez un goal depuis une
 * idée grilled en tant qu'ACTEUR RÉEL porteur d'autorité (S63) : AIDOS propose un ChangeSet DRAFT
 * (spec_delta + mirror_delta) et calcule le SET ROUGE LIVE — la worklist que vous voyez. Le Stop
 * est NON-GAMEABLE : la fermeture est refusée tant que les quatre conditions ne tiennent pas.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : DEUX contrôles liés au moteur, exécutables depuis
 * l'écran (proposer le goal · vérifier la fermeture), prouvés par l'e2e Playwright. THE WALL (§2) :
 * ouvrir un goal et le fermer sont des écritures de vérité (le rôle agent est SELECT-only sur
 * ideas.goal + changesets) — l'écran PROPOSE un ChangeSet DRAFT pour approbation humaine, il N'ÉCRIT
 * JAMAIS le Kernel. La persistance passe par la porte changeset (S20) + la porte d'approbation (S85).
 * Acteur réel via S63 ; l'admission par AuthorityGraph de domaine arrive à S85 (forward-dependency,
 * OpenQuestion, ne bloque pas). Ne touche aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function GoalPilotingPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("goalPiloting");

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
					<GoalPilotingPanel activeProjectId={ctx.activeId} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
