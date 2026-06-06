import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ContextCompressorPanel } from "@/components/ContextCompressorPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the ContextCompressor port (HR02, ADR 0035) is a pure twin in
// lib/context-compressor.ts (the twin of back/runtime/context.ReferenceCompressor), covered by
// lib/context-compressor.test.ts (fast-check). This Server Component renders the intro + tutorial;
// the action-capable panel runs the SAME pure compress/retrieve the Go port runs — no I/O, no
// clock, no LLM. THE WALL: read-only against truth; the port extends the margin UNDER the budget
// cap, never relieves the cap, never writes /kernel/** /mirror/** /fitness.

export const metadata: Metadata = {
	title:
		"Compression de contexte — le port ContextCompressor (AIDOS Workbench)",
	description:
		"Le port ContextCompressor d'AIDOS (HR02, ADR 0035) : un outil REPLACEABLE, déterministe et byte-lossless, qui comprime l'ENTRÉE LLM (le ContextPack rendu + le transcript) AVANT le modèle pour étendre la marge SOUS le cap budget — il ne relève jamais le cap. Compress(prompt) → (compacted, handle) ; Retrieve(handle) → l'original. Le contrat porteur : Retrieve(Compress(x)) == l'original (réversibilité CCR), les faits porteurs survivent. Lecture seule (le mur) : le port lit le prompt, n'écrit aucune vérité.",
};

/**
 * /context-compression — the ContextCompressor panel (HR02). The human pastes/keeps an LLM-input
 * prompt and clicks COMPRESSER → the compacted text + the reduction ratio + the reversible handle
 * dictionary appear; clicking RÉCUPÉRER runs retrieve and shows the lossless badge (the round-trip
 * gives back the original). Both controls execute the pure twin compress/retrieve — no headless
 * capability (ui-completeness). READ-ONLY (the wall). Themed on ADR 0010 tokens; bilingual (ADR 0011).
 */
export default async function ContextCompressionPage() {
	const t = await getTranslations("contextCompression");

	const labels = {
		promptLabel: t("promptLabel"),
		compressCta: t("compressCta"),
		retrieveCta: t("retrieveCta"),
		compactedHeading: t("compactedHeading"),
		retrievedHeading: t("retrievedHeading"),
		handleHeading: t("handleHeading"),
		reductionLabel: t("reductionLabel"),
		losslessOk: t("losslessOk"),
		losslessFail: t("losslessFail"),
		pending: t("pending"),
		gateCta: t("gateCta"),
		gateHeading: t("gateHeading"),
		gateInvariantOk: t("gateInvariantOk"),
		gateInvariantFail: t("gateInvariantFail"),
		gateOriginalLabel: t("gateOriginalLabel"),
		gateCompressedLabel: t("gateCompressedLabel"),
		gateAllowed: t("gateAllowed"),
		gateDenied: t("gateDenied"),
		replayCta: t("replayCta"),
		replayHeading: t("replayHeading"),
		replaySameVerdicts: t("replaySameVerdicts"),
		replayDiffVerdicts: t("replayDiffVerdicts"),
		replayTokensPlain: t("replayTokensPlain"),
		replayTokensCompressed: t("replayTokensCompressed"),
		replayTokensSaved: t("replayTokensSaved"),
		replayCapLabel: t("replayCapLabel"),
		replayCapNeverRaised: t("replayCapNeverRaised"),
		replayFitsUnderCap: t("replayFitsUnderCap"),
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
					<ContextCompressorPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
