import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { inboxSnapshot } from "./actions";
import { GrillingLoopPanel } from "./GrillingLoopPanel";

export const metadata: Metadata = {
	title: "Boucle de grilling — AIDOS Workbench",
	description:
		"La surface conversationnelle qui EXÉCUTE le verdict /grill : une intention (≤ 5 scénarios) est grillée puis routée sur le verdict clos — nette → grilled, floue → spiking, mauvaise → rejected (tracée) — en enregistrant verdict + provenance. Le routage est DÉTERMINISTE et fait AUTORITÉ ; le LLM est l'exception barricadée pour le dialogue, re-vérifié contre le schéma de verdict. Sous le mur (le schéma ideas est du staging au-dessus de la ligne) ; la promotion vers une vérité est /goal, jamais une écriture depuis cet écran.",
};

// Read the live per-project routed-ideas trace on every request.
export const dynamic = "force-dynamic";

/**
 * /grilling-loop — la « Boucle de grilling » (S65, app-builder EPIC 4). La surface
 * conversationnelle en produit qui exécute le verdict /grill : vous grillez une
 * INTENTION (intent + ≤ 5 scénarios), vous NOMMEZ le verdict (nette | floue | mauvaise),
 * et AIDOS la route DÉTERMINISTIQUEMENT (le code fait autorité, le LLM ne fait que
 * proposer un verdict re-vérifié contre le schéma) en écrivant un vrai record d'idée
 * routé, scopé à votre projet actif. L'inbox liste la trace des décisions de grilling.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : l'op de routage a un contrôle lié,
 * exécutable depuis l'écran, prouvé par l'e2e Playwright. THE WALL (§2) : le schéma ideas
 * est du staging au-dessus de la ligne — une vérité-candidate, écrite sous le mur ; la
 * promotion vers une vérité du noyau est /goal (S66), jamais une écriture ici. Ne touche
 * aucune route existante. Thème ADR 0010, bilingue next-intl ADR 0011.
 */
export default async function GrillingLoopPage() {
	const snapshot = await inboxSnapshot();
	const t = await getTranslations("grillingLoop");

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

				{/* Tutorial — how to read & drive the screen */}
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
					<GrillingLoopPanel snapshot={snapshot} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
