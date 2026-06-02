"use client";

import { useState } from "react";
import type { BlockReason } from "@/lib/why-blocked";

/**
 * WhyBlockedExplorer — the interactive /why-blocked panel (S13). It renders a
 * BlockReason exactly as `aidos explain <CODE>` does (code badge, severity,
 * explanation prose, numbered how_to_fix) and lets a human switch between the
 * canonical codes. Read-only: it shows a refusal's resolution path; it triggers no
 * operation (a BlockReason is produced at refusal time elsewhere — S13 is
 * descriptive, not a wall).
 *
 * Determinism-first: the reasons are a static prop from lib/why-blocked.ts (the
 * projection of back/runtime/blockreason); this component only selects which one is
 * focused. No I/O, no fetch.
 */

interface Labels {
	codeLabel: string;
	severityLabel: string;
	explanationLabel: string;
	howToFixLabel: string;
	selectLabel: string;
}

export function WhyBlockedExplorer({
	reasons,
	labels,
}: {
	reasons: readonly BlockReason[];
	labels: Labels;
}) {
	const [selected, setSelected] = useState<string>(reasons[0]?.code ?? "");
	const current = reasons.find((r) => r.code === selected) ?? reasons[0];

	if (!current) return null;

	return (
		<div className="space-y-5">
			{/* Code selector — switch which BlockReason is explained */}
			<fieldset
				aria-label={labels.selectLabel}
				className="flex flex-wrap gap-2 border-0 p-0 m-0"
			>
				{reasons.map((r) => {
					const active = r.code === current.code;
					return (
						<button
							key={r.code}
							type="button"
							data-testid={`select-${r.code}`}
							aria-pressed={active}
							onClick={() => setSelected(r.code)}
							className={
								active
									? "rounded-md bg-primary px-3 py-1.5 font-mono text-xs font-semibold text-primary-foreground"
									: "rounded-md border border-border bg-card px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
							}
						>
							{r.code}
						</button>
					);
				})}
			</fieldset>

			{/* The focused BlockReason — rendered as `aidos explain` renders it */}
			<article
				data-testid="block-reason"
				data-code={current.code}
				className="space-y-4 rounded-xl border border-destructive/40 bg-card p-5"
			>
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
						{labels.codeLabel}
					</span>
					<code
						data-testid="block-reason-code"
						className="rounded bg-destructive/10 px-2 py-1 font-mono text-sm font-semibold text-destructive"
					>
						{current.code}
					</code>
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
						{labels.severityLabel}:{" "}
						<span data-testid="block-reason-severity" className="ml-1">
							{current.severity}
						</span>
					</span>
				</div>

				<div className="space-y-1">
					<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
						{labels.explanationLabel}
					</p>
					<p
						data-testid="block-reason-explanation"
						className="text-sm leading-relaxed text-card-foreground"
					>
						{current.explanation}
					</p>
				</div>

				<div className="space-y-1">
					<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
						{labels.howToFixLabel}
					</p>
					<ol
						data-testid="block-reason-howtofix"
						className="list-decimal space-y-1 pl-5 text-sm text-card-foreground"
					>
						{current.howToFix.map((step) => (
							<li key={step} className="leading-relaxed">
								{step}
							</li>
						))}
					</ol>
				</div>
			</article>
		</div>
	);
}
