import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TechSpecPanel } from "@/components/TechSpecPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the assembly + zero-new-truth check + drift detection are a pure projection in
// lib/tech-spec.ts (mirroring back/runtime/generators/techspec), covered by lib/tech-spec.test.ts
// (fast-check). This Server Component renders the intro + tutorial; the action-capable panel runs the
// same pure `assemble` the Go techspec.Assemble computes — no I/O, no clock, no rng, NO LLM — so the
// file shown is computed exactly as Go computes it. READ-ONLY (the wall): the screen assembles +
// drift-checks; freezing a projection goes via propose → /goal → approval, never a write here.

export const metadata: Metadata = {
	title:
		"Spécification technique & Tests techniques — projections assemblées — AIDOS Workbench",
	description:
		"Panneau des deux projections techniques d'AIDOS (FKE-20.1, FK15) : la Fiche de Spécification Technique (Contrat F5 + Modèle F4 + pile OSI + specs des facettes S/B/R/V/M + ADR) et la Suite de Tests Techniques (N4/N5 + tests OSI + tests des facettes), ASSEMBLÉES depuis les déclarations existantes (zéro nouvelle vérité), jamais hand-éditées (hash-protégées). Mêmes kernels → mêmes fichiers byte-identiques ; un hand-edit détecté.",
};

/**
 * /tech-spec — the two assembled-projection panel (FK15 part (b)). It assembles the Fiche /
 * Suite from a kernel's already-declared technical elements: pick a kernel scenario + a projection,
 * RUN the assembly (the action), see the zero-new-truth verdict (declared === assembled), then RUN
 * the drift check on the clean file (no drift) or on a HAND-EDITED file (the FK15 fault-injection →
 * HAND_EDITED).
 *
 * THE DONE CRITERIA, executable from the screen: assembling twice yields the SAME bytes; the
 * projection assembles EXACTLY the declared elements (zero new truth); a hand-edit is DETECTED.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall). Themed on ADR 0010 tokens; bilingual via
 * next-intl (ADR 0011).
 */
export default async function TechSpecPage() {
	const t = await getTranslations("techSpec");

	const labels = {
		pickKernelLabel: t("pickKernelLabel"),
		pickProjLabel: t("pickProjLabel"),
		assembleLabel: t("assembleLabel"),
		checkCleanLabel: t("checkCleanLabel"),
		checkEditedLabel: t("checkEditedLabel"),
		sourceHashLabel: t("sourceHashLabel"),
		fileLabel: t("fileLabel"),
		driftHeading: t("driftHeading"),
		noDrift: t("noDrift"),
		expectedLabel: t("expectedLabel"),
		zeroTruthHeading: t("zeroTruthHeading"),
		zeroTruthOk: t("zeroTruthOk"),
		zeroTruthBroken: t("zeroTruthBroken"),
		declaredLabel: t("declaredLabel"),
		assembledLabel: t("assembledLabel"),
		projNames: {
			"fiche-specification-technique": t("projFiche"),
			"suite-tests-techniques": t("projSuite"),
		},
		driftNames: {
			HAND_EDITED: t("driftHandEdited"),
			MISSING_MARKER: t("driftMissingMarker"),
			STALE_HASH: t("driftStaleHash"),
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
					<TechSpecPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
