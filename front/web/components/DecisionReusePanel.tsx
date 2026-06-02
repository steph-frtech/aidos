"use client";

import { useState } from "react";
import {
	type ChipState,
	chipStates,
	DIMENSIONS,
	type Dimension,
	decide,
} from "@/lib/contextgraph";
import { LEDGER, LEDGER_NOW } from "@/lib/contextgraph-data";

/**
 * DecisionReusePanel — the action-capable /decision-reuse panel (S32). The human RUNS the reuse
 * gate FROM THE SCREEN, calling the SAME pure twin the Go engine computes
 * (back/archive/brain/contextgraph.Decide): pick a ledger entry, click DÉCIDER, and the verdict
 * appears — an ALLOW (green) / BLOCK (red) badge, the four dimension chips (time/scope/authority/
 * conditions, each pass/fail/skip), the human-readable reason, and a needs-human-review flag.
 *
 * The verdict is COMPUTED by lib/contextgraph.ts (the deterministic twin), never an LLM and never
 * re-implemented here — "Le LLM ne vit pas dans le ContextGraph" (KRD §119.2). `now` is the fixed
 * LEDGER_NOW passed in, never the browser clock, so the on-screen verdict matches the engine and
 * is replayable. READ-ONLY against truth (the wall): `context` is above the waterline; a new
 * decision is recorded by the aidos writer role via a ChangeSet (S20), never this screen. Themed
 * (ADR 0010), bilingual (ADR 0011) — labels passed in.
 */

interface Labels {
	decideCta: string;
	allowBadge: string;
	blockBadge: string;
	needsReviewFlag: string;
	candidateLabel: string;
	requestLabel: string;
	reasonLabel: string;
	dimensionsLabel: string;
	verdictPending: string;
	dim: Record<Dimension, string>;
	rowTitle: Record<string, string>;
}

function chipClasses(state: ChipState): string {
	if (state === "fail")
		return "border-red-500/50 bg-red-500/15 text-red-700 dark:text-red-300";
	if (state === "pass")
		return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
	return "border-border bg-muted text-muted-foreground";
}

export function DecisionReusePanel({ labels }: { labels: Labels }) {
	// Verdicts are computed lazily per row when the human clicks DÉCIDER (action-capable).
	const [decided, setDecided] = useState<Record<string, boolean>>({});

	return (
		<div className="space-y-6" data-testid="decision-reuse-panel">
			{LEDGER.map((entry) => {
				const isDecided = decided[entry.rowId] ?? false;
				const verdict = decide(entry.candidate, entry.request, LEDGER_NOW);
				const chips = chipStates(verdict);
				const requestRegion = entry.request.scope.region ?? "(aucune)";
				const candRegion = entry.candidate.scope.region ?? "(aucune)";

				return (
					<article
						key={entry.rowId}
						data-testid="ledger-row"
						data-row={entry.rowId}
						className="rounded-xl border border-border bg-card p-5 shadow-sm"
					>
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div className="space-y-1">
								<h3 className="text-sm font-semibold tracking-tight text-foreground">
									{labels.rowTitle[entry.rowId] ?? entry.rowId}
								</h3>
								<p className="font-mono text-xs text-muted-foreground">
									<span className="text-foreground/70">
										{labels.candidateLabel}
									</span>{" "}
									{entry.candidate.id} · region={candRegion}
									{entry.candidate.expiresAt
										? ` · expires=${entry.candidate.expiresAt}`
										: ""}
								</p>
								<p className="font-mono text-xs text-muted-foreground">
									<span className="text-foreground/70">
										{labels.requestLabel}
									</span>{" "}
									region={requestRegion}
									{entry.request.domain
										? ` · domain=${entry.request.domain}`
										: ""}
								</p>
							</div>

							{isDecided ? (
								<span
									data-testid="verdict-badge"
									data-verdict={verdict.mayReuse ? "allow" : "block"}
									className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${
										verdict.mayReuse
											? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
											: "border-red-500/50 bg-red-500/15 text-red-700 dark:text-red-300"
									}`}
								>
									{verdict.mayReuse ? labels.allowBadge : labels.blockBadge}
								</span>
							) : (
								<button
									type="button"
									data-testid="run-decide"
									data-row={entry.rowId}
									onClick={() =>
										setDecided((d) => ({ ...d, [entry.rowId]: true }))
									}
									className="inline-flex items-center rounded-md border border-blue-600/40 bg-blue-600/10 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-600/20 dark:text-blue-300"
								>
									{labels.decideCta}
								</button>
							)}
						</div>

						{/* The four dimension chips — time/scope/authority/conditions, each pass/fail/skip. */}
						<div className="mt-4 space-y-2">
							<p className="text-xs font-medium text-muted-foreground">
								{labels.dimensionsLabel}
							</p>
							<ul
								className="flex flex-wrap gap-2"
								data-testid="dimension-chips"
							>
								{DIMENSIONS.map((dim) => {
									const state: ChipState = isDecided ? chips[dim] : "skip";
									return (
										<li
											key={dim}
											data-testid="dimension-chip"
											data-dimension={dim}
											data-state={state}
											className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${chipClasses(state)}`}
										>
											{labels.dim[dim]}
											{state === "fail" ? " ✗" : state === "pass" ? " ✓" : ""}
										</li>
									);
								})}
							</ul>
						</div>

						{isDecided ? (
							<div className="mt-4 space-y-2">
								<p
									data-testid="verdict-reason"
									className="text-sm text-foreground/80"
								>
									<span className="font-medium text-muted-foreground">
										{labels.reasonLabel}{" "}
									</span>
									{verdict.reason}
								</p>
								{verdict.requiredHumanReview ? (
									<p
										data-testid="needs-review-flag"
										className="inline-flex items-center rounded-md border border-amber-500/50 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300"
									>
										{labels.needsReviewFlag}
									</p>
								) : null}
							</div>
						) : (
							<p
								className="mt-4 text-xs italic text-muted-foreground"
								data-testid="verdict-pending"
							>
								{labels.verdictPending}
							</p>
						)}
					</article>
				);
			})}
		</div>
	);
}
