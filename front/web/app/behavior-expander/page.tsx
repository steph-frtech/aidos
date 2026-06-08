import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { BehaviorExpanderPanel } from "./BehaviorExpanderPanel";

export const metadata: Metadata = {
	title: "Expander de behavior-macro — AIDOS Workbench",
	description:
		"Un behavior-macro (ownable, versionné, taggable, localisable) dont Expand(behavior, entité) est l'UNIQUE fonction pure faisant autorité — produisant attributs / relations / opérations / policies / fixtures, jamais un LLM, jamais ré-implémentée. L'expansion est PROPOSÉE comme ChangeSet DRAFT, jamais une vérité appliquée (le mur). S67/S79/S80/S81 la consomment (S76).",
};

export const dynamic = "force-dynamic";

/**
 * /behavior-expander — « AST behavior-macro + expander dry-run déterministe, l'UNIQUE Expand » (S76,
 * app-builder EPIC 7). Un behavior RECORD (ownable, versionné, taggable, localisable) s'expanse via
 * la SEULE fonction pure faisant autorité Expand(behavior, entité) en attributs / relations /
 * opérations / policies / fixtures, puis se PROPOSE comme ChangeSet DRAFT — jamais une vérité
 * appliquée.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : un contrôle lié au moteur, exécutable depuis
 * l'écran — PROPOSE : posséder/versionner/tagger/localiser un record, l'attacher à une entité,
 * lancer l'UNIQUE Expand et produire un ChangeSet DRAFT portant l'expansion + ses adresses de
 * contenu. Prouvé par l'e2e Playwright. THE WALL (§2) : proposer n'écrit AUCUNE vérité — le
 * ChangeSet reste DRAFT ; seul le CLI `aidos`, après approbation humaine, l'applique. Ne touche
 * aucune route existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function BehaviorExpanderPage() {
	const t = await getTranslations("behaviorExpander");

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
					<BehaviorExpanderPanel />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
