import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RedPropagation } from "@/components/RedPropagation";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the weighted, thresholded fire + the admission discipline are pure projections
// in lib/red-propagation.ts (mirroring back/kernel/propagation), covered by lib/red-propagation.test.ts
// (fast-check). This Server Component renders the intro + tutorial + example; the tree, the fire
// table and the admission table run the pure functions per row — no I/O, no clock, no rng — so each
// verdict shown is computed exactly as the Go FireParent / ValidateWeight compute them.

export const metadata: Metadata = {
	title: "Propagation pondérée — AIDOS Workbench",
	description:
		"Panneau en lecture seule de la propagation rouge pondérée et seuillée d'AIDOS (KRD §112, §114) : chaque lien composes porte un poids déclaré (cosmetic | load-bearing | critical), le parent porte un activation_threshold déclaré, et l'agrégat ne rougit que si l'activation cumulée des enfants changés atteint le seuil — un changement cosmétique ne rougit pas le parent. Un poids `critical` sans weight evidence est refusé à l'admission.",
};

/**
 * /red-propagation — the weighted red-propagation panel (S19). It renders the KRD §114 "cart"
 * composition (view "cart" composes checkout-button{load-bearing}, promo-field{load-bearing},
 * help-link{cosmetic}, declared activation_threshold 1): each composes edge drawn by its weight
 * thickness, the parent threshold, a live FIRE table (the §114 changed-set rows → computed
 * activation + aggregate verdict), and an ADMISSION table (the `critical`-needs-evidence rule).
 *
 * The done criteria, rendered: the help-link (cosmetic) change row is GREEN; the checkout-button
 * (load-bearing) change row is RED; the critical-without-evidence row is REJECTED with
 * CRITICAL_WEIGHT_WITHOUT_EVIDENCE + how_to_fix; the critical-with-evidence row is ACCEPTED.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): it renders the verdicts via lib/red-propagation.ts; it
 * never writes truth (the wall — weights/thresholds go via propose → ChangeSet → approval). No
 * headless capability. Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */
export default async function RedPropagationPage() {
	const t = await getTranslations("redPropagation");

	const labels = {
		treeHeading: t("treeHeading"),
		thresholdLabel: t("thresholdLabel"),
		weightLabel: t("weightLabel"),
		weightCosmetic: t("weightCosmetic"),
		weightLoadBearing: t("weightLoadBearing"),
		weightCritical: t("weightCritical"),
		fireHeading: t("fireHeading"),
		fireScenario: t("fireScenario"),
		fireActivation: t("fireActivation"),
		fireVerdict: t("fireVerdict"),
		fireCosmetic: t("fireCosmetic"),
		fireLoadBearing: t("fireLoadBearing"),
		fireNone: t("fireNone"),
		fireMixed: t("fireMixed"),
		admissionHeading: t("admissionHeading"),
		admissionWeight: t("admissionWeight"),
		admissionEvidence: t("admissionEvidence"),
		admissionResult: t("admissionResult"),
		admissionReason: t("admissionReason"),
		admissionAccepted: t("admissionAccepted"),
		admissionRejected: t("admissionRejected"),
		admissionNoEvidence: t("admissionNoEvidence"),
		badgeGreen: t("badgeGreen"),
		badgeRed: t("badgeRed"),
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
					<RedPropagation labels={labels} />
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
