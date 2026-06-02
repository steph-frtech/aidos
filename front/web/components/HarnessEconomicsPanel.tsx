"use client";

import { useState } from "react";
import {
	durationLabel,
	type EconomicsDecision,
	evaluate,
} from "@/lib/economics";
import {
	CHECKOUT_BUDGET,
	COSTLY_VALUE_CASE,
	ECONOMICS_ROWS,
} from "@/lib/economics-data";

/**
 * HarnessEconomicsPanel — the action-capable /harness-economics panel (S51, KRD §66.3).
 * It SURFACES the five declared HarnessCostBudget caps beside their measured cost (over =
 * red), renders the four economics rows with verdicts COMPUTED by the pure evaluator
 * (lib/economics, the projection of back/runtime/economics) — within_budget,
 * over_budget_flagged (red, HARNESS_COST_EXCEEDS_BUDGET + how_to_fix), over_budget_justified
 * (kept) — and shows the costly truth's ValueCase card.
 *
 * ACTION-CAPABLE, WALL-SAFE (CLAUDE.md §7): the budget is the DECLARED bar above the line, so
 * there is NO budget-edit affordance (raising it is a /goal, never a screen edit) and NO delete
 * affordance (advisory only — every action routes through idea → mirror → /goal). A
 * "Proposer un ChangeSet" control opens a propose → ChangeSet → approval intent (the S20 engine is
 * a later step; here it surfaces an OpenQuestion stub — no headless capability, no direct
 * truth-write). A read-only "re-evaluate" control re-runs the pure evaluator below the line.
 */

interface Labels {
	budgetHeading: string;
	cellLabel: string;
	capLabel: string;
	measuredLabel: string;
	maxCiMinutes: string;
	maxLlmTokens: string;
	maxMutationRuntime: string;
	maxHumanReview: string;
	expectedRiskReduction: string;
	overTag: string;
	tableHeading: string;
	caseLabel: string;
	verdictLabel: string;
	reasonLabel: string;
	howToFixLabel: string;
	badgeWithin: string;
	badgeJustified: string;
	badgeFlagged: string;
	keptTag: string;
	valueCaseHeading: string;
	truthLabel: string;
	riskLabel: string;
	impactLabel: string;
	decisionLabel: string;
	reEvaluateHeading: string;
	reEvaluateButton: string;
	reEvaluateDone: string;
	proposeHeading: string;
	proposeButton: string;
	proposeStubHeading: string;
	proposeStubBody: string;
}

const b = CHECKOUT_BUDGET;

function verdictBadge(verdict: EconomicsDecision["verdict"], labels: Labels) {
	if (verdict === "within_budget") {
		return (
			<span
				data-testid="badge-within_budget"
				className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
			>
				{labels.badgeWithin}
			</span>
		);
	}
	if (verdict === "over_budget_justified") {
		return (
			<span
				data-testid="badge-over_budget_justified"
				className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
			>
				{labels.badgeJustified} · {labels.keptTag}
			</span>
		);
	}
	return (
		<span
			data-testid="badge-over_budget_flagged"
			className="inline-flex items-center rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive"
		>
			{labels.badgeFlagged}
		</span>
	);
}

