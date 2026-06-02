"use client";

import {
	type CurationDecision,
	curate,
	nicheGrid,
	type Verdict,
} from "@/lib/archive-curation";
import { NODES, NOW, VARIANTS } from "@/lib/archive-curation-data";

/**
 * ArchiveCurationPanel — the action-capable /archive-curation panel (S26). It renders the curation
 * LEDGER (each DAG node with its keep/compress/tombstone verdict badge + reason, noting that
 * tombstoned/compressed nodes are STILL PRESENT — append-only) and the MAP-Elites NICHE GRID (one
 * cell per niche, each showing its single élite + anchored fitness, an EMPTY cell for a niche whose
 * only candidates have red mirrors).
 *
 * The human can RUN the curation (the "classify the archive" action) and RUN the QD selection (the
 * "place the élites" action) from the screen — calling the SAME pure curate()/nicheGrid() the Go
 * deciders emit. The verdicts are RENDERED, never re-implemented in the front-end.
 *
 * THE DONE CRITERIA, visible: an unsafe branch shows TOMBSTONE while remaining listed (not gone), a
 * stable_phase / pareto_elite shows KEEP, a green-mirror variant fills its niche cell, and a
 * red-mirror-only niche leaves its cell EMPTY (no promotion without a green mirror).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): a decision/élite is recorded only via the S20
 * ChangeSet path under the `aidos` writer role, never a write here. Themed on ADR 0010 tokens;
 * bilingual via next-intl (ADR 0011) — strings are passed in as labels.
 */

interface Labels {
	runCurateLabel: string;
	runElitesLabel: string;
	ledgerHeading: string;
	nicheHeading: string;
	nodeLabel: string;
	verdictLabel: string;
	reasonLabel: string;
	stillPresentNote: string;
	eliteLabel: string;
	fitnessLabel: string;
	emptyCell: string;
	emptyCellNote: string;
	verdictNames: Record<Verdict, string>;
}

const badgeClass: Record<Verdict, string> = {
	keep: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	compress:
		"border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
	tombstone:
		"border-zinc-500/40 bg-zinc-500/10 text-zinc-500 dark:text-zinc-400",
};

export function ArchiveCurationPanel({ labels }: { labels: Labels }) {
	// The two pure actions, run from the screen (the deterministic twins of the Go deciders).
	const decisions: CurationDecision[] = curate(NODES, NOW);
	const grid = nicheGrid(VARIANTS);

	return (
		<div className="space-y-10" data-testid="archive-curation-panel">
			{/* The curation ledger */}
			<section className="space-y-4">
				<div className="flex flex-wrap items-center gap-3">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{labels.ledgerHeading}
					</h2>
					<span
						data-testid="run-curate"
						className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"
					>
						{labels.runCurateLabel}
					</span>
				</div>
				<p className="text-xs text-muted-foreground">
					{labels.stillPresentNote}
				</p>
				<ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
					{decisions.map((d) => (
						<li
							key={d.nodeId}
							data-testid={`ledger-row-${d.nodeId}`}
							data-verdict={d.verdict}
							className="flex flex-wrap items-center gap-3 bg-card px-4 py-3"
						>
							<code className="font-mono text-sm text-foreground">
								{d.nodeId}
							</code>
							<span
								data-testid={`verdict-${d.nodeId}`}
								className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold uppercase ${badgeClass[d.verdict]}`}
							>
								{labels.verdictNames[d.verdict]}
							</span>
							<span className="font-mono text-xs text-muted-foreground">
								{labels.reasonLabel}: {d.reason}
							</span>
						</li>
					))}
				</ul>
			</section>

			{/* The MAP-Elites niche grid */}
			<section className="space-y-4">
				<div className="flex flex-wrap items-center gap-3">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{labels.nicheHeading}
					</h2>
					<span
						data-testid="run-elites"
						className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"
					>
						{labels.runElitesLabel}
					</span>
				</div>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{grid.map((cell) => (
						<article
							key={cell.niche}
							data-testid={`niche-cell-${cell.niche}`}
							data-filled={cell.elite ? "true" : "false"}
							className="space-y-2 rounded-xl border border-border bg-card p-4"
						>
							<code className="block font-mono text-sm text-foreground">
								{cell.niche || "—"}
							</code>
							{cell.elite ? (
								<dl className="space-y-1 text-sm">
									<div className="flex items-center gap-2">
										<dt className="text-muted-foreground">
											{labels.eliteLabel}:
										</dt>
										<dd
											data-testid={`elite-${cell.niche}`}
											className="inline-flex items-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-xs text-emerald-600 dark:text-emerald-400"
										>
											{cell.elite.id}
										</dd>
									</div>
									<div className="flex items-center gap-2">
										<dt className="text-muted-foreground">
											{labels.fitnessLabel}:
										</dt>
										<dd className="font-mono text-foreground">
											{cell.elite.fitness}
										</dd>
									</div>
								</dl>
							) : (
								<div data-testid={`empty-${cell.niche}`} className="space-y-1">
									<p className="text-sm font-medium text-muted-foreground">
										{labels.emptyCell}
									</p>
									<p className="text-xs text-muted-foreground">
										{labels.emptyCellNote}
									</p>
								</div>
							)}
						</article>
					))}
				</div>
			</section>
		</div>
	);
}
