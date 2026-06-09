import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { CostMeterPanel } from "./CostMeterPanel";

export const metadata: Metadata = {
	title:
		"Compteur de coût par cellule + ValueCase — l'économie du harnais câblée à de vrais compteurs d'AgentRun (AIDOS Workbench)",
	description:
		"S111 (E13) : chaque cellule DÉCLARE son HarnessCostBudget (max_ci_minutes / max_llm_tokens_per_goal / max_mutation_runtime / max_human_review_minutes / expected_risk_reduction) au-dessus de la ligne. Le compteur AGRÈGE la consommation des VRAIS AgentRun enregistrés (S52) — un COMPTAGE, jamais une estimation — et la confronte au cap. Une contrainte coûteuse sans ValueCase « justified » est SIGNALÉE (advisory), jamais bloquée silencieusement : « plus une contrainte coûte cher, plus elle doit justifier sa valeur ». Le signal d'over-budget alimente le disjoncteur (S83). LE MUR : le cockpit n'écrit AUCUNE vérité ; le juge est economics.Evaluate, jamais un LLM.",
};

export const dynamic = "force-dynamic";

/**
 * /cost-meter — le cockpit « économie du harnais par cellule » (S111, app-builder EPIC 13
 * gouvernance, KRD §66.3). Il COMPOSE trois moteurs déjà verts : le HarnessCostBudget +
 * ValueCase (economics.Evaluate, S51), les AgentRun enregistrés (S52) et leur RunMeter (BA11) —
 * le compteur agrège la consommation RÉELLE et la confronte au cap déclaré.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : deux contrôles liés au twin pur RÉEL
 * (lib/cost-meter), exécutables depuis l'écran — (1) MÉTRER la cellule depuis ses vrais
 * AgentRun (avec/sans le run lourd, avec/sans ValueCase justifiée) → un verdict §66.3 advisory ;
 * (2) projeter le verdict sur le SIGNAL du disjoncteur S83. Prouvé par l'e2e Playwright. THE WALL
 * (§2) : le budget est DÉCLARÉ (lecture seule) ; le cockpit n'écrit AUCUNE vérité. Ne touche
 * aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function CostMeterPage() {
	const t = await getTranslations("costMeter");

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
					<p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				<div className="mt-10">
					<CostMeterPanel />
				</div>
			</main>
		</div>
	);
}
