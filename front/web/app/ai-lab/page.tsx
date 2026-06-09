import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { CockpitPanel } from "./CockpitPanel";

export const metadata: Metadata = {
	title:
		"AI Lab — le générateur de specs (chat → 6×6 → machines) — AIDOS Workbench",
	description:
		"FK11 (FKE-38) : l'AI Lab est un générateur de specs à deux volets. GAUCHE — un chat en langage naturel qui GÉNÈRE les specs au-dessus du mur, sur les 6 paires-miroir de la facette choisie (une colonne de la grille 6×6). DROITE — la grille 6×6 (6 paires × facettes) : chaque cellule montre la spec générée (au-dessus du mur) et sa machine (le miroir/test exécutable, en-dessous) avec le voyant 🟢/🔴/🟡 de la conscience. LE MUR : le chat propose, il n'écrit jamais la vérité ; la promotion passe par /goal.",
};

export const dynamic = "force-dynamic";

/**
 * /ai-lab — « AI Lab : le générateur de specs » (FK11, piste FKE — FKE-38, corrigé).
 * L'AI Lab n'est PAS un cockpit de navigation : c'est un GÉNÉRATEUR DE SPECS à deux volets.
 *   - GAUCHE — un chat en LANGAGE NATUREL (le « cerveau gauche ») : ce qu'on écrit GÉNÈRE les
 *     specs AU-DESSUS DU MUR, sur les 6 paires-miroir de la facette choisie (une COLONNE de la
 *     grille 6×6). Le chat PROPOSE (amber) ; il n'écrit JAMAIS la vérité — une écriture-vérité
 *     directe est refusée au mur (§2).
 *   - DROITE — la GRILLE 6×6 (6 paires-miroir × facettes) : chaque cellule porte la spec générée
 *     (au-dessus du mur) et sa MACHINE — le miroir/test exécutable (en-dessous) — avec le voyant
 *     🟢/🔴/🟡 de la conscience (FK09). « Les machines que ça change » = exactement ces miroirs.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : la génération est liée au moteur pur lib/ai-lab
 * (generateSpecs + buildGrid). THE WALL (§2) : le chat génère au-dessus, les machines en-dessous
 * sont read-only ; une écriture-vérité depuis le chat est refusée ; la promotion passe par /goal.
 * DETERMINISM-FIRST (§8) : aucun LLM dans le twin — même message → même grille. ADR 0010/0011.
 */
export default async function AiLabPage() {
	const t = await getTranslations("aiLab");

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />

			<main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-8 sm:py-16">
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

				<CockpitPanel />
			</main>
		</div>
	);
}
