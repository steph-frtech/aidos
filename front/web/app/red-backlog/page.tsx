import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RedBacklogPanel } from "@/components/RedBacklogPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: EL17 is the deterministic RedBacklog(graph) → BacklogItem[] (back/runtime/besoin/
// red_backlog.go + the besoin_red_backlog MCP tool) — a PURE topological sort (Kahn, deterministic
// tie-break) of the BesoinGraph's emitted Ideas along the constrains/seeds edges. No LLM enters. This
// panel runs the byte-equivalent twin lib/red-backlog.ts (covered by lib/red-backlog.test.ts, vitest +
// fast-check) so the sort is action-capable from the screen. ABOVE the wall: the mirror form is
// ANNEXED, never written; every Idea is a DRAFT with no version/mirror; promotion is /goal (S64).

export const metadata: Metadata = {
	title:
		"red-backlog — le RedBacklog ordonné (tri topologique) (AIDOS Workbench)",
	description:
		"EL17 : RedBacklog(graph) topo-trie les Ideas émises (les rungs mappants) selon les arêtes constrains/seeds → l'ordre exact de promotion que l'app-builder (S64) ouvre ses /goal dans, exactement la verticale §23. Chaque Idea porte ses anchors_above (dont les nœuds NoEmit journey/view qui la contraignent sans émettre) et sa forme de miroir attendue (LevelMirrorForm, EL10) ANNEXÉE — jamais écrite. Un cycle d'arêtes est refusé (BESOIN_CYCLE). Le tri est un algorithme pur, jamais un LLM. Above le mur : aucune écriture kernel/mirror, HasMirror toujours false.",
};

/**
 * /red-backlog — the EL17 RedBacklog panel. The human EXECUTES the topological sort FROM THE SCREEN
 * (ui-completeness, CLAUDE.md §7 — no headless capability): shape the already-decided graph (toggle
 * each rung's status), then "Trier le RedBacklog" runs redBacklog(nodes, edges) — the besoin_red_backlog
 * tool: the topo-sorted list of items, each carrying its expected mirror form (annexed), its
 * anchors_above (NoEmit rungs included), and its @version ref resolution. "Injecter un cycle" proves the
 * BESOIN_CYCLE refusal. Every verdict is COMPUTED by the deterministic twin, never an LLM. ABOVE the
 * wall, writes no truth. Themed (ADR 0010), bilingual (ADR 0011).
 */
export default async function RedBacklogPage() {
	const t = await getTranslations("redBacklog");

	const labels = {
		intro: t("panelIntro"),
		rungsHeading: t("rungsHeading"),
		statusEmpty: t("statusEmpty"),
		statusDrafting: t("statusDrafting"),
		statusResolved: t("statusResolved"),
		mapsLabel: t("mapsLabel"),
		noEmitLabel: t("noEmitLabel"),
		sortCta: t("sortCta"),
		cycleCta: t("cycleCta"),
		resetCta: t("resetCta"),
		backlogHeading: t("backlogHeading"),
		countLabel: t("countLabel"),
		orderLabel: t("orderLabel"),
		mirrorFormLabel: t("mirrorFormLabel"),
		anchorsLabel: t("anchorsLabel"),
		refsLabel: t("refsLabel"),
		openQuestionsLabel: t("openQuestionsLabel"),
		emptyBacklog: t("emptyBacklog"),
		cycleRefused: t("cycleRefused"),
		wallNote: t("wallNote"),
		handoffNote: t("handoffNote"),
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
					<RedBacklogPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
