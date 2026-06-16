import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LiveMirrorReplay } from "@/components/LiveMirrorReplay";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { natures } from "@/lib/shape-editor";
import { liveReplay } from "./liveActions";
import { MirrorWatchPanel } from "./MirrorWatchPanel";

export const metadata: Metadata = {
	title: "Matérialiser-et-le-voir-rougir — AIDOS Workbench",
	description:
		"Déclencher la matérialisation d'un miroir autoré vers son runner (Godog/rapid/fixture) et regarder le verdict passer ROUGE → (stub) → VERT en direct (S69, KRD §34/§56). Contre du code absent, le miroir est ROUGE — le « watch it fail » de KRD ; contre un stub, il est VERT. La matérialisation et le verdict sont des fonctions PURES (jamais un LLM). LE MUR : S69 ne fait qu'EXÉCUTER le miroir autoré au-dessus de la ligne, il n'écrit aucune vérité.",
};

export const dynamic = "force-dynamic";

/**
 * /mirror-watch — « matérialiser-et-le-voir-rougir » (S69, app-builder EPIC 5). Vous déclenchez la
 * matérialisation d'un miroir autoré (S68) vers son runner (la forme dérive le runner : Gherkin → Godog,
 * propriété → rapid, fixture → l'interpréteur) et vous regardez le verdict s'écouler en direct :
 * ROUGE contre du code absent (le « watch it fail » de KRD), VERT dès qu'un stub existe.
 *
 * Action-capable (ui-completeness, CLAUDE.md §7) : un contrôle lié au moteur, exécutable depuis l'écran
 * (autorer → matérialiser → exécuter, avec une bascule de présence du code), prouvé par l'e2e Playwright.
 * THE WALL (§2) : exécuter n'écrit AUCUNE vérité — S69 ne fait que LIRE le miroir autoré + calculer un
 * verdict ; le gel passe par le mur (propose → ChangeSet → approbation, S68/S20). Ne touche aucune route
 * existante. Thème ADR 0010, bilingue ADR 0011.
 */
export default async function MirrorWatchPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("mirrorWatch");
	const tc = await getTranslations("common");
	const replay = await liveReplay();

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
					<MirrorWatchPanel
						activeProjectId={ctx.activeId}
						natures={natures()}
					/>
				</div>

				{/* Live replay verdict — read through the gateway (mirror_replay), demo fallback. */}
				<LiveMirrorReplay
					view={replay}
					labels={{
						heading: t("liveHeading"),
						intro: t("liveIntro"),
						live: tc("live"),
						demo: tc("demo"),
						liveTitle: t("liveTitle"),
						demoTitle: t("liveDemoTitle"),
						verdictLabel: t("liveVerdictLabel"),
						verdictAllowed: t("liveVerdictAllowed"),
						verdictRejected: t("liveVerdictRejected"),
						runIdLabel: t("liveRunIdLabel"),
						resultsHeading: t("liveResultsHeading"),
						noResults: t("liveNoResults"),
						green: t("liveGreen"),
						red: t("liveRed"),
					}}
				/>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
