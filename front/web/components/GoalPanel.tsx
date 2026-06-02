"use client";

import { useState } from "react";
import {
	type Goal,
	isClosed,
	type StopConditions,
	type StopInput,
	stopConditions,
} from "@/lib/goal";
import { ORDER_DISCOUNT_GOAL, STOP_GREEN, STOP_RED } from "@/lib/goal-data";

/**
 * GoalPanel — the action-capable /goal panel (S29). The human RUNS the goal engine FROM THE SCREEN,
 * calling the SAME pure deciders the Go engine computes (back/runtime/goal):
 *   - OPEN a goal from the canonical idea ⇒ a DRAFT ChangeSet badge + a non-empty red set (the done
 *     criterion visible in the UI), status OPEN, the budgets burndown;
 *   - CHECK the non-gameable stop ⇒ stopConditions/isClosed render the four computed conditions
 *     (red set→green · prior green intact · mutation≥floor · no monster) and the overall verdict —
 *     NOT satisfied while a mirror is red, satisfied only when the red set is green and prior intact.
 *
 * The verdict is RENDERED, never re-implemented: the panel computes it from lib/goal.ts (the twin),
 * so the screen matches the engine.
 *
 * READ-ONLY against truth (CLAUDE.md §7 ui-completeness, the wall): opening a goal and stamping it
 * CLOSED are TRUTH writes owned by the aidos CLI writer role via the /goal flow + S20's commit-gate;
 * the agent DB role is SELECT-only on ideas.goal — never a write (and never a CLOSED stamp) from this
 * screen. Themed (ADR 0010), bilingual (ADR 0011) — labels passed in.
 */

interface Labels {
	openGoalCta: string;
	checkStopRedCta: string;
	checkStopGreenCta: string;
	sourceIdeaLabel: string;
	changeSetLabel: string;
	draftBadge: string;
	redSetHeading: string;
	redMirrorRed: string;
	redMirrorGreen: string;
	statusLabel: string;
	stopHeading: string;
	stopSatisfied: string;
	stopNotSatisfied: string;
	condRedSetGreen: string;
	condPriorGreen: string;
	condMutation: string;
	condNoMonster: string;
	budgetsHeading: string;
	budgetTime: string;
	budgetTurns: string;
	budgetTokens: string;
	closeNote: string;
}

