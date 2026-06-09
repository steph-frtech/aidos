import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CausedByPanel } from "@/components/CausedByPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the caused_by trace is a pure projection in lib/caused-by.ts (mirroring
// back/kernel/causedby), covered by lib/caused-by.test.ts (fast-check). This Server Component
// renders the intro + tutorial; the action-capable panel runs the same pure `trace` the Go
// causedby.Trace emits — no I/O, no clock, no rng — so the cause chain shown is computed exactly as
// Go Trace computes it. READ-ONLY (the wall): the screen traces; a new caused_by row goes via
// propose → ChangeSet → approval, never a write here.

export const metadata: Metadata = {
	title: "Lien caused_by — AIDOS Workbench",
	description:
		"Panneau en lecture seule du lien caused_by d'AIDOS (FKE-35.1, FK12) : la SEPTIÈME arête versionnée — l'arête causale ARRIÈRE, l'inverse de la vague de rouge (impacts, S22). « A caused_by B » : B est une cause candidate de la rougeur de A. La remontée déterministe (Trace) part d'un symptôme rouge et énumère ses causes candidates (plus proche d'abord) ; un cycle est REFUSÉ. C'est le substrat du WhyTree (FK13).",
};

/**
 * /caused-by — the caused_by panel (FK12). It renders the FKE-35.1 backward causal edge: pick one
 * of the canonical graphs (the §17 cause chain / a root leaf / a cyclic variant) and TRACE upward
 * (the action), then read the ordered candidate causes (nearest first), OR the cycle refusal.
 *
 * THE DONE CRITERIA, executable from the screen: tracing the chain shows the ordered causes; the
 * root leaf shows no further cause; the cyclic graph is refused. The first edge's content-addressed
 * kernel.link body is shown to make the "round-trip versionné" concrete.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall). Themed on ADR 0010 tokens; bilingual via
 * next-intl (ADR 0011).
 */
export default async function CausedByPage() {
	const t = await getTranslations("causedBy");

	const labels = {
		pickLabel: t("pickLabel"),
		traceLabel: t("traceLabel"),
		awaiting: t("awaiting"),
		symptomLabel: t("symptomLabel"),
		chainHeading: t("chainHeading"),
		emptyChain: t("emptyChain"),
		cycleRefused: t("cycleRefused"),
		bodyLabel: t("bodyLabel"),
		caseNames: {
			caseChain: t("caseChain"),
			caseLeaf: t("caseLeaf"),
			caseCyclic: t("caseCyclic"),
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
					<CausedByPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
