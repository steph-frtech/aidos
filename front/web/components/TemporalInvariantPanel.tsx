"use client";

import { useState } from "react";
import {
	durationString,
	evaluate,
	type TemporalInvariant,
} from "@/lib/temporal";
import {
	CHECKOUT_CONFIRM_WITHIN_5M,
	EVALUATION_ROWS,
	type EvaluationRow,
} from "@/lib/temporal-data";

/**
 * TemporalInvariantPanel — the action-capable /temporal-invariants panel (S50). It renders the
 * checkout-confirm-within-5m TemporalInvariant (KRD §49.3): the invariant card (property, clock,
 * tolerance, mirror form), an explicit "green band = 5m ± 10s" marker, and a live evaluation table
 * whose verdicts are COMPUTED by the pure evaluator (lib/temporal, the projection of
 * back/kernel/temporal): 4m58s + 5m04s HELD (the 5m04s row marked inside-tolerance so a human sees
 * it is not a flake), 5m20s VIOLATED (red, TEMPORAL_INVARIANT_VIOLATED + how_to_fix), out-of-order
 * VIOLATED.
 *
 * ACTION-CAPABLE, WALL-SAFE (CLAUDE.md §7): declaring a TemporalInvariant or changing its tolerance
 * is a truth-write, so the "Proposer un ChangeSet" control does NOT write the kernel from the screen
 * — it opens a propose → ChangeSet → approval intent (a DRAFT). The S20 ChangeSet engine is a later
 * step; here the control surfaces the proposal as an OpenQuestion stub — no headless capability, no
 * direct truth-write. A read-only "re-evaluate" control re-runs the pure evaluator below the line.
 * Verdicts are COMPUTED by the pure evaluator (no Date.now()), never declared.
 */

interface Labels {
	cardHeading: string;
	propertyLabel: string;
	clockLabel: string;
	toleranceLabel: string;
	mirrorLabel: string;
	relationLabel: string;
	boundLabel: string;
	bandHeading: string;
	bandBody: string;
	tableHeading: string;
	caseLabel: string;
	observationLabel: string;
	elapsedLabel: string;
	verdictLabel: string;
	reasonLabel: string;
	howToFixLabel: string;
	insideToleranceTag: string;
	badgeHeld: string;
	badgeViolated: string;
	reEvaluateHeading: string;
	reEvaluateButton: string;
	reEvaluateDone: string;
	proposeHeading: string;
	proposeButton: string;
	proposeStubHeading: string;
	proposeStubBody: string;
}

function verdictBadge(verdict: "held" | "violated", labels: Labels) {
	return verdict === "held"
		? {
				text: labels.badgeHeld,
				cls: "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
			}
		: {
				text: labels.badgeViolated,
				cls: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300",
			};
}

