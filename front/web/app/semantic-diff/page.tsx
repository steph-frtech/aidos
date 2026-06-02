import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SemanticDiffPanel } from "@/components/SemanticDiffPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import type { ChangeType } from "@/lib/semantic-diff";

// Determinism-first: the SemanticDiff classification is a pure projection in lib/semantic-diff.ts
// (mirroring back/runtime/semanticdiff), covered by lib/semantic-diff.test.ts (fast-check). This
// Server Component renders the intro + tutorial + example; the action-capable panel runs the same
// pure `classify` the Go `aidos diff` emits — no I/O, no clock, no rng — so each change_type shown
// is computed exactly as Go Classify computes it. READ-ONLY (the wall): the screen reports the
// nature of a proposed change; applying it goes through a ChangeSet, never a write from here.

export const metadata: Metadata = {
	title: "SemanticDiff — AIDOS Workbench",
	description:
		"Panneau en lecture seule du SemanticDiff d'AIDOS (KRD §44.1) : il lit la nature réelle d'un changement de noyau entre deux versions (add/refine/override/rescope/reweight/deprecate) plutôt qu'un diff textuel, et la dit en langage humain. Un changement de scope est un rescope, pas un override ; un enabled_when incompatible est un override ; cosmetic → load-bearing est un reweight.",
};

/**
 * /semantic-diff — the SemanticDiff panel (S21). It renders the KRD §44.1 classifier: pick one of the
 * three canonical pairs (checkout-button / refund-policy / help-link) and run the classification (the
 * action), then read the change_type badge, the plain-language sentence, and the referenced
 * blast_radius / requires_authority / red_wave. The done criteria, executable from the screen:
 * checkout-button → override, refund-policy → rescope (not override), help-link → reweight.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): the classification is a read; applying a change
 * is the ChangeSet path. Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */
export default async function SemanticDiffPage() {
	const t = await getTranslations("semanticDiff");

	const changeTypeNames: Record<ChangeType, string> = {
		add: t("ctAdd"),
		refine: t("ctRefine"),
		override: t("ctOverride"),
		rescope: t("ctRescope"),
		reweight: t("ctReweight"),
		deprecate: t("ctDeprecate"),
		unclassifiable: t("ctUnclassifiable"),
		none: t("ctNone"),
	};

	const labels = {
		pickLabel: t("pickLabel"),
		classifyLabel: t("classifyLabel"),
		changeTypeLabel: t("changeTypeLabel"),
		readingLabel: t("readingLabel"),
		blastRadiusLabel: t("blastRadiusLabel"),
		requiresAuthorityLabel: t("requiresAuthorityLabel"),
		redWaveLabel: t("redWaveLabel"),
		oldLabel: t("oldLabel"),
		newLabel: t("newLabel"),
		idLabel: t("idLabel"),
		awaiting: t("awaiting"),
		sentences: {
			override: t("sentenceOverride"),
			rescope: t("sentenceRescope"),
			reweight: t("sentenceReweight"),
		},
		changeTypeNames,
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

				{/* Tutorial — how to read the screen */}
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
					<SemanticDiffPanel labels={labels} />
				</div>

				{/* Worked example */}
				<section
					aria-label={t("exampleHeading")}
					data-testid="example"
					className="mt-10 space-y-2 rounded-xl border border-border bg-card p-5"
				>
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("exampleHeading")}
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{t("exampleBody")}
					</p>
				</section>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
