import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GlobalInvariantPanel } from "@/components/GlobalInvariantPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the GlobalInvariant decider (RedWave / Admit / Validate) is a pure
// projection in lib/global-invariant.ts (mirroring back/kernel/globalinvariant), covered by
// lib/global-invariant.test.ts. The panel runs the pure decider per row — no I/O, no clock, no
// rng — so each red-wave cell and each admission decision shown is computed exactly as the Go
// decider decides it.

export const metadata: Metadata = {
	title: "Invariants transverses — AIDOS Workbench",
	description:
		"Read-only panel of the AIDOS GlobalInvariant (KRD §49.1): the pii-forgettable-federation cross-cell invariant (scope / cells / blast_radius / approval_required), a red-wave fan-out reddening every spanned cell on a violation, and a live admission table — a wider blast_radius is blocked unless a wider authority approves. Un invariant transverse est une exception coûteuse, pas le mode normal.",
};

/**
 * /global-invariants — the GlobalInvariant panel (S48). A GlobalInvariant is a truth that
 * spans MORE THAN ONE cell (bounded context), distinct from the per-truth TruthScope (S15).
 * Two laws: (1) a cross-cell violation reddens EVERY cell in the invariant's reach (the §49
 * fan-out, not just the violator); (2) a wider blast_radius demands a wider authority — a
 * global blast_radius is BLOCKED unless the architecture_owner approves.
 *
 * ACTION-CAPABLE, WALL-SAFE (CLAUDE.md §7 ui-completeness): the panel renders the decider's
 * verdict via lib/global-invariant.ts and offers a "Proposer un ChangeSet" control — declaring
 * / re-scoping a GlobalInvariant is a truth-write, so it goes via propose → ChangeSet →
 * approval (SemanticDiff change_type rescope/reweight/reauthorize, KRD §44.1), never a direct
 * write from the screen. Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */
export default async function GlobalInvariantsPage() {
	const t = await getTranslations("globalInvariants");

	const labels = {
		cardHeading: t("cardHeading"),
		scopeLabel: t("scopeLabel"),
		cellsLabel: t("cellsLabel"),
		predicateLabel: t("predicateLabel"),
		blastRadiusLabel: t("blastRadiusLabel"),
		approvalRequiredLabel: t("approvalRequiredLabel"),
		redWaveHeading: t("redWaveHeading"),
		redWaveBody: t("redWaveBody"),
		reddenedLabel: t("reddenedLabel"),
		violatorLabel: t("violatorLabel"),
		admissionHeading: t("admissionHeading"),
		grantedLabel: t("grantedLabel"),
		decisionLabel: t("decisionLabel"),
		reasonLabel: t("reasonLabel"),
		howToFixLabel: t("howToFixLabel"),
		badgeAdmitted: t("badgeAdmitted"),
		badgeBlocked: t("badgeBlocked"),
		badgeEscalated: t("badgeEscalated"),
		proposeHeading: t("proposeHeading"),
		proposeButton: t("proposeButton"),
		proposeStubHeading: t("proposeStubHeading"),
		proposeStubBody: t("proposeStubBody"),
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
					<GlobalInvariantPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t.rich("footer", {
						code: (chunks) => (
							<code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem] text-foreground">
								{chunks}
							</code>
						),
					})}
				</footer>
			</main>
		</div>
	);
}
