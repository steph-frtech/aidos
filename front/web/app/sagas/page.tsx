import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SagaPanel } from "@/components/SagaPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the saga evaluator (Evaluate / RunCompensation / CheckCoherence / Validate)
// is a pure projection in lib/saga.ts (mirroring back/kernel/sagas), covered by lib/saga.test.ts.
// The panel runs the pure evaluator per row — no I/O, no clock, no rng — so each outcome and the
// coherence verdict shown is computed exactly as the Go evaluator decides it.

export const metadata: Metadata = {
	title: "Sagas — AIDOS Workbench",
	description:
		"Read-only panel of the AIDOS SagaInvariant (KRD §49.2): the checkout-payment-shipping cross-cell distributed-transaction invariant (participants / property / compensations), a statechart with compensation transitions, a live outcome table — a failed leg triggers compensation so a captured payment is never left with neither a confirmed order nor an executed compensation — and a CoherenceTest card. Un changement dans une cellule ne bloque ni ne corrompt la fédération.",
};

/**
 * /sagas — the SagaInvariant panel (S49). A SagaInvariant is a CROSS-CELL distributed-transaction
 * invariant binding named participants to a property that must hold across the fédération, each
 * participant carrying its compensation step. Two laws: (1) the property holds on the happy path
 * AND when a failed leg's compensation ran (the property holds VIA compensation) — the
 * dangling-money monster (a captured payment with neither order_confirmed nor
 * compensation_executed) is violated; (2) a consumed contract pinned to a non-head producer
 * version is incompatible (the CoherenceTest).
 *
 * ACTION-CAPABLE, WALL-SAFE (CLAUDE.md §7 ui-completeness): the panel renders the evaluator's
 * verdict via lib/saga.ts and offers a "Proposer un ChangeSet" control — declaring / re-scoping a
 * SagaInvariant is a truth-write, so it goes via propose → ChangeSet → approval (SemanticDiff
 * change_type rescope/refine/reweight, KRD §44.1), never a direct write from the screen. Themed
 * on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */
export default async function SagasPage() {
	const t = await getTranslations("sagas");

	const labels = {
		cardHeading: t("cardHeading"),
		scopeLabel: t("scopeLabel"),
		propertyLabel: t("propertyLabel"),
		certLanguageLabel: t("certLanguageLabel"),
		participantsHeading: t("participantsHeading"),
		commitsLabel: t("commitsLabel"),
		compensationLabel: t("compensationLabel"),
		noCompensation: t("noCompensation"),
		statechartHeading: t("statechartHeading"),
		statechartBody: t("statechartBody"),
		compensationTransition: t("compensationTransition"),
		outcomeHeading: t("outcomeHeading"),
		caseLabel: t("caseLabel"),
		traceLabel: t("traceLabel"),
		outcomeLabel: t("outcomeLabel"),
		reasonLabel: t("reasonLabel"),
		howToFixLabel: t("howToFixLabel"),
		compensationEventsLabel: t("compensationEventsLabel"),
		badgeSatisfied: t("badgeSatisfied"),
		badgeViolated: t("badgeViolated"),
		coherenceHeading: t("coherenceHeading"),
		coherenceBody: t("coherenceBody"),
		contractsLabel: t("contractsLabel"),
		headsLabel: t("headsLabel"),
		verdictLabel: t("verdictLabel"),
		badgeCoherent: t("badgeCoherent"),
		badgeIncompatible: t("badgeIncompatible"),
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
					<SagaPanel labels={labels} />
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
