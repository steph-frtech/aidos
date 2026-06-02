"use client";

import { useMemo, useState } from "react";
import {
	type DebtItem,
	type DebtKind,
	scan,
	suggestTrim,
} from "@/lib/kernel-debt";
import { SCENARIOS } from "@/lib/kernel-debt-data";

export interface KernelDebtLabels {
	scenarioLabel: string;
	ledgerTitle: string;
	orphanHeader: string;
	staleHeader: string;
	survivorHeader: string;
	emptyDebt: string;
	planTitle: string;
	planEmpty: string;
	requiresLabel: string;
	proposalBadge: string;
	severityLabel: string;
	targetLabel: string;
	noDeleteNote: string;
	scenarioAllThree: string;
	scenarioOrphan: string;
	scenarioStale: string;
	scenarioSurvivor: string;
	scenarioClean: string;
	sevHigh: string;
	sevMedium: string;
	sevLow: string;
	actionRetire: string;
	actionRepin: string;
	actionStrengthen: string;
}

const ACTION_LABEL: Record<string, keyof KernelDebtLabels> = {
	open_idea_to_retire_mirror: "actionRetire",
	open_idea_to_repin_fixture: "actionRepin",
	open_idea_to_strengthen_mirror: "actionStrengthen",
};

function severityClass(sev: string): string {
	switch (sev) {
		case "high":
			return "bg-destructive/15 text-destructive border-destructive/30";
		case "medium":
			return "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400";
		default:
			return "bg-muted text-muted-foreground border-border";
	}
}

function KindGroup({
	kind,
	header,
	items,
	labels,
}: {
	kind: DebtKind;
	header: string;
	items: DebtItem[];
	labels: KernelDebtLabels;
}) {
	const sevLabel: Record<string, string> = {
		high: labels.sevHigh,
		medium: labels.sevMedium,
		low: labels.sevLow,
	};
	return (
		<section data-testid={`group-${kind}`} className="mt-6">
			<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{header} <span className="text-foreground">({items.length})</span>
			</h3>
			{items.length === 0 ? (
				<p className="mt-2 text-sm text-muted-foreground">—</p>
			) : (
				<ul className="mt-2 space-y-2">
					{items.map((it) => (
						<li
							key={it.id}
							data-testid={`debt-item-${kind}`}
							className="rounded-lg border border-border bg-card p-3"
						>
							<div className="flex items-center justify-between gap-2">
								<code className="text-sm font-medium text-foreground">
									{labels.targetLabel}: {it.targetRef}
								</code>
								<span
									className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${severityClass(it.severity)}`}
								>
									{sevLabel[it.severity] ?? it.severity}
								</span>
							</div>
							<p className="mt-1 text-sm text-muted-foreground">{it.reason}</p>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

export function KernelDebtPanel({ labels }: { labels: KernelDebtLabels }) {
	const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
	const scenario = useMemo(
		() => SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0],
		[scenarioId],
	);
	// Action: re-run the SAME pure twin (scan + suggestTrim) the Go package runs,
	// live, on the selected scenario. Detection + suggestion only — no delete.
	const debt = useMemo(() => scan(scenario.snapshot), [scenario]);
	const plan = useMemo(() => suggestTrim(debt), [debt]);

	const byKind = (kind: DebtKind) => debt.items.filter((i) => i.kind === kind);

	const isClean = debt.items.length === 0;

	return (
		<div className="mt-8">
			<label
				htmlFor="kd-scenario"
				className="block text-sm font-medium text-foreground"
			>
				{labels.scenarioLabel}
			</label>
			<select
				id="kd-scenario"
				data-testid="scenario-select"
				value={scenarioId}
				onChange={(e) => setScenarioId(e.target.value)}
				className="mt-1 w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
			>
				{SCENARIOS.map((s) => (
					<option key={s.id} value={s.id}>
						{labels[s.titleKey as keyof KernelDebtLabels]}
					</option>
				))}
			</select>

			<div className="mt-8 grid gap-8 lg:grid-cols-2">
				{/* Debt ledger */}
				<div data-testid="debt-ledger">
					<h2 className="text-lg font-semibold text-foreground">
						{labels.ledgerTitle}
					</h2>
					{isClean ? (
						<p
							data-testid="empty-debt"
							className="mt-4 rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground"
						>
							{labels.emptyDebt}
						</p>
					) : (
						<>
							<KindGroup
								kind="orphan_mirror"
								header={labels.orphanHeader}
								items={byKind("orphan_mirror")}
								labels={labels}
							/>
							<KindGroup
								kind="stale_fixture"
								header={labels.staleHeader}
								items={byKind("stale_fixture")}
								labels={labels}
							/>
							<KindGroup
								kind="surviving_mutant"
								header={labels.survivorHeader}
								items={byKind("surviving_mutant")}
								labels={labels}
							/>
						</>
					)}
				</div>

				{/* Trim plan — proposals only, no delete affordance */}
				<div data-testid="trim-plan">
					<h2 className="text-lg font-semibold text-foreground">
						{labels.planTitle}
					</h2>
					{plan.suggestions.length === 0 ? (
						<p
							data-testid="empty-plan"
							className="mt-4 rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground"
						>
							{labels.planEmpty}
						</p>
					) : (
						<ul className="mt-4 space-y-3">
							{plan.suggestions.map((s) => (
								<li
									key={s.debtItemRef}
									data-testid="trim-suggestion"
									className="rounded-lg border border-border bg-card p-4"
								>
									<div className="flex items-center justify-between gap-2">
										<code className="text-sm font-semibold text-blue-600 dark:text-blue-400">
											{labels[ACTION_LABEL[s.proposedAction]] ??
												s.proposedAction}
										</code>
										<span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
											{labels.proposalBadge}
										</span>
									</div>
									<p className="mt-2 text-sm text-muted-foreground">
										{s.rationale}
									</p>
									<p
										data-testid="requires-door"
										className="mt-2 text-xs font-medium text-foreground"
									>
										{labels.requiresLabel}:{" "}
										<span className="text-blue-600 dark:text-blue-400">
											{s.requires}
										</span>
									</p>
								</li>
							))}
						</ul>
					)}
					<p className="mt-4 text-xs text-muted-foreground">
						{labels.noDeleteNote}
					</p>
				</div>
			</div>
		</div>
	);
}
