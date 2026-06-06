import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BesoinInvariantPanel } from "@/components/BesoinInvariantPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: EL14 is the transversal band /besoin-invariant — the interview of the invariants
// ∀ that cross every level + the policies where authorization is in play. The verdict (∀ vs ∃, the
// lateral constraint, the routing, band completeness) is computed by lib/besoin-invariant.ts (the
// byte-for-byte twin of back/runtime/besoin/invariant.go), covered by lib/besoin-invariant.test.ts
// (vitest + fast-check). This Server Component renders intro + tutorial; the action-capable panel RUNS
// the SAME pure functions the Go authority runs — no I/O, no clock, no LLM. ABOVE the wall: the band
// writes no truth; the policy idea is guidance for the legal idea_capture door (EL15 MCP).

export const metadata: Metadata = {
	title:
		"/besoin-invariant — la bande transversale des invariants ∀ et des policies (AIDOS Workbench)",
	description:
		"EL14 : l'interview des invariants ∀ qui croisent tout niveau (« vrai sur tous les chemins ») et des policies où l'autorisation est en jeu. L'humain énonce l'invariant ; le code l'enregistre et le classe (ban de circularité, §8). Un ∃ (un exemple unique) est refusé (INVARIANT_IS_EXAMPLE_NOT_FORALL) ; un invariant attaché à un rung contraint ce rung ET tout rung au-dessus (contrainte latérale) ; une bande policy émet au plus une Idea{Proposes:policy} via la porte légale idea_capture ; un invariant path-independent n'émet rien (NoEmit). Fonctions pures déterministes, jamais un LLM, au-dessus du mur (aucune écriture vérité).",
};

/**
 * /besoin-invariant — the EL14 transversal band panel. The human EXECUTES the band FROM THE SCREEN:
 * record an invariant/policy (a ∀ recorded, an ∃ refused, a policy band → one Idea, a self-authored
 * invariant refused by the circularity ban), see the lateral constraint (crossed levels), and run band
 * completeness (the missing crossing invariant). ui-completeness (CLAUDE.md §7): no headless
 * capability. ABOVE the wall, no truth write. Themed (ADR 0010), bilingual (ADR 0011).
 */
export default async function BesoinInvariantPage() {
	const t = await getTranslations("besoinInvariant");

	const labels = {
		recordCta: t("recordCta"),
		crossedCta: t("crossedCta"),
		completenessCta: t("completenessCta"),
		resetCta: t("resetCta"),
		caseLabel: t("caseLabel"),
		caseInvariantForall: t("caseInvariantForall"),
		caseInvariantExample: t("caseInvariantExample"),
		casePolicyBand: t("casePolicyBand"),
		caseSelfAuthored: t("caseSelfAuthored"),
		selfAuthoredLabel: t("selfAuthoredLabel"),
		routingHeading: t("routingHeading"),
		routingRecord: t("routingRecord"),
		routingOffAltitude: t("routingOffAltitude"),
		routingSpike: t("routingSpike"),
		crossedHeading: t("crossedHeading"),
		policyIdeaHeading: t("policyIdeaHeading"),
		policyIdeaNone: t("policyIdeaNone"),
		blockReasonHeading: t("blockReasonHeading"),
		completenessHeading: t("completenessHeading"),
		completenessComplete: t("completenessComplete"),
		completenessMonster: t("completenessMonster"),
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
					<BesoinInvariantPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
