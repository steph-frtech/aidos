import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { EntityRelationPanel } from "./EntityRelationPanel";

export const metadata: Metadata = {
	title: "Nœud de relation de l'Entity AST — AIDOS Workbench",
	description:
		"Étendre le système de types des entités avec un nœud de relation DISTINCT (1-1 / 1-N / N-N, sémantique fk / association / composition), SANS élargir l'ensemble scalaire clos (S71, KRD §23/§26). Une relation round-trip comme AST content-adressé ; une relation vers une entité inexistante est refusée UNKNOWN_RELATION_TARGET — jamais un mapping deviné. LE MUR : résoudre et hasher n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /entity-relation — « le nœud de relation de l'Entity AST » (S71, app-builder EPIC 6).
 * Le système de types des entités gagne un nœud DISTINCT — une relation (1-1 / 1-N / N-N,
 * fk / association / composition) — sans toucher à l'ensemble scalaire clos de S35. Une
 * relation round-trip comme AST content-adressé ; sa cible est RÉSOLUE contre l'ensemble
 * d'entités déclaré, jamais devinée — une cible inconnue est refusée UNKNOWN_RELATION_TARGET.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : un contrôle lié au moteur, exécutable
 * depuis l'écran (épingler une relation → la résoudre + la content-adresser), prouvé par
 * l'e2e Playwright. THE WALL (§2) : exécuter n'écrit AUCUNE vérité — S71 ne fait que
 * VALIDER, RÉSOUDRE et HASHER un nœud de relation ; une relation est une SOURCE au-dessus
 * de la ligne (l'écriture-vérité passerait par propose → ChangeSet → approbation). Ne
 * touche aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function EntityRelationPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("entityRelation");

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
					<EntityRelationPanel activeProjectId={ctx.activeId} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
