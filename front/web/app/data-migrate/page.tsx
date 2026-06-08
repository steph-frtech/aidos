import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { DataMigratePanel } from "./DataMigratePanel";

export const metadata: Metadata = {
	title: "Migration de donnée breaking — AIDOS Workbench",
	description:
		"S95 : sur une app déployée avec de vraies lignes, prouver les cas durs d'un changement de schéma breaking — rename de colonne avec backfill, split d'entité, cardinalité 1-N→N-N — via Atlas expand-contract + backfill, DataTruthScope-gated. Un changement breaking sans backfill est refusé (BREAKING_MIGRATION_NO_BACKFILL). Plan pur, content-adressé, driver-neutre. LE MUR : planifier n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /data-migrate — « migration de donnée de l'app émise sur changement breaking » (S95,
 * app-builder EPIC 10, DP15/DP26). Distinct de la migration du truth-store : sur une app
 * DÉPLOYÉE avec de VRAIES LIGNES, planifie la migration des cas durs (rename-avec-backfill,
 * split d'entité, cardinalité 1-N→N-N) via expand-contract + backfill, gated par la
 * DataTruthScope (§44.3). Un changement breaking sans backfill déclaré est REFUSÉ
 * (BREAKING_MIGRATION_NO_BACKFILL) — jamais un DROP silencieux.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : l'écran PLANIFIE la migration depuis le
 * twin pur (lib/datamigrate) — choisir le type breaking, remplir le corps, basculer le
 * backfill déclaré, cliquer « Planifier la migration ». L'écran montre les étapes EXPAND →
 * BACKFILL → CONTRACT (le backfill préserve les vraies lignes), le badge « préserve toute la
 * donnée » (CALCULÉ), et le refus honnête sans backfill. THE WALL (§2) : planifier n'écrit
 * AUCUNE vérité ; la migration est driver-neutre (SQL émis + content address). Ne touche
 * aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function DataMigratePage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("dataMigrate");

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
					<h2 className="text-sm font-semibold text-foreground">
						{t("tutorialHeading")}
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{t("tutorialBody")}
					</p>
				</section>

				<div className="mt-10 flex items-center gap-2 text-xs text-muted-foreground">
					<span className="font-medium">{t("activeProjectLabel")}:</span>
					<span
						data-testid="active-project"
						className="rounded-md bg-muted px-2 py-0.5 font-mono text-foreground"
					>
						{ctx.activeId ?? t("noProject")}
					</span>
				</div>

				<DataMigratePanel activeProjectId={ctx.activeId ?? null} />
			</main>
		</div>
	);
}
