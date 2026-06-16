import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { LivePlan } from "./LivePlan";
import { livePlan } from "./liveActions";
import { ProvisionPanel } from "./ProvisionPanel";

export const metadata: Metadata = {
	title: "Provisioning datastore par app — AIDOS Workbench",
	description:
		"S89 : provisionne le datastore de l'app émise — plain-Postgres par DÉFAUT (+ sidecar pgvector si besoin), Doltgres OPT-IN (branch/merge/diff/as-of) ssi le spike S88 est go, réutilisant le MÊME émetteur Atlas. Isolation par projet. Migration expand-contract human-gated via DataTruthScope. Émis comme resource Pulumi (DP15). Déterministe : plan = résolution, jamais un avis. LE MUR : planifier n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /provision — « provisioning du datastore par app » (S89, app-builder EPIC 9, ADR 0006
 * addendum 0047, ADR 0043 DP15). Le provisioner PLANIFIE le datastore de l'app émise :
 * plain-Postgres par défaut (+ pgvector si besoin), Doltgres opt-in ssi le verdict S88 est
 * go, le MÊME émetteur Atlas pour le DDL, une isolation par projet, et une migration
 * expand-contract human-gated via DataTruthScope. Le plan est une fonction PURE de la spec
 * (un test d'appartenance + un hash + l'émetteur existant, jamais un LLM).
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : un contrôle lié au moteur de plan,
 * exécutable depuis l'écran (choisir la cible → planifier → voir cible/image/db/namespace/
 * sidecars/DDL/resource Pulumi + l'adresse de contenu, OU le BlockReason de la porte). THE
 * WALL (§2) : planifier n'écrit AUCUNE vérité — le Plan est un record. Ne touche aucune
 * route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function ProvisionPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("provision");
	const tc = await getTranslations("common");
	const live = await livePlan();

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
					<ProvisionPanel activeProjectId={ctx.activeId} />
				</div>

				{/* Live datastore plan — read through the gateway (plan), demo fallback */}
				<LivePlan
					view={live}
					labels={{
						heading: t("liveHeading"),
						intro: t("liveIntro"),
						live: tc("live"),
						demo: tc("demo"),
						liveTitle: t("liveTitle"),
						demoTitle: t("demoTitle"),
						targetLabel: t("liveTargetLabel"),
						imageLabel: t("liveImageLabel"),
						databaseLabel: t("liveDatabaseLabel"),
						namespaceLabel: t("liveNamespaceLabel"),
						reasonsLabel: t("liveReasonsLabel"),
						noTruthWrite: t("liveNoTruthWrite"),
					}}
				/>
			</main>
		</div>
	);
}
