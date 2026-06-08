import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { CellFederationPanel } from "./CellFederationPanel";

export const metadata: Metadata = {
	title: "Fédération de cellules (bounded contexts) — AIDOS Workbench",
	description:
		"S100 : un projet n'est jamais un seul Kernel indivis (KRD §43–§51) mais une fédération de cellules (bounded contexts), chacune avec son propre Kernel et son propre ratchet, liées UNIQUEMENT par contrats_with (S17). L'agent dans la cellule X charge son propre Kernel + SEULEMENT les contrats PUBLICS de ses voisins contractés — jamais les internals d'un voisin (§145). Done-criteria : le ContextPack d'une cellule exclut les internals des voisins ; un accès cross-cell sans contrat est refusé (CROSS_CELL_NO_CONTRACT). Une cellule livre si localement stable (§43 fractal). LE MUR : la Context-Map persiste via ChangeSet (S101).",
};

export const dynamic = "force-dynamic";

/**
 * /cell-federation — « cellule (bounded context) comme sous-scope d'un projet » (S100,
 * app-builder EPIC 11). Trois gestes action-capables (ui-completeness, CLAUDE.md §7) :
 * (1) PARTITIONNER le Kernel du projet en sous-Kernels par cellule + voir lesquelles livrent
 * (§43 fractal) ; (2) COMPILER le ContextPack d'une cellule — son propre Kernel + seulement les
 * contrats PUBLICS des voisins contractés, internals des voisins exclus (1ère done-criterion) ;
 * (3) VÉRIFIER un accès cross-cell — refusé sans contrat honoré (CROSS_CELL_NO_CONTRACT, 2e
 * done-criterion). Question ouverte E11 tranchée : cellule = partition de premier rang réutilisant
 * bounded_context, PAS une dimension du TruthScope (S15). THE WALL (§2/§9) : la Context-Map
 * persiste via ChangeSet. Ne touche aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function CellFederationPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("cellFederation");

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
					<CellFederationPanel activeProjectId={ctx.activeId} />
				</div>
			</main>
		</div>
	);
}
