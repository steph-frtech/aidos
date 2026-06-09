import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { CockpitPanel } from "./CockpitPanel";

export const metadata: Metadata = {
	title: "AI Lab — le cockpit trialogue — AIDOS Workbench",
	description:
		"FK11 : le cockpit trialogue. GAUCHE le chat scopé au nœud (propose des slots, jamais de vérité) ; CENTRE la couche navigable = kernel + anatomie 1-pour-1, le mur dessiné, un voyant 🟢/🔴/🟡 par paire de toutes les facettes (la conscience live) ; DROITE les decision cards + blast radius + red wave + promotion gate. Deux modes (conversationnel/navigationnel) = le même écran à zoom différent. LE MUR : le chat propose, il n'écrit jamais la vérité ; le bas du mur est read-only.",
};

export const dynamic = "force-dynamic";

/**
 * /ai-lab — « AI Lab : le cockpit trialogue » (FK11, piste FKE — FKE-38).
 * Le cockpit COMPOSE les vérités EXISTANTES (la conscience FK09, le squelette de facettes FK08, la
 * navigation graphe S58/S60, la passerelle de promotion FK10) en UN écran zoomable :
 *   - GAUCHE — le chat/vibe scopé au nœud (le « cerveau gauche ») : il PROPOSE des slots (amber),
 *     il n'écrit JAMAIS la vérité — une écriture-vérité directe est refusée au mur (§2).
 *   - CENTRE — la couche navigable : le kernel + son anatomie 1-pour-1, le MUR dessiné entre
 *     au-dessus-de-la-ligne (kernel/mirrors, propose-only) et en-dessous (projections, read-only
 *     depuis le cockpit), et un voyant 🟢/🔴/🟡 par PAIRE de chaque facette (la conscience live).
 *   - DROITE — les decision cards (FK09) + le blast radius + la red wave (S22) + la promotion gate
 *     (FK10).
 * Deux modes (conversationnel/navigationnel) = le même écran à un zoom différent.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : chaque op du cockpit a un contrôle lié au
 * moteur pur lib/ai-lab — charger un cockpit, chatter un slot, cliquer une paire pour scoper
 * gauche+droite, valider une carte pour faire passer une paire 🔴→🟢. THE WALL (§2) : l'écran
 * n'écrit AUCUNE vérité ; une écriture-vérité depuis le chat est refusée ; une option au-dessus du
 * mur ouvre un /goal. DETERMINISM-FIRST (§8) : aucun LLM — les écarts sont SemanticDiff/blast, le
 * juge est un calcul. Thème ADR 0010, bilingue 0011.
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
