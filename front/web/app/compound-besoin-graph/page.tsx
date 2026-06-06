import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BesoinGraphPanel } from "@/components/BesoinGraphPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the BesoinGraph record (ordered, append-only, content-addressed via
// records.Hash(Canonicalize(graph)), NO Version, NO Mirror) is a pure projection in
// lib/besoin-graph.ts (the byte-for-byte twin of back/runtime/besoin/graph.go), covered by
// lib/besoin-graph.test.ts (vitest + fast-check). This Server Component renders the intro +
// tutorial; the action-capable panel RUNS the SAME pure functions the Go authority runs — no I/O,
// no clock, no LLM. ABOVE the wall and read-only against truth: EL03 fixes the record shape, it
// writes no kernel/mirrors/fitness.

export const metadata: Metadata = {
	title:
		"Graphe du besoin — record ordonné, append-only, content-adressé (AIDOS Workbench)",
	description:
		"EL03 : le record BesoinGraph. Un ensemble ORDONNÉ et append-only de nœuds LevelNode (un par rung) + arêtes constrains(L→L+1)/seeds, content-adressé via records.Hash(Canonicalize(graphe)) — jamais un hash forké. Par construction AUCUN champ Version, AUCUN champ Mirror : la double absence EST ce qui en fait un besoin au-dessus du mur, jamais une vérité. Mêmes réponses → même graph_hash quel que soit l'ordre ; round-trip sans perte ; projets disjoints. Tout est fonction pure (déterminisme), au-dessus du mur (aucune écriture vérité).",
};

/**
 * /compound-besoin-graph — the EL03 BesoinGraph panel. The human EXECUTES the record FROM THE
 * SCREEN: build nodes, compute the graph_hash, prove insertion-order independence, prove project
 * disjointness, and prove the double absence (no version/mirror key — the wall). ui-completeness
 * (CLAUDE.md §7): no headless capability. ABOVE the wall, read-only. Themed (ADR 0010), bilingual
 * (ADR 0011).
 */
export default async function BesoinGraphPage() {
	const t = await getTranslations("besoinGraph");

	const labels = {
		projectLabel: t("projectLabel"),
		levelLabel: t("levelLabel"),
		statusLabel: t("statusLabel"),
		intentLabel: t("intentLabel"),
		addNodeCta: t("addNodeCta"),
		hashCta: t("hashCta"),
		reorderCta: t("reorderCta"),
		compareCta: t("compareCta"),
		clearCta: t("clearCta"),
		nodesHeading: t("nodesHeading"),
		hashHeading: t("hashHeading"),
		reorderHeading: t("reorderHeading"),
		compareHeading: t("compareHeading"),
		absenceHeading: t("absenceHeading"),
		colLevel: t("colLevel"),
		colStatus: t("colStatus"),
		colRefs: t("colRefs"),
		empty: t("empty"),
		pending: t("pending"),
		reorderSame: t("reorderSame"),
		reorderDiff: t("reorderDiff"),
		compareDisjoint: t("compareDisjoint"),
		compareCollide: t("compareCollide"),
		absenceOk: t("absenceOk"),
		absenceFail: t("absenceFail"),
		dupRefused: t("dupRefused"),
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
					<BesoinGraphPanel labels={labels} />
				</div>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
