import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ArchiveCurationPanel } from "@/components/ArchiveCurationPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

// Determinism-first: the curation + QD decisions are pure projections in lib/archive-curation.ts
// (the twins of back/archive/curation/Curate + back/archive/qd/Elites), covered by
// lib/archive-curation.test.ts (fast-check). This Server Component renders the intro + tutorial +
// example; the action-capable panel runs the SAME pure curate()/nicheGrid() the Go deciders run —
// no I/O, no clock, no rng — so the verdicts on screen match the engine. READ-ONLY (the wall): a
// decision/élite is recorded only via the S20 ChangeSet path under the `aidos` writer role.

export const metadata: Metadata = {
	title: "Curation d'archive + niches QD — AIDOS Workbench",
	description:
		"Panneau de curation d'archive d'AIDOS (KRD §44.4 + §62) : la politique de curation garde le DAG de versions comme une MÉMOIRE VIVANTE plutôt qu'une décharge infinie, en classant chaque nœud keep / compress / tombstone — l'histoire critique n'est JAMAIS détruite (un tombstone MARQUE, un compress RÉSUME ; append-only). Les niches qualité-diversité (MAP-Elites) gardent UNE élite par niche comportementale — une variante n'entre dans une niche QUE SI elle a un miroir VERT (le Juge est le miroir déterministe, jamais le score). Lecture seule (le mur).",
};

/**
 * /archive-curation — the curation ledger + the MAP-Elites niche grid (S26). It renders each DAG
 * node's keep/compress/tombstone verdict (with its reason, noting tombstoned/compressed nodes are
 * STILL PRESENT — append-only) and the one-élite-per-niche grid (an EMPTY cell for a niche whose
 * only candidates have red mirrors — "no promotion without a green mirror"). The done criteria are
 * visible: an unsafe branch is TOMBSTONE (still listed), a stable_phase / élite is KEEP, a
 * green-mirror variant fills its niche cell, a red-mirror-only niche cell is EMPTY.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): the verdicts are RENDERED, never re-computed
 * as truth here; recording rides the S20 ChangeSet path. Themed on ADR 0010 tokens; bilingual (ADR 0011).
 */
export default async function ArchiveCurationPage() {
	const t = await getTranslations("archiveCuration");

	const labels = {
		runCurateLabel: t("runCurateLabel"),
		runElitesLabel: t("runElitesLabel"),
		ledgerHeading: t("ledgerHeading"),
		nicheHeading: t("nicheHeading"),
		nodeLabel: t("nodeLabel"),
		verdictLabel: t("verdictLabel"),
		reasonLabel: t("reasonLabel"),
		stillPresentNote: t("stillPresentNote"),
		eliteLabel: t("eliteLabel"),
		fitnessLabel: t("fitnessLabel"),
		emptyCell: t("emptyCell"),
		emptyCellNote: t("emptyCellNote"),
		verdictNames: {
			keep: t("verdictKeep"),
			compress: t("verdictCompress"),
			tombstone: t("verdictTombstone"),
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

				{/* Tutorial — how to read & drive the screen */}
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
					<ArchiveCurationPanel labels={labels} />
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
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
