import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { ContextMapPanel } from "./ContextMapPanel";

export const metadata: Metadata = {
	title: "Context-Map & contrats inter-cellules — AIDOS Workbench",
	description:
		"S101 : la Context-Map est le seul vrai travail humain (KRD §46). On CONÇOIT quelles cellules existent et comment elles parlent ; les cellules se connectent UNIQUEMENT via des paires de contrats consumer/provider versionnées vérifiées par Pact. Une paire est HONORÉE ssi le provider publie un sur-ensemble de l'attente du consumer ; un appel cross-cell qui viole le contrat est refusé (CROSS_CELL_NO_CONTRACT). L'architecture est conçue, jamais générée. LE MUR : la Context-Map persiste comme vérité Kernel via un ChangeSet DRAFT (propose → ChangeSet → approbation).",
};

export const dynamic = "force-dynamic";

/**
 * /context-map — « Context-Map + contrats inter-cellules » (S101, app-builder EPIC 11). Quatre
 * gestes action-capables (ui-completeness, CLAUDE.md §7) : (1) VÉRIFIER une paire consumer/
 * provider — HONORÉE ssi le provider publie un sur-ensemble de l'attente (1ère done-criterion) ;
 * (2) VÉRIFIER toutes les paires conçues ; (3) VÉRIFIER un appel cross-cell — refusé s'il viole
 * le contrat (CROSS_CELL_NO_CONTRACT, 2e done-criterion) ; (4) PROPOSER la Context-Map en
 * ChangeSet DRAFT (le seul moyen légal de persister une vérité Kernel — le mur). L'architecture
 * est conçue, jamais générée (§46). Ne touche aucune route existante. Thème ADR 0010, bilingue
 * ADR 0011.
 */
export default async function ContextMapPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("contextMap");

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
					<ContextMapPanel activeProjectId={ctx.activeId} />
				</div>
			</main>
		</div>
	);
}
