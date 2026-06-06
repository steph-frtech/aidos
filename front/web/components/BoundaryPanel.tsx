"use client";

import { useState } from "react";
import { type Boundary, boundary } from "@/lib/compound";

/**
 * BoundaryPanel — the action-capable CE02 panel. The human clicks AFFICHER LA FRONTIÈRE and the
 * panel runs the SAME pure twin the Go probe computes (back/runtime/compound.Compute /
 * lib/compound.boundary): the capitalisation boundary appears — the 2 CAPITALISE rows (procedural
 * recall + behavior-macro, both VIA THE WALL), the 3 FORBIDDEN frontiers, and the two load-bearing
 * invariants made visible (every capitalise row crosses the wall AND none touches the fitness:
 * CAPITALISATION ≠ APPRENTISSAGE DE CRITÈRES — tout via /goal).
 *
 * The boundary is COMPUTED by lib/compound.ts (the deterministic twin), never an LLM and never
 * re-implemented here — the decision is a declared table, not a learned judgment (determinism-first).
 * READ-ONLY against truth (the wall): it replays the pure boundary, it writes nothing
 * (no kernel/mirror/fitness). Themed (ADR 0010), bilingual (ADR 0011) — labels passed in.
 */

interface Labels {
	runCta: string;
	heading: string;
	capitalise: string;
	forbidden: string;
	viaWallBadge: string;
	fitnessSafeBadge: string;
	colSubject: string;
	colChannel: string;
	pending: string;
	lineLabel: string;
}

const SUBJECT_FR: Record<string, string> = {
	gesture_pattern: "Motif de gestes",
	spec_pattern: "Motif de spec",
	intrinsic_substance: "Substance intrinsèque",
	fitness_weights_criteria: "Fitness / poids / critères",
	direct_kernel_write: "Écriture kernel directe",
};

const CHANNEL_FR: Record<string, string> = {
	procedural_memory: "Recall procédural (S31)",
	behavior_macro: "Behavior-macro (§24.6)",
	"": "—",
};

export function BoundaryPanel({ labels }: { labels: Labels }) {
	const [b, setB] = useState<Boundary | null>(null);

	return (
		<div className="space-y-6" data-testid="boundary-panel">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				{b ? (
					<div className="flex flex-wrap gap-2">
						<span
							data-testid="capitalise-count"
							className="inline-flex items-center rounded-md border border-blue-600/40 bg-blue-600/10 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300"
						>
							{labels.capitalise}: {b.capitalise}
						</span>
						<span
							data-testid="forbidden-count"
							className="inline-flex items-center rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground"
						>
							{labels.forbidden}: {b.forbidden}
						</span>
					</div>
				) : (
					<button
						type="button"
						data-testid="run-boundary"
						onClick={() => setB(boundary())}
						className="inline-flex items-center rounded-md border border-blue-600/40 bg-blue-600/10 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-600/20 dark:text-blue-300"
					>
						{labels.runCta}
					</button>
				)}
			</div>

			{b ? (
				<div className="space-y-4">
					{/* The two load-bearing invariants made visible. */}
					<div className="flex flex-wrap gap-2">
						{b.allCapitaliseViaWall ? (
							<span
								data-testid="via-wall-ok"
								className="inline-flex items-center rounded-md border border-emerald-500/50 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
							>
								{labels.viaWallBadge}
							</span>
						) : null}
						{b.noCapitaliseTouchesFitness ? (
							<span
								data-testid="fitness-safe-ok"
								className="inline-flex items-center rounded-md border border-emerald-500/50 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
							>
								{labels.fitnessSafeBadge}
							</span>
						) : null}
					</div>

					<table
						className="w-full text-left text-sm"
						data-testid="boundary-table"
					>
						<thead>
							<tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
								<th className="py-2 pr-4 font-medium">{labels.colSubject}</th>
								<th className="py-2 pr-4 font-medium">{labels.colChannel}</th>
								<th className="py-2 font-medium">{labels.lineLabel}</th>
							</tr>
						</thead>
						<tbody>
							{b.rows.map((r) => (
								<tr
									key={r.subject}
									data-testid={`row-${r.subject}`}
									data-disposition={r.disposition}
									className="border-b border-border/60 align-top"
								>
									<td className="py-2 pr-4">
										<span className="font-medium text-foreground">
											{SUBJECT_FR[r.subject] ?? r.subject}
										</span>
										<span
											className={`ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
												r.disposition === "capitalise"
													? "bg-blue-600/15 text-blue-700 dark:text-blue-300"
													: "bg-muted text-muted-foreground"
											}`}
										>
											{r.disposition === "capitalise"
												? labels.capitalise
												: labels.forbidden}
										</span>
									</td>
									<td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
										{CHANNEL_FR[r.channel] ?? r.channel}
									</td>
									<td className="py-2 text-xs leading-relaxed text-muted-foreground">
										{r.rationale}
									</td>
								</tr>
							))}
						</tbody>
					</table>

					<p
						data-testid="boundary-line"
						className="text-sm leading-relaxed text-foreground/80"
					>
						{b.line}
					</p>
				</div>
			) : (
				<p
					className="text-xs italic text-muted-foreground"
					data-testid="boundary-pending"
				>
					{labels.pending}
				</p>
			)}
		</div>
	);
}
