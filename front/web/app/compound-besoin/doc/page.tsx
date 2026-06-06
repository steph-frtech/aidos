import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { type DocLabels, RequirementsDocPanel } from "./RequirementsDocPanel";

// EL19 — the view /compound-besoin/doc: the requirements-doc generator. EmitRequirementsDoc(graph)
// projects DETERMINISTICALLY the 7 ordered rungs + bands + per-node metadata + carried OpenQuestions +
// the topo-sorted list of Ideas (each with its Proposes from LevelToProposes, its annexed mirror form,
// its anchors). Same BesoinGraph → byte-identical doc (same graph_hash → same markdown). It COMPOSES
// emitIdeas (EL16), redBacklog (EL17), levelMirrorForm (EL10) — re-implements none. Above the wall:
// PROPOSE, never write the kernel. Themed (ADR 0010), bilingual FR-default (ADR 0011).

export const metadata: Metadata = {
	title:
		"/compound-besoin/doc — le générateur du doc d'exigences (AIDOS Workbench)",
	description:
		"EL19 : le générateur du document d'exigences. EmitRequirementsDoc(graph) projette déterministiquement les 7 rungs ordonnés + bandes + métadonnées + OpenQuestions + la liste topo-triée des Ideas. Même BesoinGraph → doc byte-identique (graph_hash stable). Above le mur : PROPOSE, n'écrit jamais le Kernel.",
};

export default async function RequirementsDocPage() {
	const t = await getTranslations("besoinDoc");

	const labels: DocLabels = {
		generateCta: t("generateCta"),
		resetCta: t("resetCta"),
		graphHashLabel: t("graphHashLabel"),
		ideaCountLabel: t("ideaCountLabel"),
		markdownHeading: t("markdownHeading"),
		backlogHeading: t("backlogHeading"),
		wizardLink: t("wizardLink"),
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
					<RequirementsDocPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
