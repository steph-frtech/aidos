import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { DoltgresSpikePanel } from "./DoltgresSpikePanel";

export const metadata: Metadata = {
	title: "Spike Doltgres go/no-go — AIDOS Workbench",
	description:
		"S88 : un spike gatant juge Doltgres sous N connexions concurrentes + charge contre des seuils DÉCLARÉS → une Decision content-adressée (verdict, cible par défaut, opt-in). plain-Postgres est la cible PAR DÉFAUT par construction ; Doltgres est opt-in ssi go. Déterministe : verdict = mesure, jamais un avis. LE MUR : juger n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /doltgres-spike — « spike + porte go/no-go Doltgres » (S88, app-builder EPIC 9, ADR 0006
 * addendum 0047). Le spike soumet N connexions concurrentes à Doltgres (Testcontainers) et
 * MESURE stabilité + ratio de perf ; le verdict est une fonction PURE de la mesure contre des
 * seuils déclarés (count + deux comparaisons, jamais un LLM). plain-Postgres reste le défaut
 * par construction ; Doltgres est opt-in ssi go.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : un contrôle lié au moteur de verdict,
 * exécutable depuis l'écran (saisir une mesure → décider → voir verdict/cible/opt-in + l'adresse
 * de contenu), prouvé par l'e2e Playwright. THE WALL (§2) : juger n'écrit AUCUNE vérité — la
 * Decision est un record. Ne touche aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function DoltgresSpikePage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("doltgresSpike");

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
					<DoltgresSpikePanel activeProjectId={ctx.activeId} />
				</div>
			</main>
		</div>
	);
}
