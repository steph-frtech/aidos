import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BoundaryPanel } from "@/components/BoundaryPanel";
import { CompoundPanel } from "@/components/CompoundPanel";
import { ExpansionPanel } from "@/components/ExpansionPanel";
import { GesturePanel } from "@/components/GesturePanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the effort-delta measurement (capture goal-1 → cheaper goal-2) is a pure
// projection in lib/compound.ts (the twin of spike/compound), covered by lib/compound.test.ts
// (vitest + fast-check). This Server Component renders the intro + tutorial + example; the
// action-capable panel runs the SAME pure decide() the Go probe runs — no I/O, no clock, no LLM —
// so the verdict on screen matches the probe. SPIKE-scoped + READ-ONLY (the wall): the spike
// writes no truth; CE02+ rebuilds the real capitalisation loop via firewall.ViaIdea.

export const metadata: Metadata = {
	title:
		"Compound — capitaliser : capturer le 1er goal rend le 2ᵉ moins cher (AIDOS Workbench)",
	description:
		"Le spike CE01 de capitalisation (compound-engineering) : il MESURE si capturer le motif d'un 1er goal terminé réduit l'effort/tokens d'un 2ᵉ goal SIMILAIRE. Deux goals (order-archive → invoice-archive) décomposés en work-units ; les unités partagées sont REJOUÉES (recall procédural KindProcedural + expansion de behavior-macro §24.6) au lieu d'être re-dérivées. Verdict CALCULÉ (jamais déclaré) contre un plancher déclaré, avec un contrôle dissimilaire anti-faux-positif et une reproductibilité (fonction pure, sans LLM). Spike confiné, lecture seule (le mur).",
};

/**
 * /compound — the CE01 compound capitalisation spike panel. The human clicks MESURER LE DELTA;
 * the panel runs the pure twin decide() and renders a GO/NO-GO badge, the similar-pair token bars
 * (goal-2 with vs without capture), the reuse split, the dissimilar control (false-positive
 * guard) and the computed rationale. SPIKE-scoped, READ-ONLY (CLAUDE.md §7 ui-completeness, the
 * wall). Themed on ADR 0010 tokens; bilingual (ADR 0011).
 */
export default async function CompoundPage() {
	const t = await getTranslations("compound");

	const labels = {
		runCta: t("runCta"),
		goBadge: t("goBadge"),
		noGoBadge: t("noGoBadge"),
		pending: t("pending"),
		similarHeading: t("similarHeading"),
		dissimilarHeading: t("dissimilarHeading"),
		withoutCap: t("withoutCap"),
		withCap: t("withCap"),
		saved: t("saved"),
		reduction: t("reduction"),
		floor: t("floor"),
		ceiling: t("ceiling"),
		reusedProcedural: t("reusedProcedural"),
		reusedBehavior: t("reusedBehavior"),
		reproducible: t("reproducible"),
		rationaleLabel: t("rationaleLabel"),
	};

	const boundaryLabels = {
		runCta: t("boundary.runCta"),
		heading: t("boundary.heading"),
		capitalise: t("boundary.capitalise"),
		forbidden: t("boundary.forbidden"),
		viaWallBadge: t("boundary.viaWallBadge"),
		fitnessSafeBadge: t("boundary.fitnessSafeBadge"),
		colSubject: t("boundary.colSubject"),
		colChannel: t("boundary.colChannel"),
		pending: t("boundary.pending"),
		lineLabel: t("boundary.lineLabel"),
	};

	const gestureLabels = {
		runCta: t("gesture.runCta"),
		heading: t("gesture.heading"),
		proceduralHeading: t("gesture.proceduralHeading"),
		behaviorHeading: t("gesture.behaviorHeading"),
		kindLabel: t("gesture.kindLabel"),
		statusLabel: t("gesture.statusLabel"),
		provenanceLabel: t("gesture.provenanceLabel"),
		branchLabel: t("gesture.branchLabel"),
		noKernelBadge: t("gesture.noKernelBadge"),
		draftBadge: t("gesture.draftBadge"),
		pending: t("gesture.pending"),
		emptyProcedural: t("gesture.emptyProcedural"),
		emptyBehavior: t("gesture.emptyBehavior"),
	};

	const expansionLabels = {
		runCta: t("expansion.runCta"),
		rerunCta: t("expansion.rerunCta"),
		heading: t("expansion.heading"),
		behaviorLabel: t("expansion.behaviorLabel"),
		entityLabel: t("expansion.entityLabel"),
		attributes: t("expansion.attributes"),
		relations: t("expansion.relations"),
		operations: t("expansion.operations"),
		policies: t("expansion.policies"),
		fixtures: t("expansion.fixtures"),
		pieceCount: t("expansion.pieceCount"),
		idempotentBadge: t("expansion.idempotentBadge"),
		noKernelBadge: t("expansion.noKernelBadge"),
		pending: t("expansion.pending"),
		none: t("expansion.none"),
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
							{t("spikeBadge")}
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
					<CompoundPanel labels={labels} />
				</div>

				{/* CE02 — the capitalisation-loop boundary (the decision graven by this step). */}
				<section
					aria-label={t("boundaryHeading")}
					data-testid="boundary-section"
					className="mt-10 space-y-4 rounded-xl border border-border bg-card p-5"
				>
					<div className="space-y-2">
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{t("boundaryHeading")}
						</h2>
						<p className="text-sm leading-relaxed text-muted-foreground">
							{t("boundaryIntro")}
						</p>
					</div>
					<BoundaryPanel labels={boundaryLabels} />
				</section>

				{/* CE03 — the /compound gesture (executes the capitalisation at goal close). */}
				<section
					aria-label={t("gestureHeading")}
					data-testid="gesture-section"
					className="mt-10 space-y-4 rounded-xl border border-border bg-card p-5"
				>
					<div className="space-y-2">
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{t("gestureHeading")}
						</h2>
						<p className="text-sm leading-relaxed text-muted-foreground">
							{t("gestureIntro")}
						</p>
					</div>
					<GesturePanel labels={gestureLabels} />
				</section>

				{/* CE04 — the behavior-macro expansion (the dry-run §24.6 expander). */}
				<section
					aria-label={t("expansionHeading")}
					data-testid="expansion-section"
					className="mt-10 space-y-4 rounded-xl border border-border bg-card p-5"
				>
					<div className="space-y-2">
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{t("expansionHeading")}
						</h2>
						<p className="text-sm leading-relaxed text-muted-foreground">
							{t("expansionIntro")}
						</p>
					</div>
					<ExpansionPanel labels={expansionLabels} />
				</section>

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
