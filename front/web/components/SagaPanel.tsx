"use client";

import { useState } from "react";
import {
	checkCoherence,
	evaluate,
	refString,
	runCompensation,
	type SagaInvariant,
} from "@/lib/saga";
import {
	CHECKOUT_COHERENCE_TEST,
	CHECKOUT_PAYMENT_SHIPPING,
	EVALUATION_ROWS,
	type EvaluationRow,
	HEADS_INCOMPATIBLE,
} from "@/lib/saga-data";

/**
 * SagaPanel — the action-capable /sagas panel (S49). It renders the checkout-payment-shipping
 * SagaInvariant: the statechart (order → payment → shipping forward commits + the compensation
 * transitions drawn back from a failed leg), the participant cards (cell, committed events,
 * compensation step refs id@version), the cross-cell property + cert_language badge, a live
 * outcome table (the fixture rows with their COMPUTED outcome — the dangling-money row red), and
 * a CoherenceTest card whose verdict is computed by the pure checker.
 *
 * ACTION-CAPABLE, WALL-SAFE (CLAUDE.md §7): declaring / re-scoping a SagaInvariant is a
 * truth-write, so the "Proposer un ChangeSet" control does NOT write the kernel from the screen
 * — it opens a propose → ChangeSet → approval intent (a DRAFT, SemanticDiff change_type
 * rescope/refine/reweight, KRD §44.1). The S20 ChangeSet engine is a later step; here the
 * control surfaces the proposal as an OpenQuestion stub — no headless capability, no direct
 * truth-write. The outcomes/coherence are COMPUTED by the pure evaluator (lib/saga), never
 * declared.
 */

interface Labels {
	cardHeading: string;
	scopeLabel: string;
	propertyLabel: string;
	certLanguageLabel: string;
	participantsHeading: string;
	commitsLabel: string;
	compensationLabel: string;
	noCompensation: string;
	statechartHeading: string;
	statechartBody: string;
	compensationTransition: string;
	outcomeHeading: string;
	caseLabel: string;
	traceLabel: string;
	outcomeLabel: string;
	reasonLabel: string;
	howToFixLabel: string;
	compensationEventsLabel: string;
	badgeSatisfied: string;
	badgeViolated: string;
	coherenceHeading: string;
	coherenceBody: string;
	contractsLabel: string;
	headsLabel: string;
	verdictLabel: string;
	badgeCoherent: string;
	badgeIncompatible: string;
	proposeHeading: string;
	proposeButton: string;
	proposeStubHeading: string;
	proposeStubBody: string;
}

function outcomeBadge(outcome: "satisfied" | "violated", labels: Labels) {
	return outcome === "satisfied"
		? {
				text: labels.badgeSatisfied,
				cls: "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
			}
		: {
				text: labels.badgeViolated,
				cls: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300",
			};
}

