"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Verdict } from "@/lib/economics";
import { disjoncteurAction, meterAction } from "./actions";
import { CHECKOUT_BUDGET, METER_INITIAL, SIGNAL_INITIAL } from "./view";

/**
 * CostMeterPanel makes the /cost-meter route action-capable (ui-completeness, CLAUDE.md §7):
 * S111's two controls, each bound to the REAL pure twin lib/cost-meter —
 *
 *   1. METER (S51/S52): meter the cell from its real recorded AgentRuns (a COUNT, never an
 *      estimate). Toggle the heavy run to go over budget; toggle a justified ValueCase to
 *      clear the advisory flag. The verdict is §66.3 — advisory, never a silent block.
 *   2. DISJONCTEUR (S83): project the metered verdict onto the circuit-breaker signal — it
 *      trips iff the cell is over budget WITHOUT a justified ValueCase.
 *
 * DETERMINISM-FIRST (§6/§8): both controls run the pure twin — same input → identical verdict,
 * never an LLM. THE WALL (§2): the budget is DECLARED (read-only); the cockpit WRITES NOTHING.
 * Themed on ADR 0010 tokens; strings via next-intl (0011).
 */

function verdictLabel(
	t: ReturnType<typeof useTranslations>,
	v: Verdict,
): string {
	switch (v) {
		case "within_budget":
			return t("withinBudget");
		case "over_budget_flagged":
			return t("overFlagged");
		case "over_budget_justified":
			return t("overJustified");
	}
}

function verdictBadgeClass(v: Verdict): string {
	if (v === "within_budget")
		return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
	if (v === "over_budget_justified") return "bg-primary/15 text-primary";
	return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
}

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("costMeter");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid={testId}
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

