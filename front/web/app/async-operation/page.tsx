import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { AsyncOperationPanel } from "./AsyncOperationPanel";

export const metadata: Metadata = {
	title: "Operation asynchrone / planifiée + outbox — AIDOS Workbench",
	description:
		"Étendre l'Operation DSL avec un nœud async/planifié DISTINCT (cron / queue / webhook_out / notification) et le pattern outbox transactionnel (exactly-once relatif) (S73, EPIC 6). Une operation planifiée s'exécute à l'échéance et émet ses events ; l'outbox rejoue un effet non dispatché après crash SANS doublon observable ; la planification est déterministe sur l'horloge injectée — le scheduler est du code, jamais un LLM. LE MUR : ticker, planifier et dispatcher n'écrit aucune vérité ; l'outbox est une table de datastore runtime.",
};

export const dynamic = "force-dynamic";

/**
 * /async-operation — « l'operation asynchrone / planifiée + l'outbox transactionnel »
 * (S73, EPIC 6). L'Operation DSL (S10) gagne une TROISIÈME dimension — un nœud
 * async/planifié (cron / queue / webhook_out / notification) — sans toucher aux six verbes
 * synchrones. Une operation planifiée s'exécute à l'échéance (tick sur une horloge
 * INJECTÉE) et émet ses events ; ses effets passent par l'OUTBOX transactionnel — écrits
 * dans la même transaction que le changement d'état, puis dispatchés exactly-once relatif
 * (l'id content-adressé de l'effet est la clé d'idempotence : un rejeu après crash est
 * supprimé, jamais un doublon observable).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : un contrôle lié au moteur, exécutable
 * depuis l'écran (épingler une horloge → ticker la planification, dérouler le chemin
 * crash → rejeu de l'outbox, prouver le compte observable = 1), prouvé par l'e2e
 * Playwright. THE WALL (§2) : exécuter n'écrit AUCUNE vérité. Ne touche aucune route
 * existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function AsyncOperationPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("asyncOperation");

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
					<AsyncOperationPanel activeProjectId={ctx.activeId} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