export function SagaPanel({ labels }: { labels: Labels }) {
	const saga: SagaInvariant = CHECKOUT_PAYMENT_SHIPPING;
	const coherence = checkCoherence(CHECKOUT_COHERENCE_TEST, HEADS_INCOMPATIBLE);
	const [proposed, setProposed] = useState(false);

	return (
		<div className="space-y-10" data-testid="saga-panel">
			{/* The saga card */}
			<section
				aria-label={labels.cardHeading}
				data-testid="saga-card"
				className="space-y-4 rounded-xl border border-border bg-card p-6"
			>
				<h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
					<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">
						{saga.name}
					</code>
					<span
						data-testid="saga-cert-language"
						className="inline-flex items-center rounded-full border border-blue-600/40 bg-blue-600/10 px-2.5 py-0.5 font-mono text-xs text-blue-700 dark:text-blue-300"
					>
						{labels.certLanguageLabel}: {saga.certLanguage}
					</span>
				</h2>
				<dl className="grid gap-4 sm:grid-cols-2">
					<div>
						<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{labels.scopeLabel}
						</dt>
						<dd
							data-testid="saga-scope"
							className="mt-1 font-mono text-sm text-foreground"
						>
							{saga.scope}
						</dd>
					</div>
					<div className="sm:col-span-2">
						<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{labels.propertyLabel}
						</dt>
						<dd
							data-testid="saga-property"
							className="mt-1 font-mono text-sm text-foreground"
						>
							{saga.property}
						</dd>
					</div>
				</dl>
			</section>

			{/* The statechart — forward commits + compensation transitions */}
			<section
				aria-label={labels.statechartHeading}
				data-testid="statechart"
				className="space-y-4 rounded-xl border border-border bg-card p-6"
			>
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.statechartHeading}
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{labels.statechartBody}
				</p>
				<ol className="flex flex-wrap items-center gap-2">
					{saga.participants.map((p, idx) => (
						<li key={p.cell} className="flex items-center gap-2">
							<span
								data-testid={`state-${p.cell}`}
								className="inline-flex flex-col items-start rounded-md border border-border bg-muted px-3 py-1.5"
							>
								<code className="font-mono text-sm text-foreground">
									{p.cell}
								</code>
								<span className="font-mono text-[0.7rem] text-muted-foreground">
									{p.commits.join(", ")}
								</span>
							</span>
							{idx < saga.participants.length - 1 ? (
								<span className="text-muted-foreground">→</span>
							) : null}
						</li>
					))}
				</ol>
				{/* Compensation transitions drawn back from a failed leg */}
				<div
					data-testid="compensation-transitions"
					className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3"
				>
					<p className="text-xs font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-300">
						{labels.compensationTransition}
					</p>
					<p className="mt-1 font-mono text-sm text-foreground">
						{runCompensation(saga, [
							"order_confirmed",
							"payment_captured",
							"shipping_failed",
						]).events.join(" → ")}
					</p>
				</div>
			</section>

			{/* The participant cards */}
			<section
				aria-label={labels.participantsHeading}
				data-testid="participants"
				className="space-y-4"
			>
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.participantsHeading}
				</h2>
				<div className="grid gap-4 sm:grid-cols-3">
					{saga.participants.map((p) => (
						<div
							key={p.cell}
							data-testid={`participant-${p.cell}`}
							className="space-y-3 rounded-xl border border-border bg-card p-4"
						>
							<code className="font-mono text-sm font-semibold text-foreground">
								{p.cell}
							</code>
							<div>
								<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
									{labels.commitsLabel}
								</p>
								<p className="mt-1 font-mono text-xs text-foreground">
									{p.commits.join(", ")}
								</p>
							</div>
							<div>
								<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
									{labels.compensationLabel}
								</p>
								<p className="mt-1 font-mono text-xs text-foreground">
									{p.compensation.length > 0
										? p.compensation.map(refString).join(", ")
										: labels.noCompensation}
								</p>
							</div>
						</div>
					))}
				</div>
			</section>

			{/* The outcome table — outcomes computed by the pure evaluator */}
			<section
				aria-label={labels.outcomeHeading}
				data-testid="outcome-table"
				className="space-y-4"
			>
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.outcomeHeading}
				</h2>
				<div className="overflow-hidden rounded-xl border border-border">
					<table className="w-full text-left text-sm">
						<thead className="bg-muted/60 text-xs tracking-wide text-muted-foreground uppercase">
							<tr>
								<th className="px-4 py-3 font-medium">{labels.caseLabel}</th>
								<th className="px-4 py-3 font-medium">{labels.outcomeLabel}</th>
								<th className="px-4 py-3 font-medium">{labels.reasonLabel}</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{EVALUATION_ROWS.map((row: EvaluationRow) => {
								const comp = row.runCompensation
									? runCompensation(saga, row.trace)
									: null;
								const evalTrace = comp ? comp.trace : row.trace;
								const out = evaluate(saga, evalTrace);
								const badge = outcomeBadge(out.outcome, labels);
								return (
									<tr
										key={row.key}
										data-testid={`outcome-row-${row.key}`}
										data-outcome={out.outcome}
									>
										<td className="px-4 py-3 align-top">
											<p className="text-xs text-muted-foreground">
												{row.label}
											</p>
											<p className="mt-1 font-mono text-[0.7rem] text-foreground">
												{labels.traceLabel}: [{row.trace.join(", ")}]
											</p>
											{comp ? (
												<p
													data-testid={`compensation-events-${row.key}`}
													className="mt-1 font-mono text-[0.7rem] text-amber-700 dark:text-amber-300"
												>
													{labels.compensationEventsLabel}:{" "}
													{comp.events.join(" → ")}
												</p>
											) : null}
										</td>
										<td className="px-4 py-3 align-top">
											<span
												data-testid={`outcome-${row.key}`}
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

			{/* The CoherenceTest card — verdict computed by the pure checker */}
			<section
				aria-label={labels.coherenceHeading}
				data-testid="coherence-card"
				className="space-y-4 rounded-xl border border-border bg-card p-6"
			>
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.coherenceHeading}
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{labels.coherenceBody}
				</p>
				<dl className="grid gap-4 sm:grid-cols-2">
					<div>
						<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{labels.contractsLabel}
						</dt>
						<dd className="mt-1 flex flex-wrap gap-2">
							{CHECKOUT_COHERENCE_TEST.contracts.map((c) => (
								<code
									key={c.id}
									data-testid={`contract-${c.id}`}
									className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 font-mono text-xs text-foreground"
								>
									{refString(c)}
								</code>
							))}
						</dd>
					</div>
					<div>
						<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{labels.headsLabel}
						</dt>
						<dd className="mt-1 font-mono text-xs text-foreground">
							{Object.entries(HEADS_INCOMPATIBLE)
								.map(([k, v]) => `${k}: ${v}`)
								.join(", ")}
						</dd>
					</div>
				</dl>
				<div className="flex items-center gap-3">
					<span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{labels.verdictLabel}
					</span>
					<span
						data-testid="coherence-verdict"
						data-coherence={coherence.coherence}
						className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
							coherence.coherence === "coherent"
								? "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300"
								: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300"
						}`}
					>
						{coherence.coherence === "coherent"
							? labels.badgeCoherent
							: labels.badgeIncompatible}
					</span>
					{coherence.blockReason ? (
						<code
							data-testid="coherence-code"
							className="rounded bg-red-500/20 px-1.5 py-0.5 font-mono text-xs text-red-700 dark:text-red-300"
						>
							{coherence.blockReason.code}
						</code>
					) : null}
				</div>
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
