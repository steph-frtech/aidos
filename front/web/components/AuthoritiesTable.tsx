"use client";

import { type AuthorityGraph, decide, type Truth } from "@/lib/authority";
import type { AdmissionRow } from "@/lib/authority-data";

/**
 * AuthoritiesTable — the read-only /authorities admission table (S16). One row per candidate
 * admission: its label, the roles that granted approval/veto, and the decision badge computed
 * by the pure decider (lib/authority.ts, the projection of back/kernel/authority) — green
 * ADMITTED, red BLOCKED (with the BlockReason code + how_to_fix), amber ESCALATED (with the
 * escalation roles). The no-approval regulatory row shows BLOCKED / MISSING_AUTHORITY_APPROVAL
 * in red — THE done criterion.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): it renders the decider's verdict; it triggers no
 * operation and writes no truth (the wall — truth-writes / reauthorizes go via propose →
 * ChangeSet → approval). The decision is computed here, never declared.
 */

interface Labels {
	admissionLabel: string;
	grantedLabel: string;
	decisionLabel: string;
	reasonLabel: string;
	howToFixLabel: string;
	escalatedToLabel: string;
	badgeAdmitted: string;
	badgeBlocked: string;
	badgeEscalated: string;
	noGranted: string;
}

const badgeClass: Record<"admitted" | "blocked" | "escalated", string> = {
	admitted:
		"border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	blocked: "border-destructive/40 bg-destructive/10 text-destructive",
	escalated:
		"border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export function AuthoritiesTable({
	graph,
	truth,
	rows,
	labels,
}: {
	graph: AuthorityGraph;
	truth: Truth;
	rows: readonly AdmissionRow[];
	labels: Labels;
}) {
	const badgeText: Record<"admitted" | "blocked" | "escalated", string> = {
		admitted: labels.badgeAdmitted,
		blocked: labels.badgeBlocked,
		escalated: labels.badgeEscalated,
	};

	return (
		<div className="overflow-x-auto rounded-xl border border-border">
			<table className="w-full border-collapse text-left text-sm">
				<thead>
					<tr className="border-b border-border bg-muted/40 text-[0.7rem] uppercase tracking-wider text-muted-foreground">
						<th className="px-4 py-3 font-medium">{labels.admissionLabel}</th>
						<th className="px-4 py-3 font-medium">{labels.grantedLabel}</th>
						<th className="px-4 py-3 font-medium">{labels.decisionLabel}</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => {
						const d = decide(graph, truth, row.granted);
						const code = d.blockReason?.code ?? "";
						return (
							<tr
								key={row.label}
								data-testid="admission-row"
								data-decision={d.decision}
								data-code={code}
								className="border-b border-border last:border-0 align-top"
							>
								<td className="px-4 py-3 text-card-foreground">{row.label}</td>
								<td className="px-4 py-3">
									{row.granted.length === 0 ? (
										<span
											data-testid="no-granted"
											className="font-mono text-xs text-muted-foreground"
										>
											{labels.noGranted}
										</span>
									) : (
										<div className="flex flex-wrap gap-1.5">
											{row.granted.map((g) => (
												<span
													key={g}
													data-testid="granted-chip"
													data-role={g}
													className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-0.5 font-mono text-xs text-foreground"
												>
													{g}
												</span>
											))}
										</div>
									)}
								</td>
								<td className="px-4 py-3">
									<div className="flex flex-col gap-1.5">
										<span
											data-testid="decision-badge"
											className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold ${badgeClass[d.decision]}`}
										>
											{badgeText[d.decision]}
										</span>
										{code ? (
											<code
												data-testid="decision-reason"
												className="font-mono text-[0.7rem] text-destructive"
											>
												{labels.reasonLabel}: {code}
											</code>
										) : null}
										{d.blockReason ? (
											<ul
												data-testid="how-to-fix"
												className="ml-1 list-inside list-disc space-y-0.5 text-[0.7rem] text-muted-foreground"
											>
												{d.blockReason.howToFix.map((fix) => (
													<li key={fix} className="font-mono">
														{fix}
													</li>
												))}
											</ul>
										) : null}
										{d.escalatedTo && d.escalatedTo.length > 0 ? (
											<span
												data-testid="escalated-to"
												className="font-mono text-[0.7rem] text-amber-600 dark:text-amber-400"
											>
												{labels.escalatedToLabel}: {d.escalatedTo.join(", ")}
											</span>
										) : null}
									</div>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
