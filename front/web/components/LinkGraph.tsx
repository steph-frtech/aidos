"use client";

import { useState } from "react";
import {
	type Heads,
	type Link,
	type LinkStatus,
	refString,
	resolve,
} from "@/lib/links";

/**
 * LinkGraph — the read-only /link-graph panel (S17). One row per edge of the six-link example
 * graph: its kind, its consuming `from` ref, its PINNED `to` target (id@version), and a status
 * badge computed by the pure resolver (lib/links.ts, the projection of back/kernel/links) —
 * green pinned-to-head, red stale (non-head) or absent (no head). A heads toggle flips between
 * the head-pinned heads (the binds edge green) and the absent-target heads (the same edge
 * RED / absent — THE done criterion, rendered, not re-implemented).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): the toggle changes only which `heads` snapshot the
 * pure resolver runs against — it writes no truth (the wall). The status is computed here,
 * never declared.
 */

interface Labels {
	kindLabel: string;
	fromLabel: string;
	toLabel: string;
	statusLabel: string;
	badgeGreen: string;
	badgeStale: string;
	badgeAbsent: string;
	headsHeading: string;
	toggleAllGreen: string;
	toggleAbsent: string;
}

const badgeClass: Record<LinkStatus, string> = {
	green:
		"border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	stale: "border-destructive/40 bg-destructive/10 text-destructive",
	absent: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function LinkGraph({
	links,
	headsAllGreen,
	headsAbsent,
	labels,
}: {
	links: readonly Link[];
	headsAllGreen: Heads;
	headsAbsent: Heads;
	labels: Labels;
}) {
	const [absent, setAbsent] = useState(false);
	const heads = absent ? headsAbsent : headsAllGreen;

	const badgeText: Record<LinkStatus, string> = {
		green: labels.badgeGreen,
		stale: labels.badgeStale,
		absent: labels.badgeAbsent,
	};

	return (
		<div className="space-y-4">
			{/* Heads toggle — flips which heads snapshot the pure resolver runs against */}
			<fieldset className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-3">
				<legend className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
					{labels.headsHeading}
				</legend>
				<div className="flex gap-1.5">
					<button
						type="button"
						data-testid="heads-all-green"
						aria-pressed={!absent}
						onClick={() => setAbsent(false)}
						className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
							!absent
								? "border-blue-600 bg-blue-600 text-white"
								: "border-border bg-card text-muted-foreground hover:bg-muted"
						}`}
					>
						{labels.toggleAllGreen}
					</button>
					<button
						type="button"
						data-testid="heads-absent"
						aria-pressed={absent}
						onClick={() => setAbsent(true)}
						className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
							absent
								? "border-destructive bg-destructive text-white"
								: "border-border bg-card text-muted-foreground hover:bg-muted"
						}`}
					>
						{labels.toggleAbsent}
					</button>
				</div>
			</fieldset>

			<div className="overflow-x-auto rounded-xl border border-border">
				<table className="w-full border-collapse text-left text-sm">
					<thead>
						<tr className="border-b border-border bg-muted/40 text-[0.7rem] uppercase tracking-wider text-muted-foreground">
							<th className="px-4 py-3 font-medium">{labels.kindLabel}</th>
							<th className="px-4 py-3 font-medium">{labels.fromLabel}</th>
							<th className="px-4 py-3 font-medium">{labels.toLabel}</th>
							<th className="px-4 py-3 font-medium">{labels.statusLabel}</th>
						</tr>
					</thead>
					<tbody>
						{links.map((l) => {
							const status = resolve(l, heads);
							return (
								<tr
									key={`${l.kind}:${refString(l.from)}->${refString(l.to)}`}
									data-testid="link-edge"
									data-kind={l.kind}
									data-status={status}
									className="border-b border-border align-top last:border-0"
								>
									<td className="px-4 py-3">
										<span
											data-testid="edge-kind"
											className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-0.5 font-mono text-xs text-foreground"
										>
											{l.kind}
										</span>
									</td>
									<td className="px-4 py-3 font-mono text-xs text-muted-foreground">
										{refString(l.from)}
									</td>
									<td className="px-4 py-3 font-mono text-xs text-card-foreground">
										{refString(l.to)}
									</td>
									<td className="px-4 py-3">
										<span
											data-testid="edge-status"
											className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold ${badgeClass[status]}`}
										>
											{badgeText[status]}
										</span>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}
