import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BesoinBranchTreePanel } from "@/components/BesoinBranchTreePanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: EL12 is the deterministic, code-authoritative per-level DECISION TREE (the
// Example-Mapping built above the wall) + the altitude classification by SCHEMA-MISMATCH. THREE pure
// functions, the LLM excluded: branchTree(level, body) → the closed set of branches to close for
// `resolved`; isResolved → all branches closed ∧ anti-vacuity satisfied (COMPUTED, never declared);
// classifyAltitude / isOffAltitude → an entity `attributes` body submitted at `product` FAILS the
// product schema (a declared field-set mismatch, NOT an LLM opinion of altitude). The verdicts are
// computed by lib/besoin-branchtree.ts (the byte-equivalent twin of back/runtime/besoin/branchtree.go),
// covered by lib/besoin-branchtree.test.ts (vitest + fast-check). ABOVE the wall: BranchTree feeds
// Idea.Intent / the /grill triage, never a kernel write.

export const metadata: Metadata = {
	title:
		"BranchTree — l'arbre de décision déterministe par niveau (AIDOS Workbench)",
	description:
		"EL12 : l'arbre de décision déterministe BranchTree(level, body) → l'ensemble clos des branches à fermer pour resolved, plus la classification d'altitude par schema-mismatch. Un attribut d'entité soumis au niveau product échoue le schéma product (mismatch de champs déclaré), ce n'est PAS une opinion LLM d'altitude. L'arbre, le verdict resolved et le classement sont des fonctions pures ; le LLM n'y entre pas. BranchTree alimente /grill, jamais le kernel.",
};

/**
 * /compound-besoin-branchtree — the EL12 panel. The human EXECUTES the decision tree + the altitude
 * classification FROM THE SCREEN: pick a (level, body) fixture, "Construire l'arbre" (runs branchTree
 * → the open/closed Example-Map cells + the resolved verdict), "Classer l'altitude" (runs
 * classifyAltitude + isOffAltitude → the schema-mismatch routing). resolved is COMPUTED, never
 * declared. ui-completeness (CLAUDE.md §7): no headless capability. ABOVE the wall, feeds /grill, never
 * the kernel. Themed (ADR 0010), bilingual (ADR 0011).
 */
export default async function BesoinBranchTreePage() {
	const t = await getTranslations("besoinBranchTree");

	const labels = {
		treeCta: t("treeCta"),
		altitudeCta: t("altitudeCta"),
		resetCta: t("resetCta"),
		caseLabel: t("caseLabel"),
		caseProductComplete: t("caseProductComplete"),
		caseProductMissing: t("caseProductMissing"),
		caseProductVacant: t("caseProductVacant"),
		caseEntityAtProduct: t("caseEntityAtProduct"),
		caseOperationForwardDep: t("caseOperationForwardDep"),
		treeHeading: t("treeHeading"),
		resolvedTrue: t("resolvedTrue"),
		resolvedFalse: t("resolvedFalse"),
		antiVacuityHeading: t("antiVacuityHeading"),
		antiVacuityTrue: t("antiVacuityTrue"),
		antiVacuityFalse: t("antiVacuityFalse"),
		branchClosed: t("branchClosed"),
		branchOpen: t("branchOpen"),
		altitudeHeading: t("altitudeHeading"),
		bestLabel: t("bestLabel"),
		offAltitudeTrue: t("offAltitudeTrue"),
		offAltitudeFalse: t("offAltitudeFalse"),
		unmatched: t("unmatched"),
		scoresLabel: t("scoresLabel"),
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
					<BesoinBranchTreePanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
