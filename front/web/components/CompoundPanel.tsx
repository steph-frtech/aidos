"use client";

import { useState } from "react";
import { decide, type Verdict } from "@/lib/compound";

/**
 * CompoundPanel — the action-capable /compound panel (CE01 spike). The human RUNS the
 * capitalisation measurement FROM THE SCREEN, calling the SAME pure twin the Go probe computes
 * (spike/compound.Decide / lib/compound.decide): click MESURER LE DELTA and the verdict appears —
 * a GO (green) / NO-GO (red) badge, the similar-pair token bars (goal-2 with vs without capture),
 * the reuse split (procedural recall / behavior-macro expansion), the dissimilar control (the
 * false-positive guard), and the computed rationale.
 *
 * The verdict is COMPUTED by lib/compound.ts (the deterministic twin), never an LLM and never
 * re-implemented here — the expansion of a captured motif is a pure function (determinism-first).
 * SPIKE-scoped + READ-ONLY against truth (the wall): this measures a probe, it writes nothing
 * (no kernel/mirror/fitness). CE02+ rebuilds the real capitalisation loop via firewall.ViaIdea.
 * Themed (ADR 0010), bilingual (ADR 0011) — labels passed in.
 */

interface Labels {
	runCta: string;
	goBadge: string;
	noGoBadge: string;
	pending: string;
	similarHeading: string;
	dissimilarHeading: string;
	withoutCap: string;
	withCap: string;
	saved: string;
	reduction: string;
	floor: string;
	ceiling: string;
	reusedProcedural: string;
	reusedBehavior: string;
	reproducible: string;
	rationaleLabel: string;
}

export function CompoundPanel({ labels }: { labels: Labels }) {
	const [verdict, setVerdict] = useState<Verdict | null>(null);

	return (
		<div className="space-y-6" data-testid="compound-panel">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-sm text-muted-foreground">
					goal-1 <span className="font-mono">order-archive</span> → goal-2{" "}
					<span className="font-mono">invoice-archive</span>
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
						data-testid="run-measure"
						onClick={() => setVerdict(decide())}
						className="inline-flex items-center rounded-md border border-blue-600/40 bg-blue-600/10 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-600/20 dark:text-blue-300"
					>
						{labels.runCta}
					</button>
				)}
			</div>

			{verdict ? (
				<div className="space-y-6">
					{/* The SIMILAR pair — the decision driver. */}
					<article
						data-testid="similar-pair"
						className="rounded-xl border border-border bg-card p-5 shadow-sm"
					>
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{labels.similarHeading}
						</h3>
						<dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
							<dt className="text-muted-foreground">{labels.withoutCap}</dt>
							<dd
								data-testid="similar-without"
								className="text-right font-mono text-foreground"
							>
								{verdict.similar.goal2WithoutCap}
							</dd>
							<dt className="text-muted-foreground">{labels.withCap}</dt>
							<dd
								data-testid="similar-with"
								className="text-right font-mono text-foreground"
							>
								{verdict.similar.goal2WithCap}
							</dd>
							<dt className="text-muted-foreground">{labels.saved}</dt>
							<dd className="text-right font-mono text-emerald-700 dark:text-emerald-300">
								{verdict.similar.savedTokens}
							</dd>
							<dt className="text-muted-foreground">{labels.reduction}</dt>
							<dd
								data-testid="similar-reduction"
								className="text-right font-mono font-semibold text-foreground"
							>
								{(verdict.similar.reductionFrac * 100).toFixed(1)}%
							</dd>
						</dl>
						<div className="mt-3 flex flex-wrap gap-2">
							<span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
								{labels.reusedProcedural}: {verdict.similar.reusedProcedural}
							</span>
							<span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
								{labels.reusedBehavior}: {verdict.similar.reusedBehavior}
							</span>
							<span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
								{labels.floor}: {(verdict.reductionFloor * 100).toFixed(0)}%
							</span>
						</div>
					</article>

					{/* The DISSIMILAR control — the false-positive guard. */}
					<article
						data-testid="dissimilar-control"
						className="rounded-xl border border-border bg-card p-5 shadow-sm"
					>
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{labels.dissimilarHeading}
						</h3>
						<dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
							<dt className="text-muted-foreground">{labels.reduction}</dt>
							<dd
								data-testid="dissimilar-reduction"
								className="text-right font-mono text-foreground"
							>
								{(verdict.dissimilar.reductionFrac * 100).toFixed(1)}%
							</dd>
							<dt className="text-muted-foreground">{labels.ceiling}</dt>
							<dd className="text-right font-mono text-foreground">
								{(verdict.dissimilarCeil * 100).toFixed(0)}%
							</dd>
						</dl>
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
