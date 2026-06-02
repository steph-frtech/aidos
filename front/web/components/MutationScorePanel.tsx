"use client";

import { useMemo, useState } from "react";
import { gate } from "@/lib/mutation";
import {
	DECLARED_THRESHOLD,
	RUN_HISTORY,
	SCENARIOS,
} from "@/lib/mutation-data";

export interface MutationLabels {
	scenarioLabel: string;
	verdictLabel: string;
	verdictPass: string;
	verdictBlock: string;
	scoreLabel: string;
	thresholdLabel: string;
	readOnlyBadge: string;
	survivingTitle: string;
	survivingEmpty: string;
	blockReasonLabel: string;
	howToFixLabel: string;
	historyTitle: string;
	colScope: string;
	colScore: string;
	colThreshold: string;
	colVerdict: string;
	colStarted: string;
	scenarioBelow: string;
	scenarioAtBar: string;
	scenarioWeakened: string;
	scenarioMissingThreshold: string;
}

function pct(v: number): string {
	return `${Math.round(v * 1000) / 10}%`;
}

export function MutationScorePanel({ labels }: { labels: MutationLabels }) {
	const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
	const scenario = useMemo(
		() => SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0],
		[scenarioId],
	);
	// Action: re-run the SAME pure twin the Go gate runs, live, on the selection.
	const gated = useMemo(
		() => gate(scenario.report, scenario.threshold),
		[scenario],
	);

	const titleFor = (key: string) =>
		(labels as unknown as Record<string, string>)[key] ?? key;
	const passed = gated.verdict === "pass";
	const barPct =
		scenario.threshold === null ? DECLARED_THRESHOLD : gated.threshold;

	return (
		<div className="space-y-8" data-testid="mutation-panel">
			{/* Action: pick a scenario → live re-run of the gate twin */}
			<section className="rounded-lg border border-border bg-card p-5">
				<div className="flex flex-wrap items-end gap-3">
					<label className="flex flex-col gap-1 text-sm">
						<span className="font-medium text-foreground">
							{labels.scenarioLabel}
						</span>
						<select
							data-testid="scenario-select"
							value={scenarioId}
							onChange={(e) => setScenarioId(e.target.value)}
							className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
						>
							{SCENARIOS.map((s) => (
								<option key={s.id} value={s.id}>
									{titleFor(s.titleKey)}
								</option>
							))}
						</select>
					</label>
					<span
						data-testid="verdict"
						data-verdict={gated.verdict}
						className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${
							passed
								? "bg-primary/10 text-primary"
								: "bg-destructive/10 text-destructive"
						}`}
					>
						{labels.verdictLabel}:{" "}
						{passed ? labels.verdictPass : labels.verdictBlock}
					</span>
				</div>

				{/* The gauge: score vs the declared read-only bar */}
				<div className="mt-5">
					<div className="flex items-baseline justify-between text-sm">
						<span className="text-muted-foreground">{labels.scoreLabel}</span>
						<span
							data-testid="score"
							className="font-mono text-lg font-bold text-foreground"
						>
							{pct(gated.score)}
						</span>
					</div>
					<div className="relative mt-2 h-4 w-full overflow-hidden rounded-full bg-muted">
						<div
							data-testid="score-bar"
							className={`h-full ${passed ? "bg-primary" : "bg-destructive"}`}
							style={{ width: `${gated.score * 100}%` }}
						/>
						{/* the declared threshold bar (read-only marker) */}
						<div
							data-testid="threshold-marker"
							className="absolute top-0 h-full w-0.5 bg-foreground"
							style={{ left: `${barPct * 100}%` }}
						/>
					</div>
					<div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
						<span data-testid="threshold">
							{labels.thresholdLabel}: {pct(barPct)}
						</span>
						<span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 font-medium uppercase tracking-wide">
							{labels.readOnlyBadge}
						</span>
					</div>
				</div>
			</section>

			{/* The block reason (structural blocks: missing / unparsable) */}
			{gated.blockReason && (
				<section
					data-testid="block-reason"
					className="rounded-lg border border-destructive/40 bg-destructive/5 p-5"
				>
					<div className="flex items-center gap-2">
						<code className="rounded bg-destructive/10 px-2 py-1 font-mono text-sm font-semibold text-destructive">
							{gated.blockReason.code}
						</code>
						<span className="text-sm font-medium text-foreground">
							{labels.blockReasonLabel}
						</span>
					</div>
					<p className="mt-2 text-sm text-muted-foreground">
						{gated.blockReason.explanation}
					</p>
					<p className="mt-3 text-xs font-medium text-foreground">
						{labels.howToFixLabel}
					</p>
					<ol className="mt-1 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
						{gated.blockReason.howToFix.map((step) => (
							<li key={step}>{step}</li>
						))}
					</ol>
				</section>
			)}

			{/* The surviving-mutant list (the holes to plug) */}
			<section className="rounded-lg border border-border bg-card p-5">
				<h3 className="text-sm font-semibold text-foreground">
					{labels.survivingTitle}
				</h3>
				{gated.survivingMutants.length === 0 ? (
					<p
						data-testid="survivors-empty"
						className="mt-2 text-sm text-muted-foreground"
					>
						{labels.survivingEmpty}
					</p>
				) : (
					<ul data-testid="survivors" className="mt-3 space-y-2">
						{gated.survivingMutants.map((m) => (
							<li
								key={`${m.file}:${m.line}:${m.operator}`}
								data-testid="survivor"
								className="rounded-md border border-border bg-background px-3 py-2 text-xs"
							>
								<code className="font-mono text-foreground">
									{m.file}:{m.line}
								</code>
								<span className="ml-2 inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 font-medium">
									{m.operator}
								</span>
								{m.gap && <p className="mt-1 text-muted-foreground">{m.gap}</p>}
							</li>
						))}
					</ul>
				)}
			</section>

			{/* Append-only run history (projection of runtime.mutation_runs) */}
			<section className="rounded-lg border border-border bg-card p-5">
				<h3 className="text-sm font-semibold text-foreground">
					{labels.historyTitle}
				</h3>
				<table className="mt-3 w-full text-left text-xs">
					<thead className="text-muted-foreground">
						<tr>
							<th className="py-1 pr-4 font-medium">{labels.colScope}</th>
							<th className="py-1 pr-4 font-medium">{labels.colScore}</th>
							<th className="py-1 pr-4 font-medium">{labels.colThreshold}</th>
							<th className="py-1 pr-4 font-medium">{labels.colVerdict}</th>
							<th className="py-1 font-medium">{labels.colStarted}</th>
						</tr>
					</thead>
					<tbody className="font-mono text-foreground">
						{RUN_HISTORY.map((r) => (
							<tr
								key={r.runId}
								data-testid="history-row"
								className="border-t border-border"
							>
								<td className="py-1.5 pr-4">{r.scope}</td>
								<td className="py-1.5 pr-4">{pct(r.score)}</td>
								<td className="py-1.5 pr-4">{pct(r.threshold)}</td>
								<td className="py-1.5 pr-4">
									<span
										className={
											r.verdict === "pass" ? "text-primary" : "text-destructive"
										}
									>
										{r.verdict === "pass"
											? labels.verdictPass
											: labels.verdictBlock}
									</span>
								</td>
								<td className="py-1.5">{r.startedAt}</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>
		</div>
	);
}
