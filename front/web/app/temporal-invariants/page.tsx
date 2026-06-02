import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TemporalInvariantPanel } from "@/components/TemporalInvariantPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the temporal evaluator (evaluate / validate) is a pure projection in
// lib/temporal.ts (mirroring back/kernel/temporal), covered by lib/temporal.test.ts. The panel
// runs the pure evaluator per row — no I/O, no Date.now(), no real clock — so each verdict shown is
// computed exactly as the Go evaluator decides it. The elapsed datum is PASSED IN (the runtime
// samples a real clock later), never sampled here.

export const metadata: Metadata = {
	title: "Invariants temporels — AIDOS Workbench",
	description:
		"Read-only panel of the AIDOS TemporalInvariant (KRD §49.3): the checkout-confirm-within-5m time-dependent invariant (property / clock / tolerance / mirror form), a green-band marker (5m ± 10s) and a live evaluation table — 4m58s and 5m04s HELD (the 5m04s case inside tolerance, NOT a flake), 5m20s VIOLATED (TEMPORAL_INVARIANT_VIOLATED), the out-of-order observation VIOLATED. Toute vérité temporelle doit déclarer son horloge.",
};

/**
 * /temporal-invariants — the TemporalInvariant panel (S50). A TemporalInvariant is a first-class
 * invariant KIND (KRD §49.3) whose property is time-dependent and which MUST declare its clock
 * (system | external | logical) and its tolerance (a duration), with a temporal mirror form
 * (statechart | tla+ | uppaal). The done law: a concrete time property reddens when violated, while
 * its declared tolerance keeps the proof from flaking (a confirmation at 5m04s under tolerance 10s
 * is HELD, not a flake; at 5m20s it is VIOLATED). It is NOT the temporal AXIS of the DAG, NOT
 * scope.TimeWindow (S15) — it is a clock-bearing property about time inside the domain behaviour.
 *
 * ACTION-CAPABLE, WALL-SAFE (CLAUDE.md §7 ui-completeness): the panel renders the evaluator's
 * verdict via lib/temporal and offers a "Proposer un ChangeSet" control — declaring a
 * TemporalInvariant or changing its tolerance is a truth-write, so it goes via propose → ChangeSet
 * → approval, never a direct write from the screen; plus a read-only "re-evaluate" control that
 * re-runs the pure evaluator below the line. Themed on ADR 0010 tokens; bilingual via next-intl
 * (ADR 0011).
 */
export default async function TemporalInvariantsPage() {
	const t = await getTranslations("temporal");

	const labels = {
		cardHeading: t("cardHeading"),
		propertyLabel: t("propertyLabel"),
		clockLabel: t("clockLabel"),
		toleranceLabel: t("toleranceLabel"),
		mirrorLabel: t("mirrorLabel"),
		relationLabel: t("relationLabel"),
		boundLabel: t("boundLabel"),
		bandHeading: t("bandHeading"),
		bandBody: t("bandBody"),
		tableHeading: t("tableHeading"),
		caseLabel: t("caseLabel"),
		observationLabel: t("observationLabel"),
		elapsedLabel: t("elapsedLabel"),
		verdictLabel: t("verdictLabel"),
		reasonLabel: t("reasonLabel"),
		howToFixLabel: t("howToFixLabel"),
		insideToleranceTag: t("insideToleranceTag"),
		badgeHeld: t("badgeHeld"),
		badgeViolated: t("badgeViolated"),
		reEvaluateHeading: t("reEvaluateHeading"),
		reEvaluateButton: t("reEvaluateButton"),
		reEvaluateDone: t("reEvaluateDone"),
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
					<TemporalInvariantPanel labels={labels} />
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
