"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { type EvaluateResult, evaluateTerminationAction } from "./actions";

/**
 * BuildLoopPanel makes the /build-loop route action-capable (ui-completeness law,
 * CLAUDE.md §7): the build-loop's termination decision has a control bound to the REAL
 * deterministic verdict, reachable AND executable from the screen.
 *
 *   - Termination console — the red set + the live green sensor verdicts + the
 *     non-gameable Stop conditions (prior-green / mutation / floor / monsters) + the
 *     iteration history + the declared budget → the COMPUTED termination decision
 *     (green | no_progress | continue), with BUILD_LOOP_NO_PROGRESS + the over-budget
 *     axes when the breaker tripped.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the verdict is a PURE FUNCTION OF THE HISTORY
 * (the pure twin terminate(), byte-identical to back/runtime/buildloop.Terminate) — never
 * an LLM judgment; the judge is the mirror verdict + the pure detector. THE WALL (§2): the
 * decision is a read/compute below the line — it writes NO truth. Themed on the ADR 0010
 * tokens; strings via next-intl (ADR 0011).
 */

const initial: EvaluateResult = { ok: false };

function Submit({ label }: { label: string }) {
	const t = useTranslations("buildLoop");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="evaluate-submit"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

const VERDICT_CLASS: Record<string, string> = {
	green: "border-primary/40 bg-primary/10 text-primary",
	continue:
		"border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
	no_progress: "border-destructive/40 bg-destructive/10 text-destructive",
};

function field(
	label: string,
	hint: string,
	control: React.ReactNode,
): React.ReactNode {
	return (
		<div className="block space-y-1.5">
			<span className="text-sm font-medium text-foreground">{label}</span>
			<span className="block text-xs text-muted-foreground">{hint}</span>
			{control}
		</div>
	);
}

export function BuildLoopPanel() {
	const t = useTranslations("buildLoop");
	const [result, action] = useActionState(evaluateTerminationAction, initial);

	const inputClass =
		"w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

	return (
		<div className="space-y-8">
			<form
				action={action}
				data-testid="evaluate-form"
				className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm"
			>
				<h2 className="text-base font-semibold tracking-tight text-foreground">
					{t("consoleHeading")}
				</h2>

				{field(
					t("redSetLabel"),
					t("redSetHint"),
					<textarea
						name="redSet"
						data-testid="field-red-set"
						rows={2}
						placeholder={"Order.checkout.feature\nOrder.total.property"}
						className={inputClass}
					/>,
				)}

				{field(
					t("greenSensorsLabel"),
					t("greenSensorsHint"),
					<textarea
						name="greenSensors"
						data-testid="field-green-sensors"
						rows={2}
						className={inputClass}
					/>,
				)}

				{field(
					t("historyLabel"),
					t("historyHint"),
					<textarea
						name="history"
						data-testid="field-history"
						rows={3}
						placeholder={
							"d1 | Order.checkout.feature\nd2 | Order.checkout.feature"
						}
						className={inputClass}
					/>,
				)}

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{field(
						t("mutationLabel"),
						t("mutationHint"),
						<input
							name="mutation"
							data-testid="field-mutation"
							type="number"
							step="0.01"
							min="0"
							max="1"
							defaultValue="0.9"
							className={inputClass}
						/>,
					)}
					{field(
						t("mutationFloorLabel"),
						t("mutationFloorHint"),
						<input
							name="mutationFloor"
							data-testid="field-mutation-floor"
							type="number"
							step="0.01"
							min="0"
							max="1"
							defaultValue="0.7"
							className={inputClass}
						/>,
					)}
					{field(
						t("maxIterationsLabel"),
						t("maxIterationsHint"),
						<input
							name="maxIterations"
							data-testid="field-max-iterations"
							type="number"
							min="0"
							defaultValue="50"
							className={inputClass}
						/>,
					)}
					{field(
						t("stagnationWindowLabel"),
						t("stagnationWindowHint"),
						<input
							name="stagnationWindow"
							data-testid="field-stagnation-window"
							type="number"
							min="0"
							defaultValue="3"
							className={inputClass}
						/>,
					)}
					{field(
						t("maxLlmTokensLabel"),
						t("maxLlmTokensHint"),
						<input
							name="maxLlmTokens"
							data-testid="field-max-llm-tokens"
							type="number"
							min="0"
							defaultValue="0"
							className={inputClass}
						/>,
					)}
					{field(
						t("spentLlmTokensLabel"),
						t("spentLlmTokensHint"),
						<input
							name="spentLlmTokens"
							data-testid="field-spent-llm-tokens"
							type="number"
							min="0"
							defaultValue="0"
							className={inputClass}
						/>,
					)}
				</div>

				<div className="flex flex-wrap items-center gap-6">
					<label className="inline-flex items-center gap-2 text-sm text-foreground">
						<input
							type="checkbox"
							name="priorBroken"
							data-testid="field-prior-broken"
							className="h-4 w-4 rounded border-border"
						/>
						{t("priorBrokenLabel")}
					</label>
					<label className="inline-flex items-center gap-2 text-sm text-foreground">
						<input
							type="checkbox"
							name="valueCaseJustified"
							data-testid="field-value-case"
							className="h-4 w-4 rounded border-border"
						/>
						{t("valueCaseLabel")}
					</label>
				</div>

				{field(
					t("monstersLabel"),
					t("monstersHint"),
					<textarea
						name="monsters"
						data-testid="field-monsters"
						rows={1}
						className={inputClass}
					/>,
				)}

				<Submit label={t("evaluate")} />
			</form>

			{result.ok && result.decision && (
				<section
					data-testid="decision"
					aria-label={t("decisionHeading")}
					className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm"
				>
					<h2 className="text-base font-semibold tracking-tight text-foreground">
						{t("decisionHeading")}
					</h2>
					<div className="flex flex-wrap items-center gap-3">
						<span
							data-testid="verdict-badge"
							data-verdict={result.decision.verdict}
							className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
								VERDICT_CLASS[result.decision.verdict] ??
								"border-border bg-muted text-muted-foreground"
							}`}
						>
							{t(`verdict.${result.decision.verdict}`)}
						</span>
						<span className="text-xs text-muted-foreground">
							{t("iterationsTaken", { n: result.iterations ?? 0 })}
						</span>
						{result.source && (
							<span
								data-testid="source-badge"
								data-source={result.source}
								className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
							>
								{result.source === "live" ? t("sourceLive") : t("sourceDemo")}
							</span>
						)}
					</div>

					{result.decision.blockCode && (
						<p
							data-testid="block-code"
							className="font-mono text-sm text-destructive"
						>
							{result.decision.blockCode}
						</p>
					)}
					{result.decision.overBudgetAxes.length > 0 && (
						<p
							data-testid="over-budget-axes"
							className="text-sm text-muted-foreground"
						>
							{t("overBudgetAxes")}: {result.decision.overBudgetAxes.join(", ")}
						</p>
					)}
				</section>
			)}

			{!result.ok && result.messageKey && (
				<p data-testid="evaluate-error" className="text-sm text-destructive">
					{t(`messages.${result.messageKey}`)}
				</p>
			)}
		</div>
	);
}