export function CostMeterPanel() {
	const t = useTranslations("costMeter");
	const [meter, meterSubmit] = useActionState(meterAction, METER_INITIAL);
	const [signal, signalSubmit] = useActionState(
		disjoncteurAction,
		SIGNAL_INITIAL,
	);
	const [heavy, setHeavy] = useState(false);
	const [valueCase, setValueCase] = useState(false);

	return (
		<div className="space-y-12">
			{/* ── The declared budget (read-only) ── */}
			<section className="space-y-3" data-testid="section-budget">
				<h2 className="text-lg font-semibold text-foreground">
					{t("budgetHeading")}
				</h2>
				<dl className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm sm:grid-cols-4">
					<div>
						<dt className="text-xs text-muted-foreground">{t("cellLabel")}</dt>
						<dd className="font-medium text-foreground">
							{CHECKOUT_BUDGET.cellRef}
						</dd>
					</div>
					<div>
						<dt className="text-xs text-muted-foreground">{t("maxTokens")}</dt>
						<dd className="font-medium text-foreground">
							{CHECKOUT_BUDGET.maxLlmTokensPerGoal}
						</dd>
					</div>
					<div>
						<dt className="text-xs text-muted-foreground">{t("maxCi")}</dt>
						<dd className="font-medium text-foreground">
							{CHECKOUT_BUDGET.maxCiMinutes}
						</dd>
					</div>
					<div>
						<dt className="text-xs text-muted-foreground">
							expected_risk_reduction
						</dt>
						<dd className="font-medium text-foreground">
							{CHECKOUT_BUDGET.expectedRiskReduction}
						</dd>
					</div>
				</dl>
			</section>

			{/* ── 1. METER THE CELL ── */}
			<section className="space-y-4" data-testid="section-meter">
				<h2 className="text-lg font-semibold text-foreground">
					{t("runsHeading")}
				</h2>
				<p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
					{t("runsBody")}
				</p>
				<form
					action={meterSubmit}
					className="space-y-3 rounded-lg border border-border bg-muted/40 p-4"
				>
					<input type="hidden" name="heavy" value={heavy ? "on" : "off"} />
					<input
						type="hidden"
						name="valueCase"
						value={valueCase ? "on" : "off"}
					/>
					<label className="flex items-center gap-2 text-xs text-muted-foreground">
						<input
							type="checkbox"
							data-testid="heavy-toggle"
							checked={heavy}
							onChange={(e) => setHeavy(e.target.checked)}
							className="h-4 w-4 rounded border-border"
						/>
						{t("includeHeavy")}
					</label>
					<label className="flex items-center gap-2 text-xs text-muted-foreground">
						<input
							type="checkbox"
							data-testid="valuecase-toggle"
							checked={valueCase}
							onChange={(e) => setValueCase(e.target.checked)}
							className="h-4 w-4 rounded border-border"
						/>
						{t("valueCaseLabel")}
					</label>
					<Submit label={t("meter")} testId="meter-submit" />
				</form>

				{meter.ran && meter.cellMeter && meter.decision ? (
					<div className="space-y-3" data-testid="meter-result">
						<dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
							<div>
								<dt className="text-xs text-muted-foreground">
									{t("runCountLabel")}
								</dt>
								<dd
									data-testid="run-count"
									className="font-semibold text-foreground"
								>
									{meter.cellMeter.runCount}
								</dd>
							</div>
							<div>
								<dt className="text-xs text-muted-foreground">
									{t("meteredTokens")}
								</dt>
								<dd
									data-testid="metered-tokens"
									className="font-semibold text-foreground"
								>
									{meter.cellMeter.cost.llmTokens}
								</dd>
							</div>
							<div>
								<dt className="text-xs text-muted-foreground">
									{t("meteredCi")}
								</dt>
								<dd
									data-testid="metered-ci"
									className="font-semibold text-foreground"
								>
									{meter.cellMeter.cost.ciMinutes}
								</dd>
							</div>
						</dl>

						<div className="rounded-lg border border-border bg-card p-3 text-sm">
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-medium text-foreground">
									{t("verdict")}:
								</span>
								<span
									data-testid="verdict-badge"
									className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${verdictBadgeClass(meter.decision.verdict)}`}
								>
									{verdictLabel(t, meter.decision.verdict)}
								</span>
								{meter.decision.overAxes.length > 0 ? (
									<code
										data-testid="over-axes"
										className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
									>
										{meter.decision.overAxes.join(", ")}
									</code>
								) : null}
							</div>
							{meter.decision.blockReason ? (
								<div
									className="mt-2 space-y-1 text-xs text-muted-foreground"
									data-testid="block-reason"
								>
									<div>
										<span className="font-medium">
											{t("blockReasonLabel")}:{" "}
										</span>
										<code className="text-amber-600 dark:text-amber-400">
											{meter.decision.blockReason.code}
										</code>
									</div>
									<p>{meter.decision.blockReason.explanation}</p>
									<ul className="list-disc pl-4">
										{meter.decision.blockReason.howToFix.map((h) => (
											<li key={h}>{h}</li>
										))}
									</ul>
								</div>
							) : null}
						</div>
						<p className="text-xs text-muted-foreground">{t("noTruthWrite")}</p>
					</div>
				) : null}
			</section>

			{/* ── 2. THE DISJONCTEUR SIGNAL (S83) ── */}
			<section className="space-y-4" data-testid="section-disjoncteur">
				<h2 className="text-lg font-semibold text-foreground">
					{t("disjoncteurHeading")}
				</h2>
				<p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
					{t("disjoncteurBody")}
				</p>
				<form action={signalSubmit}>
					<input type="hidden" name="heavy" value={heavy ? "on" : "off"} />
					<input
						type="hidden"
						name="valueCase"
						value={valueCase ? "on" : "off"}
					/>
					<Submit label={t("disjoncteur")} testId="disjoncteur-submit" />
				</form>
				{signal.ran && signal.signal ? (
					<div
						className="rounded-lg border border-border bg-card p-3 text-sm"
						data-testid="disjoncteur-result"
					>
						<div className="flex flex-wrap items-center gap-2">
							<span className="font-medium text-foreground">
								{t("tripLabel")}:
							</span>
							<span
								data-testid="trip-badge"
								className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
									signal.signal.trip
										? "bg-destructive/15 text-destructive"
										: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
								}`}
							>
								{signal.signal.trip ? t("tripped") : t("notTripped")}
							</span>
							{signal.signal.blockReason ? (
								<code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
									{signal.signal.blockReason.code}
								</code>
							) : null}
						</div>
						<p className="mt-2 text-xs text-muted-foreground">
							{t("noTruthWrite")}
						</p>
					</div>
				) : null}
			</section>
		</div>
	);
}
