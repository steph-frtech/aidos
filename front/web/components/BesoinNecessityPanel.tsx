"use client";

import { useState } from "react";
import { decide, type Verdict } from "@/lib/besoin-necessity";

/**
 * BesoinNecessityPanel — the action-capable /besoin-necessity panel (EL01 spike). The human RUNS
 * the necessity comparison FROM THE SCREEN, calling the SAME pure twin the Go probe computes
 * (spike/besoin.Decide / lib/besoin-necessity.decide): click COMPARER LES DEUX CAPTURES and the
 * verdict appears — a GO (green) / NO-GO (red) badge, the side-by-side richness table (BesoinGraph
 * vs flat prompt), the strict-dominance deltas, the computed rationale, and the harvested DRAFT
 * candidate-Idea card (no mirror, no frozen version — the wall).
 *
 * The verdict is COMPUTED by lib/besoin-necessity.ts (the deterministic twin), never an LLM and
 * never re-implemented here — projecting a need to a backlog is a pure function (determinism-first).
 * SPIKE-scoped + READ-ONLY against truth (the wall): this measures a probe, it writes nothing (no
 * kernel/mirror/fitness). EL02+ builds the real back/runtime/besoin package. Themed (ADR 0010),
 * bilingual (ADR 0011) — labels passed in.
 */

interface Labels {
	runCta: string;
	goBadge: string;
	noGoBadge: string;
	pending: string;
	tableHeading: string;
	colMetric: string;
	colGraph: string;
	colFlat: string;
	colDelta: string;
	rowIdeas: string;
	rowResolved: string;
	rowTyped: string;
	rowAnchored: string;
	rowOrdered: string;
	rowNoEmit: string;
	yes: string;
	no: string;
	floor: string;
	rationaleLabel: string;
	harvestHeading: string;
	harvestProposes: string;
	harvestStatus: string;
	harvestNoMirror: string;
	harvestNoVersion: string;
	harvestIntentLabel: string;
	harvestOqLabel: string;
}

function bool(v: boolean, yes: string, no: string) {
	return v ? yes : no;
}