function ConditionRow({ ok, label }: { ok: boolean; label: string }) {
	return (
		<li
			data-testid="stop-condition"
			data-ok={ok ? "true" : "false"}
			className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
				ok
					? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
					: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
			}`}
		>
			<span aria-hidden className="font-mono text-xs">
				{ok ? "✓" : "✗"}
			</span>
			{label}
		</li>
	);
}

export function GoalPanel({ labels }: { labels: Labels }) {
	const [goal, setGoal] = useState<Goal | null>(null);
	const [stop, setStop] = useState<StopInput | null>(null);

	function openGoal() {
		// OpenGoal (twin): from the canonical idea, a DRAFT ChangeSet + a non-empty red set.
		setGoal(ORDER_DISCOUNT_GOAL);
		setStop(STOP_RED); // a fresh goal starts with the red set red ⇒ stop NOT satisfied.
	}

	function checkStop(input: StopInput) {
		setStop(input);
	}

	const conditions: StopConditions | null =
		goal && stop ? stopConditions(goal.redSet, stop) : null;
	const closed = goal && stop ? isClosed(goal.redSet, stop) : false;

	return (
		<div className="space-y-10" data-testid="goal-panel">
			{/* Controls — open the goal, then check the stop. */}
			<section className="flex flex-wrap gap-3">
				<button
					type="button"
					data-testid="open-goal"
					onClick={openGoal}
					className="inline-flex items-center rounded-md border border-blue-600/40 bg-blue-600/10 px-3 py-1.5 text-sm font-medium text-blue-700 transition hover:bg-blue-600/20 dark:text-blue-300"
				>
					{labels.openGoalCta}
				</button>
				<button
					type="button"
					data-testid="check-stop-red"
					disabled={!goal}
					onClick={() => checkStop(STOP_RED)}
					className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
				>
					{labels.checkStopRedCta}
				</button>
				<button
					type="button"
					data-testid="check-stop-green"
					disabled={!goal}
					onClick={() => checkStop(STOP_GREEN)}
					className="inline-flex items-center rounded-md border border-emerald-600/40 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-300"
				>
					{labels.checkStopGreenCta}
				</button>
			</section>

			{goal && stop ? (
				<>
					{/* The goal head: source idea + DRAFT ChangeSet badge + status. */}
					<section
						data-testid="goal-head"
						className="space-y-2 rounded-xl border border-border bg-card px-4 py-3 text-sm"
					>
						<p className="text-foreground">
							<span className="text-muted-foreground">
								{labels.sourceIdeaLabel}:{" "}
							</span>
							<code className="font-mono text-xs">{goal.ideaRef}</code>
						</p>
						<p className="flex flex-wrap items-center gap-2 text-foreground">
							<span className="text-muted-foreground">
								{labels.changeSetLabel}:{" "}
							</span>
							<code className="font-mono text-xs">{goal.changeSetRef}</code>
							<span
								data-testid="changeset-badge"
								data-status={goal.changeSetStatus}
								className="inline-flex items-center rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
							>
								{labels.draftBadge}
							</span>
						</p>
						<p className="flex items-center gap-2 text-foreground">
							<span className="text-muted-foreground">
								{labels.statusLabel}:{" "}
							</span>
							<span
								data-testid="goal-status"
								data-status={goal.status}
								className="inline-flex items-center rounded-md border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400"
							>
								{goal.status}
							</span>
						</p>
					</section>

					{/* The red set — each mirror red (failing) → green (closed). */}
					<section className="space-y-3">
						<h2 className="text-lg font-semibold tracking-tight text-foreground">
							{labels.redSetHeading}
						</h2>
						<ul className="space-y-2" data-testid="red-set">
							{goal.redSet.map((mirror) => {
								const green = stop.sensors[mirror] === "green";
								return (
									<li
										key={mirror}
										data-testid={`red-set-mirror-${green ? "green" : "red"}`}
										data-mirror={mirror}
										className={`flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
											green
												? "border-emerald-500/50 bg-emerald-500/10"
												: "border-red-500/50 bg-red-500/10"
										}`}
									>
										<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
											{mirror}
										</code>
										<span
											className={`font-semibold ${
												green
													? "text-emerald-700 dark:text-emerald-300"
													: "text-red-700 dark:text-red-300"
											}`}
										>
											{green ? labels.redMirrorGreen : labels.redMirrorRed}
										</span>
									</li>
								);
							})}
						</ul>
					</section>

					{/* The non-gameable stop indicator — the four computed conditions + the verdict. */}
					<section className="space-y-3">
						<div className="flex flex-wrap items-center gap-3">
							<h2 className="text-lg font-semibold tracking-tight text-foreground">
								{labels.stopHeading}
							</h2>
							<span
								data-testid="stop-verdict"
								data-satisfied={closed ? "true" : "false"}
								className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-medium ${
									closed
										? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
										: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300"
								}`}
							>
								{closed ? labels.stopSatisfied : labels.stopNotSatisfied}
							</span>
						</div>
						{conditions ? (
							<ul
								className="grid gap-2 sm:grid-cols-2"
								data-testid="stop-conditions"
							>
								<ConditionRow
									ok={conditions.redSetGreen}
									label={labels.condRedSetGreen}
								/>
								<ConditionRow
									ok={conditions.priorGreenIntact}
									label={labels.condPriorGreen}
								/>
								<ConditionRow
									ok={conditions.mutationOk}
									label={labels.condMutation}
								/>
								<ConditionRow
									ok={conditions.noMonster}
									label={labels.condNoMonster}
								/>
							</ul>
						) : null}
						<p
							data-testid="close-note"
							className="text-xs text-muted-foreground"
						>
							{labels.closeNote}
						</p>
					</section>

					{/* The budgets burndown — the declared secondary guard. */}
					<section className="space-y-3">
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{labels.budgetsHeading}
						</h2>
						<dl
							className="grid grid-cols-3 gap-2 text-sm"
							data-testid="budgets-burndown"
						>
							<div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
								<dt className="text-xs text-muted-foreground">
									{labels.budgetTime}
								</dt>
								<dd className="font-mono text-foreground">
									{goal.budgets.timeSeconds}s
								</dd>
							</div>
							<div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
								<dt className="text-xs text-muted-foreground">
									{labels.budgetTurns}
								</dt>
								<dd className="font-mono text-foreground">
									{goal.budgets.turns}
								</dd>
							</div>
							<div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
								<dt className="text-xs text-muted-foreground">
									{labels.budgetTokens}
								</dt>
								<dd className="font-mono text-foreground">
									{goal.budgets.tokens}
								</dd>
							</div>
						</dl>
					</section>
				</>
			) : null}
		</div>
	);
}
