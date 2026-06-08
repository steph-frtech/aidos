import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { DeployPanel } from "./DeployPanel";

export const metadata: Metadata = {
	title: "Déploiement keyé sur les phases stables — AIDOS Workbench",
	description:
		"S96 : action « Déployer cette phase » — permise UNIQUEMENT depuis une phase stable (« done is computed » : red→vert ∧ vert antérieur ∧ mutation ≥ seuil ∧ aucun monstre). Le déploiement RÉ-ÉMET l'app depuis la phase (S78, déterministe) puis exécute une migration forward-only expand→backfill→contract (S95) et provisionne une URL via `pulumi up` (ADR 0043). Déploiement = ré-projection, jamais procédural (DP26). Done-criteria : une phase non-stable est refusée PHASE_NOT_STABLE ; la migration tourne forward-only ; l'artefact déployé est ré-projeté depuis la phase, jamais un artefact sandbox périmé. LE MUR : planifier n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /deploy — « pipeline de déploiement keyé sur les phases stables » (S96, app-builder EPIC 10,
 * DP26 / ADR 0043). Pour la phase stable active, deploy calcule un DeployPlan DÉTERMINISTE :
 * une URL de déploiement keyée sur la phase, le `pulumi up` qui démarre l'app RÉ-ÉMISE depuis
 * la phase (jamais un artefact sandbox périmé), le `pulumi destroy` qui la démonte, le hash de
 * l'app émise de la phase, et une migration de donnée FORWARD-ONLY (expand → backfill →
 * contract, S95).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : TROIS surfaces exécutables depuis l'écran —
 * (1) DÉPLOYER le plan (URL + boot + teardown + hash + migration, content-adressé) — un toggle
 * « phase non-stable » prouve le refus PHASE_NOT_STABLE, un toggle « migration » étale
 * l'expand→backfill→contract ; (2) PROBE la ré-projection (le hash servi == le hash émis, jugé
 * par le CODE) ; (3) le badge FORWARD-ONLY de la migration. THE WALL (§2) : planifier n'écrit
 * AUCUNE vérité — enregistrer le déploiement comme décision DAG passe par propose → ChangeSet →
 * approbation. Ne touche aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function DeployPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("deploy");

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
					<DeployPanel activeProjectId={ctx.activeId} />
				</div>
			</main>
		</div>
	);
}