export function TemporalInvariantPanel({ labels }: { labels: Labels }) {
	const inv: TemporalInvariant = CHECKOUT_CONFIRM_WITHIN_5M;
	const [proposed, setProposed] = useState(false);
	const [reEvaluated, setReEvaluated] = useState(false);

	const band = `${durationString(inv.boundSeconds)} ± ${durationString(inv.toleranceSeconds)}`;

	return (
		<div className="space-y-10" data-testid="temporal-panel">
			{/* The invariant card */}
			<section
				aria-label={labels.cardHeading}
				data-testid="temporal-card"
				className="space-y-4 rounded-xl border border-border bg-card p-6"
			>
				<h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
					<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">
						checkout-confirm-within-5m
					</code>
					<span
						data-testid="temporal-mirror"
						className="inline-flex items-center rounded-full border border-blue-600/40 bg-blue-600/10 px-2.5 py-0.5 font-mono text-xs text-blue-700 dark:text-blue-300"
					>
						{labels.mirrorLabel}: {inv.mirror}
					</span>
				</h2>
				<dl className="grid gap-4 sm:grid-cols-2">
					<div className="sm:col-span-2">
						<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{labels.propertyLabel}
						</dt>
						<dd
							data-testid="temporal-property"
							className="mt-1 font-mono text-sm text-foreground"
						>
							{inv.property}
						</dd>
					</div>
					<div>
						<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{labels.clockLabel}
						</dt>
						<dd
							data-testid="temporal-clock"
							className="mt-1 font-mono text-sm text-foreground"
						>
							{inv.clock}
						</dd>
					</div>
					<div>
						<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{labels.toleranceLabel}
						</dt>
						<dd
							data-testid="temporal-tolerance"
							className="mt-1 font-mono text-sm text-foreground"
						>
							{durationString(inv.toleranceSeconds)}
						</dd>
					</div>
					<div>
						<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{labels.boundLabel}
						</dt>
						<dd className="mt-1 font-mono text-sm text-foreground">
							{durationString(inv.boundSeconds)}
						</dd>
					</div>
					<div>
						<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{labels.relationLabel}
						</dt>
						<dd className="mt-1 font-mono text-sm text-foreground">
							{inv.relation}
						</dd>
					</div>
				</dl>
			</section>

			{/* The tolerance band marker */}
			<section
				aria-label={labels.bandHeading}
				data-testid="band-marker"
				className="space-y-2 rounded-xl border border-emerald-600/40 bg-emerald-600/10 p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.bandHeading}:{" "}
					<code
						data-testid="band-value"
						className="rounded bg-card px-1.5 py-0.5 font-mono text-sm text-emerald-700 dark:text-emerald-300"
					>
						{band}
					</code>
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{labels.bandBody}
				</p>
			</section>

			{/* The evaluation table — verdicts computed by the pure evaluator */}
			<section
				aria-label={labels.tableHeading}
				data-testid="evaluation-table"
				className="space-y-4"
			>
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.tableHeading}
				</h2>
				<div className="overflow-hidden rounded-xl border border-border">
					<table className="w-full text-left text-sm">
						<thead className="bg-muted/60 text-xs tracking-wide text-muted-foreground uppercase">
							<tr>
								<th className="px-4 py-3 font-medium">{labels.caseLabel}</th>
								<th className="px-4 py-3 font-medium">{labels.verdictLabel}</th>
								<th className="px-4 py-3 font-medium">{labels.reasonLabel}</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{EVALUATION_ROWS.map((row: EvaluationRow) => {
								const out = evaluate(inv, row.observation);
								const badge = verdictBadge(out.verdict, labels);
								return (
									<tr
										key={row.key}
										data-testid={`eval-row-${row.key}`}
										data-verdict={out.verdict}
									>
										<td className="px-4 py-3 align-top">
											<p className="text-xs text-muted-foreground">
												{row.label}
											</p>
											<p className="mt-1 font-mono text-[0.7rem] text-foreground">
												{labels.observationLabel}: [
												{row.observation.eventOrder.join(", ")}]
											</p>
											<p className="mt-1 font-mono text-[0.7rem] text-foreground">
												{labels.elapsedLabel}:{" "}
												{durationString(row.observation.elapsedSeconds)}
											</p>
											{row.insideTolerance ? (
												<span
													data-testid={`inside-tolerance-${row.key}`}
													className="mt-1 inline-flex items-center rounded-full border border-emerald-600/40 bg-emerald-600/10 px-2 py-0.5 text-[0.65rem] font-medium text-emerald-700 dark:text-emerald-300"
												>
													{labels.insideToleranceTag}
												</span>
											) : null}
										</td>
										<td className="px-4 py-3 align-top">
											<span
												data-testid={`verdict-${row.key}`}
												className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}
											>
												{badge.text}
											</span>
										</td>
										<td className="px-4 py-3 align-top">
											{out.blockReason ? (
												<div className="space-y-1">
													<code
														data-testid={`block-code-${row.key}`}
														className="rounded bg-red-500/20 px-1.5 py-0.5 font-mono text-xs text-red-700 dark:text-red-300"
													>
														{out.blockReason.code}
													</code>
													<p className="text-xs text-muted-foreground">
														{labels.howToFixLabel}:{" "}
														<span className="font-mono">
															{out.blockReason.howToFix.join(", ")}
														</span>
													</p>
												</div>
											) : (
												<span className="text-xs text-muted-foreground">—</span>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</section>

			{/* The read-only re-evaluate action — re-runs the pure evaluator below the line */}
			<section
				aria-label={labels.reEvaluateHeading}
				data-testid="reevaluate-section"
				className="space-y-4"
			>
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.reEvaluateHeading}
				</h2>
				<button
					type="button"
					data-testid="reevaluate"
					onClick={() => setReEvaluated(true)}
					className="inline-flex items-center rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted/70"
				>
					{labels.reEvaluateButton}
				</button>
				{reEvaluated ? (
					<p
						data-testid="reevaluate-done"
						className="text-sm leading-relaxed text-muted-foreground"
					>
						{labels.reEvaluateDone}
					</p>
				) : null}
			</section>

			{/* The action — propose a ChangeSet (the wall: never a direct truth-write) */}
			<section
				aria-label={labels.proposeHeading}
				data-testid="propose-section"
				className="space-y-4"
			>
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.proposeHeading}
				</h2>
				<button
					type="button"
					data-testid="propose-changeset"
					onClick={() => setProposed(true)}
					className="inline-flex items-center rounded-md border border-blue-600/40 bg-blue-600/10 px-3 py-1.5 text-sm font-medium text-blue-700 transition hover:bg-blue-600/20 dark:text-blue-300"
				>
					{labels.proposeButton}
				</button>
				{proposed ? (
					<div
						data-testid="propose-stub"
						className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3"
					>
						<p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
							{labels.proposeStubHeading}
						</p>
						<p className="text-sm leading-relaxed text-muted-foreground">
							{labels.proposeStubBody}
						</p>
					</div>
				) : null}
			</section>
		</div>
	);
}
