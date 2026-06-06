"use client";

import { useState } from "react";
import { type Capture, compound, GOAL_CLOSE } from "@/lib/compound";

/**
 * GesturePanel — the action-capable /compound GESTURE control (CE03). The human RUNS the
 * capitalisation gesture FROM THE SCREEN, calling the SAME pure twin the Go gesture computes
 * (back/runtime/compound.Compound / lib/compound.compound): click LANCER /compound and the events
 * appear — ONE KindProcedural memory entry (the captured gesture motif) and ONE DRAFT
 * behavior-candidate idea proposed via the wall (firewall.ViaIdea → idée → miroir → /goal).
 *
 * THE WALL (CLAUDE.md §2/§7): this gesture writes NOTHING above the line — the candidate is a
 * propose→ChangeSet draft, never a direct kernel write; the "AUCUNE écriture kernel" badge is the
 * computed proof (Capture.wroteKernel is always false). Determinism-first: the events are computed
 * by lib/compound.ts (no LLM, no clock), never re-implemented here. Themed (ADR 0010), bilingual
 * (ADR 0011) — labels passed in.
 */

interface Labels {
	runCta: string;
	heading: string;
	proceduralHeading: string;
	behaviorHeading: string;
	kindLabel: string;
	statusLabel: string;
	provenanceLabel: string;
	branchLabel: string;
	noKernelBadge: string;
	draftBadge: string;
	pending: string;
	emptyProcedural: string;
	emptyBehavior: string;
}

export function GesturePanel({ labels }: { labels: Labels }) {
	const [capture, setCapture] = useState<Capture | null>(null);

	return (
		<div className="space-y-6" data-testid="gesture-panel">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-sm text-muted-foreground">
					goal <span className="font-mono">{GOAL_CLOSE.goalId}</span>{" "}
					<span className="font-mono">({GOAL_CLOSE.branch})</span>
				</p>
				{capture ? (
					<span
						data-testid="no-kernel-badge"
						data-wrote-kernel={String(capture.wroteKernel)}
						className="inline-flex items-center rounded-md border border-emerald-500/50 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
					>
						{labels.noKernelBadge}
					</span>
				) : (
					<button
						type="button"
						data-testid="run-compound"
						onClick={() => setCapture(compound(GOAL_CLOSE))}
						className="inline-flex items-center rounded-md border border-blue-600/40 bg-blue-600/10 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-600/20 dark:text-blue-300"
					>
						{labels.runCta}
					</button>
				)}
			</div>

			{capture ? (
				<div className="space-y-6" data-testid="gesture-result">
					{/* EVENT 1 — the procedural memory entry. */}
					<article
						data-testid="procedural-entry"
						className="rounded-xl border border-border bg-card p-5 shadow-sm"
					>
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{labels.proceduralHeading}
						</h3>
						{capture.proceduralWrites.length > 0 ? (
							capture.proceduralWrites.map((p) => (
								<dl
									key={p.content}
									className="mt-3 space-y-2 text-sm"
									data-testid="procedural-row"
								>
									<div className="flex items-center gap-2">
										<span className="text-muted-foreground">
											{labels.kindLabel}:
										</span>
										<span
											data-testid="procedural-kind"
											className="inline-flex items-center rounded-md border border-blue-600/40 bg-blue-600/10 px-2 py-0.5 font-mono text-xs font-medium text-blue-700 dark:text-blue-300"
										>
											{p.kind}
										</span>
										<span className="text-muted-foreground">
											{labels.branchLabel}:
										</span>
										<span className="font-mono text-xs text-foreground">
											{p.branch}
										</span>
									</div>
									<p className="leading-relaxed text-foreground/80">
										{p.content}
									</p>
									<p className="text-xs text-muted-foreground">
										{labels.provenanceLabel}:{" "}
										<span className="font-mono">{p.provenance}</span>
									</p>
								</dl>
							))
						) : (
							<p className="mt-3 text-xs italic text-muted-foreground">
								{labels.emptyProcedural}
							</p>
						)}
					</article>

					{/* EVENT 2 — the draft behavior candidate, via the wall. */}
					<article
						data-testid="behavior-candidate"
						className="rounded-xl border border-border bg-card p-5 shadow-sm"
					>
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{labels.behaviorHeading}
						</h3>
						{capture.behaviorCandidates.length > 0 ? (
							capture.behaviorCandidates.map((c) => (
								<dl
									key={c.intent}
									className="mt-3 space-y-2 text-sm"
									data-testid="behavior-row"
								>
									<div className="flex items-center gap-2">
										<span className="text-muted-foreground">
											{labels.statusLabel}:
										</span>
										<span
											data-testid="behavior-status"
											className="inline-flex items-center rounded-md border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 font-mono text-xs font-medium text-amber-700 dark:text-amber-300"
										>
											{c.status}
										</span>
										<span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
											{labels.draftBadge}
										</span>
									</div>
									<p className="leading-relaxed text-foreground/80">
										{c.intent}
									</p>
									<p className="text-xs text-muted-foreground">
										{labels.provenanceLabel}:{" "}
										<span className="font-mono">{c.provenance}</span>
									</p>
								</dl>
							))
						) : (
							<p className="mt-3 text-xs italic text-muted-foreground">
								{labels.emptyBehavior}
							</p>
						)}
					</article>
				</div>
			) : (
				<p
					className="text-xs italic text-muted-foreground"
					data-testid="gesture-pending"
				>
					{labels.pending}
				</p>
			)}
		</div>
	);
}
