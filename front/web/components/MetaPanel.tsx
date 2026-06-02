"use client";

import { useMemo, useState } from "react";
import { run, sensorsFired } from "@/lib/meta";
import {
	FITNESS_BASELINE_HASH,
	FITNESS_BASELINE_ROWS,
	RUN_HISTORY,
	SCENARIOS,
	SELF_TEST_AT,
} from "@/lib/meta-data";

export interface MetaLabels {
	scenarioLabel: string;
	runCta: string;
	verdictLabel: string;
	verdictGreen: string;
	verdictRed: string;
	guaranteeSensors: string;
	guaranteeWall: string;
	guaranteeFitness: string;
	firedLabel: string;
	notFiredLabel: string;
	injectedFaultLabel: string;
	refusedLabel: string;
	acceptedLabel: string;
	baselineHashLabel: string;
	currentHashLabel: string;
	unchangedYes: string;
	unchangedNo: string;
	blockReasonLabel: string;
	howToFixLabel: string;
	baselinePanelTitle: string;
	baselineOwner: string;
	readOnlyBadge: string;
	historyTitle: string;
	scenarioHealthy: string;
	scenarioMutedSensor: string;
	scenarioBreachedWall: string;
	scenarioMutatedFitness: string;
}

function Dot({ ok }: { ok: boolean }) {
	return (
		<span
			aria-hidden="true"
			className={`inline-block size-2.5 rounded-full ${ok ? "bg-primary" : "bg-destructive"}`}
		/>
	);
}

