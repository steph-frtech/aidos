"use client";

import { useState } from "react";
import { clean, lint, serializeBody } from "@/lib/lexicon";
import { LEXICON_CASES, type LexiconCase } from "@/lib/lexicon-data";

/**
 * LexiconPanel — the action-capable /lexicon panel (FK14, the inter-layer linter). It lets the human
 * PICK one of the canonical scenarios (the FKE-21 ReturnRequest in lexicon, or the FK14
 * fault-injection — a renamed DB table out of lexicon, plus the unknown-symbol / unknown-layer
 * drifts) and RUN the lint (the action, executable from the screen — not a static display): it
 * calls the same pure `lint` the Go lexicon.Lint computes, then renders the drifts (RENAMED /
 * UNKNOWN_SYMBOL / UNKNOWN_LAYER) — or the clean verdict.
 *
 * THE DONE CRITERIA, visible & executable: linting the renamed-table scenario shows one RENAMED
 * drift (the symbol out of lexicon → red); the in-lexicon scenario is CLEAN (green); the lint is a
 * pure function of the lexicon + symbols (the same drifts every run).
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): the action computes + projects the drifts; it
 * NEVER writes truth — freezing/updating a lexicon goes via propose → /goal → approval. The lint is
 * RENDERED, never re-implemented here. Themed on ADR 0010 tokens; bilingual via next-intl (ADR
 * 0011) — strings are passed in as labels.
 */

interface Labels {
	pickLabel: string;
	lintLabel: string;
	awaiting: string;
	conceptLabel: string;
	cleanNote: string;
	driftsHeading: string;
	expectedLabel: string;
	bodyLabel: string;
	caseNames: Record<string, string>;
	driftNames: Record<string, string>;
}

export function LexiconPanel({ labels }: { labels: Labels }) {
	const [selectedId, setSelectedId] = useState<string>("");

	const chosen: LexiconCase | null =
		LEXICON_CASES.find((c) => c.id === selectedId) ?? null;
	const drifts = chosen ? lint(chosen.lexicon, chosen.observations) : null;
	const isClean = chosen ? clean(chosen.lexicon, chosen.observations) : false;
	const body = chosen ? serializeBody(chosen.lexicon) : "";

	return (
		<div className="space-y-6">
			{/* The action: pick a scenario, run the linter */}
			<div className="flex flex-wrap items-end gap-3">
				<label className="flex flex-col gap-1.5 text-sm">
					<span className="font-medium text-foreground">
						{labels.pickLabel}
					</span>
					<select
						aria-label={labels.pickLabel}
						value={selectedId}
						onChange={(ev) => setSelectedId(ev.target.value)}
						className="min-w-72 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
					>
						<option value="">{labels.awaiting}</option>
						{LEXICON_CASES.map((c) => (
							<option key={c.id} value={c.id}>
								{labels.caseNames[c.labelKey] ?? c.id}
							</option>
						))}
					</select>
				</label>
				<span className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">
					{labels.lintLabel}
				</span>
			</div>

			{chosen && drifts ? (
				<section
					aria-label="lexicon-result"
					data-testid="lexicon-result"
					className="space-y-4 rounded-lg border border-border bg-card p-5"
				>
					<p className="text-sm text-muted-foreground">
						<span className="font-medium text-foreground">
							{labels.conceptLabel}:{" "}
						</span>
						<code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
							{chosen.lexicon.concept}
						</code>
					</p>

					{isClean ? (
						<p
							data-testid="clean-note"
							className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
						>
							{labels.cleanNote}
						</p>
					) : (
						<>
							<h3 className="text-sm font-semibold tracking-tight text-foreground">
								{labels.driftsHeading}
							</h3>
							<ol className="space-y-2" data-testid="drifts">
								{drifts.map((d, i) => (
									<li
										key={`${d.layer}-${d.symbol}`}
										data-testid={`drift-${i}`}
										data-kind={d.kind}
										data-layer={d.layer}
										className="flex flex-wrap items-center gap-3 rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2"
									>
										<span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
											{d.layer}
										</span>
										<code className="font-mono text-xs text-red-600 dark:text-red-400">
											{d.symbol}
										</code>
										<span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-400">
											{labels.driftNames[d.kind] ?? d.kind}
										</span>
										{d.expected ? (
											<span className="text-xs text-muted-foreground">
												{labels.expectedLabel}:{" "}
												<code className="rounded bg-muted px-1.5 py-0.5 text-xs text-emerald-700 dark:text-emerald-400">
													{d.expected}
												</code>
											</span>
										) : null}
									</li>
								))}
							</ol>
						</>
					)}

					{/* the content-addressed lexicon body made concrete (the storage fork) */}
					<div className="space-y-1">
						<p className="text-xs font-medium text-muted-foreground">
							{labels.bodyLabel}
						</p>
						<pre
							data-testid="lexicon-body"
							className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-foreground"
						>
							{body}
						</pre>
					</div>
				</section>
			) : null}
		</div>
	);
}
