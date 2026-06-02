import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SemanticMergePanel } from "@/components/SemanticMergePanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the semantic-merge decision is a pure projection in lib/semantic-merge.ts
// (the twin of back/archive/merge/MergeSemantic), covered by lib/semantic-merge.test.ts (fast-check).
// This Server Component renders the intro + tutorial + example; the action-capable panel runs the
// SAME pure mergeSemantic the Go decider / the /merge-semantic gesture run — no I/O, no clock, no rng
// — so the verdict on screen matches the engine. READ-ONLY (the wall): a clean merge is recorded only
// via the S20 ChangeSet path under the `aidos` writer role, never a write here.

export const metadata: Metadata = {
	title: "Fusion sémantique — AIDOS Workbench",
	description:
		"Panneau de fusion sémantique d'AIDOS (KRD §122/§130) : fusionner deux branches de vérité du DAG de versions est une opération SÉMANTIQUE, pas textuelle — le MIROIR décide le conflit (rouge sur la coupe fusionnée, l'agrégat récursif §109), jamais un diff de lignes à trois voies. Une fusion que git appellerait « propre » est BLOQUÉE quand sa coupe fusionnée rougit un miroir. Résoudre un conflit est une décision d'override (humain, au-dessus de la ligne de flottaison — ChangeSet + ADR + provenance), jamais une auto-fusion.",
};

/**
 * /semantic-merge — the semantic-merge panel (S25). It renders a base + left/right triple's verdict
 * as a MIRROR DECISION, not a line diff (KRD §122): a status badge (clean / conflict), and on
 * conflict the conflicting_mirrors[] + a plain sentence + the referenced merged_cut@hash /
 * requires_authority. It EXECUTES the merge from the screen for the three canonical triples: the
 * no-overlap refund EU/US pair is CONFLICT (the done criterion — clean text, red mirror, blocked),
 * the disjoint-lines cart pair is CONFLICT (the same emergent invariant, red git never sees), the
 * free-space promo-banner / help-link pair is CLEAN (a candidate stable phase, S23).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): the action is the merge DECISION; recording a
 * clean merge rides the S20 ChangeSet path. Themed on ADR 0010 tokens; bilingual (ADR 0011).
 */
export default async function SemanticMergePage() {
	const t = await getTranslations("semanticMerge");

	const labels = {
		pickLabel: t("pickLabel"),
		mergeLabel: t("mergeLabel"),
		statusLabel: t("statusLabel"),
		conflictingLabel: t("conflictingLabel"),
		mergedCutLabel: t("mergedCutLabel"),
		requiresAuthorityLabel: t("requiresAuthorityLabel"),
		awaiting: t("awaiting"),
		overrideAuthority: t("overrideAuthority"),
		conflictMirrorPrefix: t("conflictMirrorPrefix"),
		statusNames: {
			clean: t("statusClean"),
			conflict: t("statusConflict"),
			unresolvable: t("statusUnresolvable"),
		},
		titles: {
			refund: t("titleRefund"),
			cart: t("titleCart"),
			view: t("titleView"),
		},
		sentences: {
			clean: t("sentenceClean"),
			conflict: t("sentenceConflict"),
			unresolvable: t("sentenceUnresolvable"),
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
					<SemanticMergePanel labels={labels} />
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