export function MetaPanel({ labels }: { labels: MetaLabels }) {
	const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
	const scenario = useMemo(
		() => SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0],
		[scenarioId],
	);
	const { report, block } = useMemo(
		() => run(scenario.harness, SELF_TEST_AT),
		[scenario],
	);

	const titleFor = (key: string) =>
		(labels as unknown as Record<string, string>)[key] ?? key;
	const allRefused = report.wallProbe.attempts.every((a) => a.refused);

	return (
		<div className="space-y-8" data-testid="meta-panel">
			{/* Action: pick a harness scenario → live re-run of the self-test twin */}
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
						data-verdict={report.verdict}
						className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${
							report.verdict === "green"
								? "bg-primary/10 text-primary"
								: "bg-destructive/10 text-destructive"
						}`}
					>
						<Dot ok={report.verdict === "green"} />
						{labels.verdictLabel}:{" "}
						{report.verdict === "green"
							? labels.verdictGreen
							: labels.verdictRed}
					</span>
				</div>
			</section>

			{/* The three guarantees */}
			<section className="grid gap-4 sm:grid-cols-3">
				{/* 1. sensors fire */}
				<article
					data-testid="guarantee-sensors"
					className="rounded-lg border border-border bg-card p-4"
				>
					<div className="flex items-center gap-2">
						<Dot
							ok={
								report.sensorsChecked.every((s) => s.fired) &&
								report.sensorsChecked.length > 0
							}
						/>
						<h3 className="text-sm font-semibold text-foreground">
							{labels.guaranteeSensors}
						</h3>
					</div>
					<p
						data-testid="sensors-fired"
						className="mt-1 font-mono text-sm text-muted-foreground"
					>
						{sensorsFired(report)}/{report.sensorsChecked.length}
					</p>
					<ul className="mt-3 space-y-1.5">
						{report.sensorsChecked.map((s) => (
							<li
								key={s.sensorId}
								data-testid={`sensor-probe-${s.sensorId}`}
								className="flex items-center justify-between gap-2 text-xs"
							>
								<span className="flex items-center gap-1.5">
									<Dot ok={s.fired} />
									<code className="font-mono text-card-foreground">
										{s.sensorId}
									</code>
								</span>
								<span className="text-muted-foreground">
									{s.fired ? labels.firedLabel : labels.notFiredLabel}
								</span>
							</li>
						))}
					</ul>
				</article>

				{/* 2. wall holds */}
				<article
					data-testid="guarantee-wall"
					className="rounded-lg border border-border bg-card p-4"
				>
					<div className="flex items-center gap-2">
						<Dot ok={allRefused} />
						<h3 className="text-sm font-semibold text-foreground">
							{labels.guaranteeWall}
						</h3>
					</div>
					<ul className="mt-3 space-y-1.5">
						{report.wallProbe.attempts.map((a) => (
							<li
								key={a.schema}
								data-testid={`wall-attempt-${a.schema}`}
								className="flex items-center justify-between gap-2 text-xs"
							>
								<span className="flex items-center gap-1.5">
									<Dot ok={a.refused} />
									<code className="font-mono text-card-foreground">
										{a.schema}
									</code>
								</span>
								<span className="text-muted-foreground">
									{a.refused ? labels.refusedLabel : labels.acceptedLabel}
								</span>
							</li>
						))}
					</ul>
				</article>

				{/* 3. fitness unchanged */}
				<article
					data-testid="guarantee-fitness"
					className="rounded-lg border border-border bg-card p-4"
				>
					<div className="flex items-center gap-2">
						<Dot ok={report.fitnessProbe.unchanged} />
						<h3 className="text-sm font-semibold text-foreground">
							{labels.guaranteeFitness}
						</h3>
					</div>
					<dl className="mt-3 space-y-1 text-xs">
						<div className="flex justify-between gap-2">
							<dt className="text-muted-foreground">
								{labels.baselineHashLabel}
							</dt>
							<code
								data-testid="baseline-hash"
								className="font-mono text-card-foreground"
							>
								{report.fitnessProbe.baselineHash}
							</code>
						</div>
						<div className="flex justify-between gap-2">
							<dt className="text-muted-foreground">
								{labels.currentHashLabel}
							</dt>
							<code
								data-testid="current-hash"
								className="font-mono text-card-foreground"
							>
								{report.fitnessProbe.currentHash}
							</code>
						</div>
						<div className="flex justify-between gap-2">
							<dt className="text-muted-foreground">
								{labels.guaranteeFitness}
							</dt>
							<span data-testid="fitness-unchanged">
								{report.fitnessProbe.unchanged
									? labels.unchangedYes
									: labels.unchangedNo}
							</span>
						</div>
					</dl>
				</article>
			</section>

			{/* The BlockReason on a red run */}
			{block && (
				<section
					data-testid="block-reason"
					className="rounded-lg border border-destructive/30 bg-destructive/5 p-5"
				>
					<div className="flex items-center gap-2">
						<code
							data-testid="block-reason-code"
							className="rounded bg-destructive/10 px-2 py-1 font-mono text-sm font-semibold text-destructive"
						>
							{block.code}
						</code>
						<span className="text-xs uppercase tracking-wider text-muted-foreground">
							{block.severity}
						</span>
					</div>
					<p className="mt-2 text-sm text-card-foreground">
						{block.explanation}
					</p>
					<p className="mt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
						{labels.howToFixLabel}
					</p>
					<ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-card-foreground">
						{block.howToFix.map((step) => (
							<li key={step}>{step}</li>
						))}
					</ol>
				</section>
			)}

			{/* The read-only fitness baseline (the inviolable NIVEAU 3) */}
			<section
				data-testid="fitness-baseline"
				className="rounded-lg border border-border bg-muted/30 p-5"
			>
				<div className="flex flex-wrap items-center gap-2">
					<h3 className="text-sm font-semibold text-foreground">
						{labels.baselinePanelTitle}
					</h3>
					<span
						data-testid="read-only-badge"
						className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground"
					>
						{labels.readOnlyBadge}
					</span>
				</div>
				<p className="mt-1 text-xs text-muted-foreground">
					{labels.baselineOwner}
				</p>
				<pre
					data-testid="fitness-baseline-rows"
					className="mt-3 overflow-x-auto rounded-md bg-background p-3 font-mono text-xs text-card-foreground"
				>
					{JSON.stringify(JSON.parse(FITNESS_BASELINE_ROWS), null, 2)}
				</pre>
				<p className="mt-2 font-mono text-[0.7rem] text-muted-foreground">
					{labels.baselineHashLabel}: {FITNESS_BASELINE_HASH}
				</p>
			</section>

			{/* The append-only run history */}
			<section
				data-testid="run-history"
				className="rounded-lg border border-border bg-card p-5"
			>
				<h3 className="text-sm font-semibold text-foreground">
					{labels.historyTitle}
				</h3>
				<ul className="mt-3 divide-y divide-border">
					{RUN_HISTORY.map((r) => (
						<li
							key={r.at}
							data-testid="history-row"
							className="flex items-center justify-between py-2 text-xs"
						>
							<span className="flex items-center gap-2">
								<Dot ok={r.verdict === "green"} />
								<code className="font-mono text-muted-foreground">{r.at}</code>
							</span>
							<span className="flex items-center gap-2">
								<span
									className={
										r.verdict === "green" ? "text-primary" : "text-destructive"
									}
								>
									{r.verdict === "green"
										? labels.verdictGreen
										: labels.verdictRed}
								</span>
								{r.code && (
									<code className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-destructive">
										{r.code}
									</code>
								)}
							</span>
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
