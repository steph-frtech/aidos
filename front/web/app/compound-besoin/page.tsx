import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BesoinInterviewPanel } from "@/components/BesoinInterviewPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: EL13 is the umbrella skill /compound-besoin — the level-by-level FORCED interview
// where the LLM LEADS the dialogue but the CODE JUDGES. Every verdict is a pure function, the LLM
// excluded: enterableLevel (which rung to work), dispatchOf (which gesture), recordAnswer (the routing
// record / off_altitude / spike + the COMPUTED resolved verdict — never declared by the LLM). The
// verdicts are computed by lib/besoin-interview.ts (the byte-equivalent twin of
// back/runtime/besoin/interview.go), covered by lib/besoin-interview.test.ts (vitest + fast-check).
// ABOVE the wall: the interview writes no truth — its output is the BesoinGraph to be appended via the
// EL15 MCP. A fuzzy answer routes to /spike (idea_capture → idea_grill → idea_spike), never a descent;
// an off-altitude answer is rejected by SCHEMA, never by an LLM opinion of altitude.

export const metadata: Metadata = {
	title:
		"/compound-besoin — l'interview forcée niveau par niveau (AIDOS Workbench)",
	description:
		"EL13 : l'interview forcée du besoin niveau par niveau. Le LLM mène le dialogue, le code juge : enterableLevel (le niveau entrable), dispatchOf (le geste), recordAnswer (le routage record/off_altitude/spike + le verdict resolved CALCULÉ, jamais déclaré). Une réponse floue route vers /spike via idea_capture → idea_grill → idea_spike, jamais une descente ; une réponse off-altitude est rejetée par schéma. Above le mur : n'écrit aucune vérité.",
};

/**
 * /compound-besoin — the EL13 panel. The human DRIVES the level-by-level forced interview FROM THE
 * SCREEN: pick a (level, answer) fixture, "Enregistrer la réponse" (runs recordAnswer → the routing +
 * the COMPUTED resolved verdict + the open branches + the legal /spike gate when fuzzy), "Niveau
 * entrable" (runs enterableLevel + dispatchOf). resolved is COMPUTED, never declared by the LLM.
 * ui-completeness (CLAUDE.md §7): no headless capability. ABOVE the wall, writes no truth. Themed
 * (ADR 0010), bilingual (ADR 0011).
 */
export default async function BesoinInterviewPage() {
	const t = await getTranslations("besoinInterview");

	const labels = {
		recordCta: t("recordCta"),
		enterableCta: t("enterableCta"),
		resetCta: t("resetCta"),
		caseLabel: t("caseLabel"),
		caseProductSharp: t("caseProductSharp"),
		caseProductFuzzy: t("caseProductFuzzy"),
		caseEntityAtProduct: t("caseEntityAtProduct"),
		caseProductVacant: t("caseProductVacant"),
		routingHeading: t("routingHeading"),
		routingRecord: t("routingRecord"),
		routingOffAltitude: t("routingOffAltitude"),
		routingSpike: t("routingSpike"),
		resolvedTrue: t("resolvedTrue"),
		resolvedFalse: t("resolvedFalse"),
		spikeRouteHeading: t("spikeRouteHeading"),
		blockReasonHeading: t("blockReasonHeading"),
		openBranchesHeading: t("openBranchesHeading"),
		branchClosed: t("branchClosed"),
		branchOpen: t("branchOpen"),
		enterableHeading: t("enterableHeading"),
		enterableLabel: t("enterableLabel"),
		gestureLabel: t("gestureLabel"),
		dispatchHeading: t("dispatchHeading"),
		pending: t("pending"),
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
					<BesoinInterviewPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