export function HarnessEconomicsPanel({ labels }: { labels: Labels }) {
	const [reEvaluated, setReEvaluated] = useState(false);
	const [proposed, setProposed] = useState(false);

	// Determinism-first: run the PURE evaluator per row — same input → same verdict.
	const rows = ECONOMICS_ROWS.map((r) => ({
		...r,
		decision: evaluate(b, r.cost, r.valueCase),
	}));

	// The five declared caps beside the canonical measured cost (the flagged row's cost).
	const caps = [
		{
			key: "ci",
			label: labels.maxCiMinutes,
			cap: `${b.maxCiMinutes}`,
			measured: "18",
			over: 18 > b.maxCiMinutes,
		},
		{
			key: "tokens",
			label: labels.maxLlmTokens,
			cap: `${b.maxLlmTokensPerGoal}`,
			measured: "40000",
			over: 40000 > b.maxLlmTokensPerGoal,
		},
		{
			key: "mutation",
			label: labels.maxMutationRuntime,
			cap: durationLabel(b.maxMutationRuntimeSeconds),
			measured: durationLabel(180),
			over: 180 > b.maxMutationRuntimeSeconds,
		},
		{
			key: "review",
			label: labels.maxHumanReview,
			cap: `${b.maxHumanReviewMinutes}`,
			measured: "15",
			over: 15 > b.maxHumanReviewMinutes,
		},
		{
			key: "risk",
			label: labels.expectedRiskReduction,
			cap: b.expectedRiskReduction,
			measured: "—",
			over: false,
		},
	];

	return (
		<div className="space-y-10">
			{/* Budget card — the five DECLARED caps surfaced beside their measured cost */}
			<section
				data-testid="budget-card"
				aria-label={labels.budgetHeading}
				className="rounded-xl border border-border bg-card p-5 shadow-sm"
			>
				<div className="flex flex-wrap items-baseline justify-between gap-2">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{labels.budgetHeading}
					</h2>
					<span className="text-xs text-muted-foreground">
						{labels.cellLabel}:{" "}
						<code className="font-mono text-foreground">{b.cellRef}</code>
					</span>
				</div>
				<div className="mt-4 overflow-hidden rounded-lg border border-border">
					<table className="w-full text-sm">
						<thead className="bg-muted/50 text-xs text-muted-foreground">
							<tr>
								<th className="px-3 py-2 text-left font-medium">
									{labels.capLabel}
								</th>
								<th className="px-3 py-2 text-right font-medium">
									HarnessCostBudget
								</th>
								<th className="px-3 py-2 text-right font-medium">
									{labels.measuredLabel}
								</th>
							</tr>
						</thead>
						<tbody>
							{caps.map((c) => (
								<tr
									key={c.key}
									data-testid={`cap-${c.key}`}
									className="border-t border-border"
								>
									<td className="px-3 py-2 text-foreground">{c.label}</td>
									<td
										className="px-3 py-2 text-right font-mono text-foreground"
										data-testid={`cap-${c.key}-value`}
									>
										{c.cap}
									</td>
									<td
										className={`px-3 py-2 text-right font-mono ${c.over ? "font-semibold text-destructive" : "text-muted-foreground"}`}
									>
										{c.measured}
										{c.over ? (
											<span className="ml-1.5 text-[0.7rem] font-medium text-destructive">
												{labels.overTag}
											</span>
										) : null}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			{/* Economics table — the four rows with COMPUTED verdicts */}
			<section
				data-testid="economics-table"
				aria-label={labels.tableHeading}
				className="space-y-4"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.tableHeading}
				</h2>
				<div className="space-y-3">
					{rows.map((r) => {
						const flagged = r.decision.verdict === "over_budget_flagged";
						return (
							<div
								key={r.key}
								data-testid={`econ-row-${r.key}`}
								data-verdict={r.decision.verdict}
								className={`rounded-lg border p-4 ${flagged ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`}
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<span className="text-sm text-foreground">{r.label}</span>
									{verdictBadge(r.decision.verdict, labels)}
								</div>
								{r.decision.blockReason ? (
									<div className="mt-3 space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
										<div className="text-xs font-medium text-destructive">
											{labels.reasonLabel}:{" "}
											<code
												data-testid={`econ-row-${r.key}-code`}
												className="font-mono"
											>
												{r.decision.blockReason.code}
											</code>
										</div>
										<div className="text-xs text-muted-foreground">
											{labels.howToFixLabel}:
										</div>
										<ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
											{r.decision.blockReason.howToFix.map((fix) => (
												<li key={fix}>{fix}</li>
											))}
										</ol>
									</div>
								) : null}
							</div>
						);
					})}
				</div>
			</section>

			{/* ValueCase card — the costly truth that earned its keep */}
			<section
				data-testid="value-case-card"
				aria-label={labels.valueCaseHeading}
				className="rounded-xl border border-primary/30 bg-primary/5 p-5"
			>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{labels.valueCaseHeading}
					</h2>
					<span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
						{labels.keptTag}
					</span>
				</div>
				<dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
					<div>
						<dt className="text-xs text-muted-foreground">
							{labels.truthLabel}
						</dt>
						<dd data-testid="vc-truth" className="font-mono text-foreground">
							{COSTLY_VALUE_CASE.truth}
						</dd>
					</div>
					<div>
						<dt className="text-xs text-muted-foreground">
							{labels.riskLabel}
						</dt>
						<dd data-testid="vc-risk" className="text-foreground">
							{COSTLY_VALUE_CASE.riskIfBroken}
						</dd>
					</div>
					<div>
						<dt className="text-xs text-muted-foreground">
							{labels.impactLabel}
						</dt>
						<dd className="text-foreground">
							{COSTLY_VALUE_CASE.expectedImpact}
						</dd>
					</div>
					<div>
						<dt className="text-xs text-muted-foreground">
							{labels.decisionLabel}
						</dt>
						<dd data-testid="vc-decision" className="text-foreground">
							{COSTLY_VALUE_CASE.decision}
						</dd>
					</div>
				</dl>
			</section>

			{/* Action: read-only re-evaluate (below the line) */}
			<section
				data-testid="re-evaluate"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.reEvaluateHeading}
				</h2>
				<button
					type="button"
					data-testid="re-evaluate-button"
					onClick={() => setReEvaluated(true)}
					className="mt-3 inline-flex items-center rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted/70"
				>
					{labels.reEvaluateButton}
				</button>
				{reEvaluated ? (
					<p
						data-testid="re-evaluate-done"
						className="mt-3 text-xs text-muted-foreground"
					>
						{labels.reEvaluateDone}
					</p>
				) : null}
			</section>

			{/* Action: propose → ChangeSet (the wall — no direct truth-write from the screen) */}
			<section
				data-testid="propose"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.proposeHeading}
				</h2>
				<button
					type="button"
					data-testid="propose-button"
					onClick={() => setProposed(true)}
					className="mt-3 inline-flex items-center rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
				>
					{labels.proposeButton}
				</button>
				{proposed ? (
					<div
						data-testid="propose-stub"
						className="mt-3 space-y-1 rounded-md border border-border bg-muted/40 p-3"
					>
						<p className="text-xs font-medium text-foreground">
							{labels.proposeStubHeading}
						</p>
						<p className="text-xs text-muted-foreground">
							{labels.proposeStubBody}
						</p>
					</div>
				) : null}
			</section>
		</div>
	);
}
