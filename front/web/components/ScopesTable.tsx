"use client";

import {
	dimensions,
	rejectionCode,
	type ScopeRecord,
	verdict,
} from "@/lib/scope";

/**
 * ScopesTable — the read-only /scopes panel (S15). One row per candidate record: its
 * label, its lifecycle status, its TruthScope as labelled dimension chips
 * (region / target / user_segment / environment / time_window / tenant), and the verdict
 * badge computed by the pure guard (lib/scope.ts, the projection of back/kernel/scope) —
 * green ACCEPTED (a scoped active truth or a non-active exempt one), blue GLOBAL (explicit)
 * when region === "*", red REJECTED — active truth without a scope (with the §13.7 code).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): it renders the guard's verdict; it triggers no
 * operation and writes no truth (the wall — truth-writes / rescopes go via propose →
 * ChangeSet → approval). The verdict is computed here, never declared.
 */

export interface ScopeRow extends ScopeRecord {
	label: string;
}

interface Labels {
	truthLabel: string;
	statusLabel: string;
	scopeLabel: string;
	verdictLabel: string;
	reasonLabel: string;
	badgeAccepted: string;
	badgeGlobal: string;
	badgeRejected: string;
	noScope: string;
	authority: string;
}

const badgeClass: Record<"accepted" | "global" | "rejected", string> = {
	accepted:
		"border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	global: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400",
	rejected: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function ScopesTable({
	rows,
	labels,
}: {
	rows: readonly ScopeRow[];
	labels: Labels;
}) {
	const badgeText: Record<"accepted" | "global" | "rejected", string> = {
		accepted: labels.badgeAccepted,
		global: labels.badgeGlobal,
		rejected: labels.badgeRejected,
	};

	return (
		<div className="overflow-x-auto rounded-xl border border-border">
			<table className="w-full border-collapse text-left text-sm">
				<thead>
					<tr className="border-b border-border bg-muted/40 text-[0.7rem] uppercase tracking-wider text-muted-foreground">
						<th className="px-4 py-3 font-medium">{labels.truthLabel}</th>
						<th className="px-4 py-3 font-medium">{labels.statusLabel}</th>
						<th className="px-4 py-3 font-medium">{labels.scopeLabel}</th>
						<th className="px-4 py-3 font-medium">{labels.verdictLabel}</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => {
						const v = verdict(row);
						const code = rejectionCode(row);
						const dims = dimensions(row.scope);
						return (
							<tr
								key={row.label}
								data-testid="scope-row"
								data-verdict={v}
								data-code={code}
								className="border-b border-border last:border-0 align-top"
							>
								<td className="px-4 py-3 text-card-foreground">{row.label}</td>
								<td className="px-4 py-3">
									<span
										data-testid="status-chip"
										className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-0.5 font-mono text-xs text-foreground"
									>
										{row.status}
									</span>
								</td>
								<td className="px-4 py-3">
									{dims.length === 0 ? (
										<span
											data-testid="no-scope"
											className="font-mono text-xs text-muted-foreground"
										>
											{labels.noScope}
										</span>
									) : (
										<div className="flex flex-wrap gap-1.5">
											{dims.map((d) => (
												<span
													key={d.key}
													data-testid="scope-chip"
													data-dimension={d.key}
													className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 font-mono text-xs text-foreground"
												>
													<span className="text-muted-foreground">
														{d.key}:
													</span>
													<span>{d.value}</span>
												</span>
											))}
										</div>
									)}
								</td>
								<td className="px-4 py-3">
									<div className="flex flex-col gap-1">
										<span
											data-testid="verdict-badge"
											className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold ${badgeClass[v]}`}
										>
											{badgeText[v]}
										</span>
										{code ? (
											<code
												data-testid="verdict-reason"
												className="font-mono text-[0.7rem] text-destructive"
											>
												{labels.reasonLabel}: {code}
											</code>
										) : null}
										<span
											data-testid="authority-badge"
											className="inline-flex w-fit items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground"
										>
											{labels.authority}
										</span>
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
