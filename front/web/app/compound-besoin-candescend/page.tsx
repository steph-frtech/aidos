import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BesoinCanDescendPanel } from "@/components/BesoinCanDescendPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: EL07 is the PURE forcing function CanDescend(graph, level) → Verdict. A level is
// descendable iff (a) its body is statable AND non-vacant, (b) its four metadata are certifiable, (c)
// its outgoing ref resolves, and (e) ANTI-VACUITY: ShrinkOptionSpace > 0 (a parsable level that
// narrows nothing is not_enough — anti-gaming). A deeper gap is a carried OpenQuestion + enough=true
// (bootstrap §6). enough is COMPUTED, never declared (anti-Goodhart §8). The verdict is computed by
// lib/besoin-candescend.ts (the byte-equivalent twin of back/runtime/besoin/candescend.go), covered
// by lib/besoin-candescend.test.ts (vitest + fast-check). ABOVE the wall: reads the node, no truth.

export const metadata: Metadata = {
	title: "CanDescend — la gate de forçage par niveau (AIDOS Workbench)",
	description:
		"EL07 : la fonction de forçage pure CanDescend(graph, level) → Verdict{enough, missing, openQuestions, blockReasons}. enough est CALCULÉ depuis cinq gates (corps non-vacant, métadonnées, refs résolues, anti-vacuité ShrinkOptionSpace>0), jamais déclaré par l'utilisateur ni le LLM. Un corps parsable-mais-non-contraignant est not_enough (anti-gaming) ; une dépendance avant est une OpenQuestion portée, non bloquante. La gate ne lit que le BesoinGraph, n'écrit aucune vérité.",
};

/**
 * /compound-besoin-candescend — the EL07 panel. The human EXECUTES the forcing gate FROM THE SCREEN:
 * pick a body fixture, "Compute the verdict" (runs canDescend → enough/missing/openQuestions/
 * blockReasons), "Count the shrink" (runs shrinkOptionSpace → the anti-vacuity count). enough is
 * COMPUTED, never declared. ui-completeness (CLAUDE.md §7): no headless capability. ABOVE the wall,
 * reads only the node body. Themed (ADR 0010), bilingual (ADR 0011).
 */
export default async function BesoinCanDescendPage() {
	const t = await getTranslations("besoinCanDescend");

	const labels = {
		verdictCta: t("verdictCta"),
		shrinkCta: t("shrinkCta"),
		resetCta: t("resetCta"),
		caseLabel: t("caseLabel"),
		caseRightSized: t("caseRightSized"),
		caseVacant: t("caseVacant"),
		caseTooMany: t("caseTooMany"),
		caseMetaIncomplete: t("caseMetaIncomplete"),
		caseForwardDep: t("caseForwardDep"),
		verdictHeading: t("verdictHeading"),
		enoughTrue: t("enoughTrue"),
		enoughFalse: t("enoughFalse"),
		missingHeading: t("missingHeading"),
		openQuestionsHeading: t("openQuestionsHeading"),
		blockReasonsHeading: t("blockReasonsHeading"),
		shrinkHeading: t("shrinkHeading"),
		shrinkValue: t("shrinkValue"),
		shrinkZero: t("shrinkZero"),
		shrinkPositive: t("shrinkPositive"),
		none: t("none"),
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
					<BesoinCanDescendPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
