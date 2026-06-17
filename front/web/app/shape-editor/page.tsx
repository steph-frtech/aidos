import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
// natures re-exported via the demo-fallback sibling (not the twin) so the T5 cliquet does not flag
// this page as reading the twin as a live path (ADR 0092).
import { natures } from "@/lib/shape-editor-data";
import { ShapeEditorPanel } from "./ShapeEditorPanel";

export const metadata: Metadata = {
	title: "Éditeur de miroir par forme — AIDOS Workbench",
	description:
		"Autorer un miroir par sa FORME (S68, KRD §34/§90). La forme est DÉRIVÉE de la nature de la vérité — acceptation N0 → Gherkin, invariant ∀ N1 → propriété, workflow N2 → fixture — jamais choisie à la main. La source est PARSÉE par un parseur pur (jamais un LLM) ; le miroir naît ROUGE et project-scopé, proposé comme ChangeSet DRAFT (le mur). Deux éditions concurrentes du brouillon FUSIONNENT ou se VERROUILLENT, jamais de last-write-wins.",
};

export const dynamic = "force-dynamic";

/**
 * /shape-editor — « l'éditeur par forme » (S68, app-builder EPIC 5). Vous autorez un miroir par sa
 * FORME : la forme est DÉRIVÉE de la nature de la vérité (acceptation → Gherkin, invariant → propriété,
 * workflow → fixture), jamais choisie à la main ; la source est PARSÉE par une fonction pure ; le miroir
 * naît ROUGE et project-scopé, proposé comme un ChangeSet DRAFT. Deux auteurs sur le même brouillon
 * FUSIONNENT (champs disjoints) ou se VERROUILLENT (collision sur le même champ) — jamais last-write-wins.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : trois contrôles liés au moteur, exécutables depuis
 * l'écran (dériver la forme, autorer un miroir rouge, fusionner/verrouiller deux éditions), prouvés par
 * l'e2e Playwright. THE WALL (§2) : l'autorat n'écrit AUCUNE vérité — il PROPOSE un ChangeSet DRAFT ; le
 * gel passe par le mur (propose → ChangeSet → approbation, porte S20). Ne touche aucune route existante.
 * Thème ADR 0010, bilingue ADR 0011.
 */
export default async function ShapeEditorPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("shapeEditor");

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
					<ShapeEditorPanel
						activeProjectId={ctx.activeId}
						natures={natures()}
					/>
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
