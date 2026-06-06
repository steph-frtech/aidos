import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BesoinCapitalisationPanel } from "@/components/BesoinCapitalisationPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: EL18 is the deterministic capitalisation of the need (back/runtime/besoin/
// capitalisation.go + the besoin_capitalise MCP tool) — PURE functions (anchor extraction, key
// normalisation, CE05 reuse routing). No LLM enters. This panel runs the byte-equivalent twin
// lib/besoin-capitalisation.ts (covered by lib/besoin-capitalisation.test.ts, vitest + fast-check) so
// the capitalisation is action-capable from the screen. ABOVE the wall: STRICTLY via firewall.ViaIdea,
// NEVER ToKernel, NEVER the fitness; wroteKernel always false; the idea is a DRAFT with no
// version/mirror; the provenance reconstructs to the graph_hash.

export const metadata: Metadata = {
	title:
		"compound-besoin-capitalisation — la capitalisation du besoin (AIDOS Workbench)",
	description:
		"EL18 : à la résolution complète d'un BesoinGraph, capturer le graphe résolu comme ancre réutilisable (graph_hash + clés canonicalisées) + le motif de résolution comme mémoire procédurale + une behavior-besoin candidate — STRICTEMENT via firewall.ViaIdea, JAMAIS ToKernel ni fitness. La provenance de l'idée se reconstruit jusqu'au graph_hash. Réutilisation cross-app = name-match sur clés canonicalisées (level, normalized-intent-hash) : un besoin similaire rejoue (ReplayCost), un besoin dissemblable ne réutilise rien (anti-faux-positif). Le jumeau TypeScript est byte-équivalent au code Go.",
};

/**
 * /compound-besoin-capitalisation — the EL18 need-capitalisation panel. The human EXECUTES the
 * capitalisation FROM THE SCREEN (ui-completeness, CLAUDE.md §7 — no headless capability): enter a
 * first resolved need's verbatim intents, "Capitaliser le besoin" runs anchor() (the besoin_capitalise
 * tool) → the reusable anchor + the DRAFT behaviour candidate (via the wall) + the wroteKernel=false
 * proof + the provenance reconstructing to the graph_hash; a second need + "Mesurer la réutilisation"
 * runs the CE05 name-match on canonicalised keys (similar replays, dissimilar fabricates no reuse).
 * Every verdict is COMPUTED by the deterministic twin, never an LLM. ABOVE the wall, writes no truth.
 * Themed (ADR 0010), bilingual (ADR 0011).
 */
export default async function BesoinCapitalisationPage() {
	const t = await getTranslations("besoinCapitalisation");

	const labels = {
		intro: t("panelIntro"),
		firstHeading: t("firstHeading"),
		secondHeading: t("secondHeading"),
		capitaliseCta: t("capitaliseCta"),
		reuseCta: t("reuseCta"),
		resetCta: t("resetCta"),
		graphHashLabel: t("graphHashLabel"),
		unitsLabel: t("unitsLabel"),
		noEmitLabel: t("noEmitLabel"),
		behaviorLabel: t("behaviorLabel"),
		provenanceLabel: t("provenanceLabel"),
		reconstructLabel: t("reconstructLabel"),
		wallNote: t("wallNote"),
		notResolved: t("notResolved"),
		reuseHeading: t("reuseHeading"),
		replayedLabel: t("replayedLabel"),
		freshLabel: t("freshLabel"),
		savedLabel: t("savedLabel"),
		dissimilarNote: t("dissimilarNote"),
	};

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
					<BesoinCapitalisationPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