export function BesoinNecessityPanel({ labels }: { labels: Labels }) {
	const [verdict, setVerdict] = useState<Verdict | null>(null);

	return (
		<div className="space-y-6" data-testid="besoin-necessity-panel">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-sm text-muted-foreground">
					besoin <span className="font-mono">demo-checkout</span> : BesoinGraph
					vs boîte texte-libre
				</p>
				{verdict ? (
					<span
						data-testid="verdict-badge"
						data-verdict={verdict.go ? "go" : "no-go"}
						className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${
							verdict.go
								? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
								: "border-red-500/50 bg-red-500/15 text-red-700 dark:text-red-300"
						}`}
					>
						{verdict.go ? labels.goBadge : labels.noGoBadge}
					</span>
				) : (
					<button
						type="button"
						data-testid="run-compare"
						onClick={() => setVerdict(decide())}
						className="inline-flex items-center rounded-md border border-blue-600/40 bg-blue-600/10 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-600/20 dark:text-blue-300"
					>
						{labels.runCta}
					</button>
				)}
			</div>

			{verdict ? (
				<div className="space-y-6">
					{/* The richness comparison — the falsifiable measurement. */}
					<article
						data-testid="richness-table"
						className="rounded-xl border border-border bg-card p-5 shadow-sm"
					>
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{labels.tableHeading}
						</h3>
						<table className="mt-3 w-full text-sm">
							<thead>
								<tr className="text-left text-xs text-muted-foreground">
									<th className="py-1 font-medium">{labels.colMetric}</th>
									<th className="py-1 text-right font-medium">
										{labels.colGraph}
									</th>
									<th className="py-1 text-right font-medium">
										{labels.colFlat}
									</th>
									<th className="py-1 text-right font-medium">
										{labels.colDelta}
									</th>
								</tr>
							</thead>
							<tbody className="font-mono text-foreground">
								<tr data-testid="row-ideas">
									<td className="py-1 font-sans text-muted-foreground">
										{labels.rowIdeas}
									</td>
									<td className="py-1 text-right">
										{verdict.cmp.graph.numIdeas}
									</td>
									<td className="py-1 text-right">
										{verdict.cmp.flat.numIdeas}
									</td>
									<td className="py-1 text-right text-emerald-700 dark:text-emerald-300">
										+{verdict.cmp.deltaIdeas}
									</td>
								</tr>
								<tr>
									<td className="py-1 font-sans text-muted-foreground">
										{labels.rowResolved}
									</td>
									<td className="py-1 text-right">
										{verdict.cmp.graph.numResolved}
									</td>
									<td className="py-1 text-right">
										{verdict.cmp.flat.numResolved}
									</td>
									<td className="py-1 text-right text-emerald-700 dark:text-emerald-300">
										+{verdict.cmp.deltaResolved}
									</td>
								</tr>
								<tr>
									<td className="py-1 font-sans text-muted-foreground">
										{labels.rowTyped}
									</td>
									<td className="py-1 text-right">
										{verdict.cmp.graph.numFullyTyped}
									</td>
									<td className="py-1 text-right">
										{verdict.cmp.flat.numFullyTyped}
									</td>
									<td className="py-1 text-right text-emerald-700 dark:text-emerald-300">
										+{verdict.cmp.deltaFullyTyped}
									</td>
								</tr>
								<tr>
									<td className="py-1 font-sans text-muted-foreground">
										{labels.rowAnchored}
									</td>
									<td className="py-1 text-right">
										{verdict.cmp.graph.numAnchored}
									</td>
									<td className="py-1 text-right">
										{verdict.cmp.flat.numAnchored}
									</td>
									<td className="py-1 text-right text-emerald-700 dark:text-emerald-300">
										+{verdict.cmp.deltaAnchored}
									</td>
								</tr>
								<tr>
									<td className="py-1 font-sans text-muted-foreground">
										{labels.rowOrdered}
									</td>
									<td className="py-1 text-right">
										{bool(verdict.cmp.graphOrdered, labels.yes, labels.no)}
									</td>
									<td className="py-1 text-right">
										{bool(verdict.cmp.flatOrdered, labels.yes, labels.no)}
									</td>
									<td className="py-1 text-right text-muted-foreground">—</td>
								</tr>
								<tr>
									<td className="py-1 font-sans text-muted-foreground">
										{labels.rowNoEmit}
									</td>
									<td className="py-1 text-right">
										{verdict.cmp.graph.noEmitSeeded}
									</td>
									<td className="py-1 text-right">
										{verdict.cmp.flat.noEmitSeeded}
									</td>
									<td className="py-1 text-right text-muted-foreground">—</td>
								</tr>
							</tbody>
						</table>
						<p className="mt-3 text-xs text-muted-foreground">
							{labels.floor}: +{verdict.minIdeaGain}
						</p>
					</article>

					<p
						data-testid="verdict-rationale"
						className="text-sm leading-relaxed text-foreground/80"
					>
						<span className="font-medium text-muted-foreground">
							{labels.rationaleLabel}{" "}
						</span>
						{verdict.rationale}
					</p>

					{/* The harvested DRAFT candidate-Idea — the wall: no mirror, no frozen version. */}
					<article
						data-testid="harvest-card"
						className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-5"
					>
						<div className="flex flex-wrap items-center gap-2">
							<h3 className="text-sm font-semibold tracking-tight text-foreground">
								{labels.harvestHeading}
							</h3>
							<span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
								{labels.harvestNoMirror}
							</span>
							<span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
								{labels.harvestNoVersion}
							</span>
						</div>
						<dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
							<dt className="text-muted-foreground">
								{labels.harvestProposes}
							</dt>
							<dd className="font-mono text-foreground">
								{verdict.harvest.proposes}
							</dd>
							<dt className="text-muted-foreground">{labels.harvestStatus}</dt>
							<dd className="font-mono text-foreground">
								{verdict.harvest.status}
							</dd>
						</dl>
						<p className="mt-3 text-sm leading-relaxed text-foreground/80">
							<span className="font-medium text-muted-foreground">
								{labels.harvestIntentLabel}{" "}
							</span>
							{verdict.harvest.intent}
						</p>
						<details className="mt-3 text-xs text-muted-foreground">
							<summary className="cursor-pointer font-medium">
								{labels.harvestOqLabel} ({verdict.harvest.openQuestions.length})
							</summary>
							<ul className="mt-2 list-disc space-y-1 pl-5">
								{verdict.harvest.openQuestions.map((oq) => (
									<li key={oq}>{oq}</li>
								))}
							</ul>
						</details>
					</article>
				</div>
			) : (
				<p
					className="text-xs italic text-muted-foreground"
					data-testid="verdict-pending"
				>
					{labels.pending}
				</p>
			)}
		</div>
	);
}
