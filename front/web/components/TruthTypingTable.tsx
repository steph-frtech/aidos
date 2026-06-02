"use client";

import { badgeVariant, classify, type Truth } from "@/lib/truth-typing";

/**
 * TruthTypingTable — the read-only /truth-typing panel (S14). One row per candidate
 * truth: its label, its TruthKind chip, its VerifiabilityLevel chip, and the routing
 * badge computed by the pure classifier (lib/truth-typing.ts, the projection of
 * back/kernel/truthtyping) — green KERNEL (admitted), amber /SPIKE (routed away), red
 * REJECTED (no/unknown kind, with the BlockReason code).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): it renders the classifier's verdict; it
 * triggers no operation and writes no truth (the wall). The verdict is computed here,
 * never declared.
 */

export interface TruthRow extends Truth {
	label: string;
}

interface Labels {
	truthLabel: string;
	kindLabel: string;
	levelLabel: string;
	routingLabel: string;
	reasonLabel: string;
	badgeKernel: string;
	badgeSpike: string;
	badgeRejected: string;
	none: string;
}

const badgeClass: Record<"kernel" | "spike" | "rejected", string> = {
	kernel:
		"border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	spike:
		"border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
	rejected: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function TruthTypingTable({
	rows,
	labels,
}: {
	rows: readonly TruthRow[];
	labels: Labels;
}) {
	const badgeText: Record<"kernel" | "spike" | "rejected", string> = {
		kernel: labels.badgeKernel,
		spike: labels.badgeSpike,
		rejected: labels.badgeRejected,
	};

	return (
		<div className="overflow-x-auto rounded-xl border border-border">
			<table className="w-full border-collapse text-left text-sm">
				<thead>
					<tr className="border-b border-border bg-muted/40 text-[0.7rem] uppercase tracking-wider text-muted-foreground">
						<th className="px-4 py-3 font-medium">{labels.truthLabel}</th>
						<th className="px-4 py-3 font-medium">{labels.kindLabel}</th>
						<th className="px-4 py-3 font-medium">{labels.levelLabel}</th>
						<th className="px-4 py-3 font-medium">{labels.routingLabel}</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => {
						const routing = classify(row);
						const variant = badgeVariant(routing);
						return (
							<tr
								key={row.label}
								data-testid="truth-row"
								data-routing={variant}
								data-code={routing.code ?? ""}
								className="border-b border-border last:border-0"
							>
								<td className="px-4 py-3 text-card-foreground">{row.label}</td>
								<td className="px-4 py-3">
									<span
										data-testid="kind-chip"
										className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-0.5 font-mono text-xs text-foreground"
									>
										{row.truthKind || labels.none}
									</span>
								</td>
								<td className="px-4 py-3">
									<span
										data-testid="level-chip"
										className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-0.5 font-mono text-xs text-foreground"
									>
										{row.verifiabilityLevel || labels.none}
									</span>
								</td>
								<td className="px-4 py-3">
									<div className="flex flex-col gap-1">
										<span
											data-testid="routing-badge"
											className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold ${badgeClass[variant]}`}
										>
											{badgeText[variant]}
										</span>
										{routing.code ? (
											<code
												data-testid="routing-reason"
												className="font-mono text-[0.7rem] text-destructive"
											>
												{labels.reasonLabel}: {routing.code}
											</code>
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
