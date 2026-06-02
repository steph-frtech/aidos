"use client";

import { useState } from "react";
import { admit, type GlobalInvariant, redWave } from "@/lib/global-invariant";
import {
	ADMISSION_ROWS,
	type AdmissionRow,
	PII_FORGETTABLE_FEDERATION,
	VIOLATED_CELL,
} from "@/lib/global-invariant-data";

/**
 * GlobalInvariantPanel — the action-capable /global-invariants panel (S48). It renders the
 * cross-cell pii-forgettable-federation invariant card, a red-wave panel proving a billing
 * violation reddens ALL THREE cells (not just the violator), and a live admission table whose
 * decisions are COMPUTED by the pure decider (lib/global-invariant), never declared.
 *
 * ACTION-CAPABLE, WALL-SAFE (CLAUDE.md §7): declaring / re-scoping a GlobalInvariant is a
 * truth-write, so the "Proposer un ChangeSet" control does NOT write the kernel from the
 * screen — it opens a propose → ChangeSet → approval intent (a DRAFT, SemanticDiff change_type
 * `rescope`/`reweight`/`reauthorize`, KRD §44.1). The S20 ChangeSet engine + the /goal
 * admission wiring are later steps; here the control surfaces the proposal as an OpenQuestion
 * stub, so no headless capability and no direct truth-write.
 */

interface Labels {
	cardHeading: string;
	scopeLabel: string;
	cellsLabel: string;
	predicateLabel: string;
	blastRadiusLabel: string;
	approvalRequiredLabel: string;
	redWaveHeading: string;
	redWaveBody: string;
	reddenedLabel: string;
	violatorLabel: string;
	admissionHeading: string;
	grantedLabel: string;
	decisionLabel: string;
	reasonLabel: string;
	howToFixLabel: string;
	badgeAdmitted: string;
	badgeBlocked: string;
	badgeEscalated: string;
	proposeHeading: string;
	proposeButton: string;
	proposeStubHeading: string;
	proposeStubBody: string;
}

function decisionBadge(
	decision: "admitted" | "blocked" | "escalated",
	labels: Labels,
) {
	switch (decision) {
		case "admitted":
			return {
				text: labels.badgeAdmitted,
				cls: "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
			};
		case "blocked":
			return {
				text: labels.badgeBlocked,
				cls: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300",
			};
		default:
			return {
				text: labels.badgeEscalated,
				cls: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
			};
	}
}

export function GlobalInvariantPanel({ labels }: { labels: Labels }) {
	const gi: GlobalInvariant = PII_FORGETTABLE_FEDERATION;
	const wave = redWave(gi, VIOLATED_CELL);
	const reddened = new Set(wave);
	const [proposed, setProposed] = useState(false);

	return (
		<div className="space-y-10" data-testid="global-invariant-panel">
			{/* The invariant card */}
			<section
				aria-label={labels.cardHeading}
				data-testid="invariant-card"
				className="space-y-4 rounded-xl border border-border bg-card p-6"
			>
				<h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
					<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">
						{gi.name}
					</code>
				</h2>
				<dl className="grid gap-4 sm:grid-cols-2">
					<div>
						<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{labels.scopeLabel}
						</dt>
						<dd
							data-testid="invariant-scope"
							className="mt-1 font-mono text-sm text-foreground"
						>
							{gi.scope}
						</dd>
					</div>
					<div>
						<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{labels.blastRadiusLabel}
						</dt>
						<dd
							data-testid="invariant-blast-radius"
							className="mt-1 font-mono text-sm text-foreground"
						>
							{gi.blastRadius}
						</dd>
					</div>
					<div>
						<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{labels.approvalRequiredLabel}
						</dt>
						<dd
							data-testid="invariant-approval-required"
							className="mt-1 font-mono text-sm text-foreground"
						>
							{gi.approvalRequired}
						</dd>
					</div>
					<div>
						<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{labels.predicateLabel}
						</dt>
						<dd className="mt-1 font-mono text-sm text-foreground">
							{gi.predicate}
						</dd>
					</div>
					<div className="sm:col-span-2">
						<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{labels.cellsLabel}
						</dt>
						<dd className="mt-1 flex flex-wrap gap-2">
							{gi.cells.map((c) => (
								<span
									key={c}
									data-testid={`cell-${c}`}
									className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 font-mono text-xs text-foreground"
								>
									{c}
								</span>
							))}
						</dd>
					</div>
				</dl>
			</section>

			{/* The red-wave fan-out panel */}
			<section
				aria-label={labels.redWaveHeading}
				data-testid="red-wave-panel"
				className="space-y-4 rounded-xl border border-border bg-card p-6"
			>
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.redWaveHeading}
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{labels.redWaveBody}
				</p>
				<ul className="flex flex-wrap gap-3">
					{gi.cells.map((c) => {
						const isRed = reddened.has(c);
						const isViolator = c === VIOLATED_CELL;
						return (
							<li
								key={c}
								data-testid={`wave-cell-${c}`}
								data-red={isRed ? "true" : "false"}
								className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium ${
									isRed
										? "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300"
										: "border-border bg-muted text-muted-foreground"
								}`}
							>
								<code className="font-mono text-xs">{c}</code>
								<span className="text-xs">
									{isRed ? labels.reddenedLabel : ""}
									{isViolator ? ` (${labels.violatorLabel})` : ""}
								</span>
							</li>
						);
					})}
				</ul>
			</section>

			{/* The admission table — decisions computed by the pure decider */}
			<section
				aria-label={labels.admissionHeading}
				data-testid="admission-table"
				className="space-y-4"
			>
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.admissionHeading}
				</h2>
				<div className="overflow-hidden rounded-xl border border-border">
					<table className="w-full text-left text-sm">
						<thead className="bg-muted/60 text-xs tracking-wide text-muted-foreground uppercase">
							<tr>
								<th className="px-4 py-3 font-medium">{labels.grantedLabel}</th>
								<th className="px-4 py-3 font-medium">
									{labels.decisionLabel}
								</th>
								<th className="px-4 py-3 font-medium">{labels.reasonLabel}</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{ADMISSION_ROWS.map((row: AdmissionRow) => {
								const d = admit(gi, row.granted);
								const badge = decisionBadge(d.decision, labels);
								return (
									<tr
										key={row.granted}
										data-testid={`admission-row-${row.granted}`}
										data-decision={d.decision}
									>
										<td className="px-4 py-3 align-top">
											<code className="font-mono text-xs text-foreground">
												{row.granted}
											</code>
											<p className="mt-1 text-xs text-muted-foreground">
												{row.label}
											</p>
										</td>
										<td className="px-4 py-3 align-top">
											<span
												data-testid={`decision-${row.granted}`}
												className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}
											>
												{badge.text}
											</span>
										</td>
										<td className="px-4 py-3 align-top">
											{d.blockReason ? (
												<div className="space-y-1">
													<code
														data-testid={`block-code-${row.granted}`}
														className="rounded bg-red-500/20 px-1.5 py-0.5 font-mono text-xs text-red-700 dark:text-red-300"
													>
														{d.blockReason.code}
													</code>
													<p className="text-xs text-muted-foreground">
														{labels.howToFixLabel}:{" "}
														<span className="font-mono">
															{d.blockReason.howToFix.join(", ")}
														</span>
													</p>
												</div>
											) : d.escalatedTo ? (
												<span className="font-mono text-xs text-muted-foreground">
													→ {d.escalatedTo.join(", ")}
												</span>
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
