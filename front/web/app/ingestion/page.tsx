import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { IngestionPanel } from "@/components/IngestionPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the DocConverter port (MK02, ADR 0039) is a pure twin in lib/markitdown.ts
// (the twin of back/runtime/markitdown.HTMLConverter), covered by lib/markitdown.test.ts
// (fast-check). This Server Component renders the intro + tutorial; the action-capable panel runs
// the SAME pure ToMarkdown the Go port runs — no I/O, no clock, no LLM. THE WALL: read-only
// against truth; conversion PROPOSES (an idea draft, status="draft"), never writes
// /kernel/** /mirror/** /fitness.

export const metadata: Metadata = {
	title: "Ingestion document→markdown — le port DocConverter (AIDOS Workbench)",
	description:
		"Le port DocConverter d'AIDOS (MK02, ADR 0039) : la frontière d'ingestion REPLACEABLE, déterministe et idempotente, qui convertit un document (HTML ici ; PDF/DOCX/… via l'outil réel à MK03) en markdown — « même fichier → même markdown », byte-à-byte. Le markdown devient une candidate-vérité (une idée draft), jamais une écriture kernel (le mur). Lecture seule : le port lit le document, n'écrit aucune vérité.",
};

/**
 * /ingestion — the DocConverter panel (MK02). The human pastes an HTML document and clicks
 * CONVERTIR → the markdown + the idempotence badge appear; clicking again gives identical bytes
 * (« même fichier → même markdown »); clicking PROPOSER UNE IDÉE wraps the markdown as a
 * status="draft" candidate-truth (a preview of MK03's idea-intake). Both controls execute the pure
 * twin toMarkdown/toIdeaDraft — no headless capability (ui-completeness). READ-ONLY (the wall).
 * Themed on ADR 0010 tokens; bilingual (ADR 0011).
 */
export default async function IngestionPage() {
	const t = await getTranslations("ingestion");

	const labels = {
		sourceLabel: t("sourceLabel"),
		convertCta: t("convertCta"),
		reconvertCta: t("reconvertCta"),
		proposeCta: t("proposeCta"),
		markdownHeading: t("markdownHeading"),
		idempotentOk: t("idempotentOk"),
		idempotentFail: t("idempotentFail"),
		draftHeading: t("draftHeading"),
		draftTitleLabel: t("draftTitleLabel"),
		draftStatusLabel: t("draftStatusLabel"),
		draftProvenanceLabel: t("draftProvenanceLabel"),
		draftWallNote: t("draftWallNote"),
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
					<IngestionPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
