import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ContextPackPanel } from "@/components/ContextPackPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import type { ExclusionReason } from "@/lib/context-pack";

// Determinism-first: the ContextRouter (the deterministic, LLM-free, RAG-free context compiler)
// is a pure projection in lib/context-pack.ts (the twin of back/runtime/context.Compile), covered
// by lib/context-pack.test.ts (fast-check). This Server Component renders the intro + tutorial +
// example; the action-capable panel runs the SAME pure compile() the Go router runs — no I/O, no
// clock, no LLM — so the pack on screen matches the engine. READ-ONLY (the wall): the router reads
// the ContextGraph view; the emitted pack ALWAYS forbids /kernel/** /mirror/**; truth-writes go via
// propose → ChangeSet → approval, never this screen.

export const metadata: Metadata = {
	title:
		"ContextPack — le contexte minimal compilé depuis le red-set (AIDOS Workbench)",
	description:
		"Le ContextRouter d'AIDOS (KRD §144) : un ALGORITHME, pas un prompt et pas un RAG. Il compile depuis le red-set d'un goal (S22, jamais recalculé) le ContextPack MINIMAL (KRD §143) — seulement le kernel porteur, les miroirs rouges qui définissent la condition d'arrêt, les contrats qui FRANCHISSENT une frontière de bounded context, et la mémoire scopée (confiance ≥ repeated). « Trop de contexte détruit le contexte » (§141). Un goal checkout ne reçoit PAS les internes billing ; la mémoire périmée et hors-scope est exclue (§119.3). Le pack interdit toujours /kernel/** et /mirror/** (le mur). Lecture seule.",
};

/**
 * /context-pack — the ContextRouter panel (S33). The human picks a branch and clicks COMPILER; the
 * panel runs the pure twin compile(goal, branch, graph) and renders the compiled ContextPack: an
 * Included panel (affected layers, active kernel mirrors/contracts, scoped memory + recent
 * incidents, skills/tools, the stop condition, the pack hash); an Excluded panel where each item is
 * tagged with WHY (cross-BC / stale / out-of-scope / cosmetic-below-threshold); and a Boundaries
 * strip showing allowed_paths and the forbidden /kernel/** /mirror/** (the wall). The done
 * criterion is visible: the checkout pack excludes billing:invoice-internals (cross-BC) and the
 * stale old-promo-rule (stale).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall). Themed on ADR 0010 tokens; bilingual (ADR 0011).
 */
export default async function ContextPackPage() {
	const t = await getTranslations("contextPack");

	const reason: Record<ExclusionReason, string> = {
		"cross-BC": t("reasonCrossBC"),
		stale: t("reasonStale"),
		"out-of-scope": t("reasonOutOfScope"),
		unapproved: t("reasonUnapproved"),
		"cosmetic-below-threshold": t("reasonCosmetic"),
	};

	const labels = {
		compileCta: t("compileCta"),
		branchLabel: t("branchLabel"),
		goalLabel: t("goalLabel"),
		includedHeading: t("includedHeading"),
		excludedHeading: t("excludedHeading"),
		boundariesHeading: t("boundariesHeading"),
		affectedLayers: t("affectedLayers"),
		activeMirrors: t("activeMirrors"),
		activeContracts: t("activeContracts"),
		memoryLessons: t("memoryLessons"),
		memoryIncidents: t("memoryIncidents"),
		skillsTools: t("skillsTools"),
		stopCondition: t("stopConditionLabel"),
		packHash: t("packHashLabel"),
		allowedPaths: t("allowedPaths"),
		forbiddenPaths: t("forbiddenPaths"),
		pending: t("pending"),
		reason,
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
					<ContextPackPanel labels={labels} />
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
