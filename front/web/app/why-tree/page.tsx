import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WhyTreePanel } from "@/components/WhyTreePanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the WhyTree build is a pure projection in lib/why-tree.ts (mirroring
// back/kernel/whytree), covered by lib/why-tree.test.ts (fast-check). This Server Component renders
// the intro + tutorial; the action-capable panel runs the same pure `build` the Go whytree.Build
// emits — no I/O, no clock, no rng, NO LLM — so the tree shown is computed exactly as Go Build
// computes it (the judge is the reproduction bool, never a prompt). READ-ONLY (the wall): the
// screen builds the tree; freezing the terminal anti-recurrence mirror goes via propose → /learn →
// /goal → approval, never a write here.

export const metadata: Metadata = {
	title: "WhyTree — geste /why — AIDOS Workbench",
	description:
		"Panneau du geste /why d'AIDOS (FKE-35.1, FK13) : le 5-pourquoi REDRESSÉ. Depuis un symptôme rouge, /why remonte caused_by (FK12) vers les causes candidates, n'admet que les causes REPRODUITES (anti-confabulation), et termine OBLIGATOIREMENT en un miroir d'anti-récurrence (racine → /learn → miroir → vague de rouge). Un WhyTree sans miroir terminal est REFUSÉ (WHYTREE_NO_MIRROR).",
};

/**
 * /why-tree — the `/why` panel (FK13). It builds a WhyTree from a red symptom: pick one of the
 * canonical scenarios (the incident → tree → terminal mirror journey, or the three refusals) and
 * RUN /why (the action), then read the ordered reproduced causes, the ROOT cause, and the
 * obligatory terminal anti-recurrence mirror — OR the closed refusal.
 *
 * THE DONE CRITERIA, executable from the screen: building the incident scenario shows the tree
 * rooted at add_total_col with its terminal mirror (root → /learn → red wave); the no-mirror
 * scenario is REFUSED WHYTREE_NO_MIRROR; a non-reproduced cause is REFUSED (anti-confabulation); a
 * cycle is REFUSED with no partial tree.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall). Themed on ADR 0010 tokens; bilingual via
 * next-intl (ADR 0011).
 */
export default async function WhyTreePage() {
	const t = await getTranslations("whyTree");

	const labels = {
		pickLabel: t("pickLabel"),
		buildLabel: t("buildLabel"),
		awaiting: t("awaiting"),
		symptomLabel: t("symptomLabel"),
		provenanceLabel: t("provenanceLabel"),
		causesHeading: t("causesHeading"),
		rootLabel: t("rootLabel"),
		leafNote: t("leafNote"),
		terminalHeading: t("terminalHeading"),
		terminalNote: t("terminalNote"),
		redWaveNote: t("redWaveNote"),
		refusedLabel: t("refusedLabel"),
		bodyLabel: t("bodyLabel"),
		sourceLive: t("sourceLive"),
		sourceDemo: t("sourceDemo"),
		caseNames: {
			caseIncident: t("caseIncident"),
			caseNoMirror: t("caseNoMirror"),
			caseNotReproduced: t("caseNotReproduced"),
			caseCyclic: t("caseCyclic"),
		},
		errorNames: {
			WHYTREE_NO_MIRROR: t("errNoMirror"),
			WHYTREE_CAUSE_NOT_REPRODUCED: t("errNotReproduced"),
			CAUSED_BY_CYCLE: t("errCycle"),
			WHYTREE_TERMINAL_MISMATCH: t("errMismatch"),
			UNKNOWN_PROVENANCE: t("errProvenance"),
		},
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
						<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("readOnly")}
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
					<WhyTreePanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
