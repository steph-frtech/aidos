"use client";

import { useState } from "react";
import { serializeEdgeBody, trace } from "@/lib/caused-by";
import { CAUSED_BY_CASES, type CausedByCase } from "@/lib/caused-by-data";

/**
 * CausedByPanel — the action-capable /caused-by panel (FK12). It lets the human PICK one of the
 * canonical caused_by graphs (the §17 cause chain / a root leaf / a cyclic variant) and RUN the
 * upward TRACE (the "trace the cause chain" action, executable from the screen — not a static
 * display): it calls the same pure `trace` the Go causedby.Trace computes, then renders the ordered
 * CauseChain (candidate causes NEAREST-FIRST), OR the cycle refusal when the graph loops.
 *
 * THE DONE CRITERIA, visible & executable: tracing checkout-chain shows the ordered candidate
 * causes (createOrder → Order → authzPolicy → add_total_col); tracing the root leaf shows NO further
 * cause; tracing the cyclic graph is REFUSED (CAUSED_BY_CYCLE). The serialized kernel.link body of
 * the first edge is shown to make the content-addressed versioning concrete.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): the action computes + projects the chain; it
 * NEVER writes truth — a new caused_by row goes via propose → ChangeSet → approval. The trace is
 * RENDERED, never re-implemented in the front-end. Themed on ADR 0010 tokens; bilingual via
 * next-intl (ADR 0011) — strings are passed in as labels.
 */

interface Labels {
	pickLabel: string;
	traceLabel: string;
	awaiting: string;
	symptomLabel: string;
	chainHeading: string;
	emptyChain: string;
	cycleRefused: string;
	bodyLabel: string;
	caseNames: Record<string, string>;
}

export function CausedByPanel({ labels }: { labels: Labels }) {
	const [selectedId, setSelectedId] = useState<string>("");

	const chosen: CausedByCase | null =
		CAUSED_BY_CASES.find((c) => c.id === selectedId) ?? null;
	const result = chosen ? trace(chosen.symptom, chosen.edges) : null;
	const body = chosen ? serializeEdgeBody(chosen.edges[0]) : "";

	return (
		<div className="space-y-6">
			{/* The action: pick a graph, trace upward */}
			<div className="flex flex-wrap items-end gap-3">
				<label className="flex flex-col gap-1.5 text-sm">
					<span className="font-medium text-foreground">
						{labels.pickLabel}
					</span>
					<select
						aria-label={labels.pickLabel}
						value={selectedId}
						onChange={(ev) => setSelectedId(ev.target.value)}
						className="min-w-64 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
					>
						<option value="">{labels.awaiting}</option>
						{CAUSED_BY_CASES.map((c) => (
							<option key={c.id} value={c.id}>
								{labels.caseNames[c.labelKey] ?? c.id}
							</option>
						))}
					</select>
				</label>
				<span className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">
					{labels.traceLabel}
				</span>
			</div>

			{chosen && result ? (
				<section
					aria-label="cause-chain"
					data-testid="cause-chain"
					className="space-y-4 rounded-lg border border-border bg-card p-5"
				>
					<p className="text-sm text-muted-foreground">
						<span className="font-medium text-foreground">
							{labels.symptomLabel}:{" "}
						</span>
						<code className="rounded bg-muted px-1.5 py-0.5 text-xs text-red-600 dark:text-red-400">
							{chosen.symptom}
						</code>
					</p>

					{!result.ok ? (
						<p
							data-testid="cycle-refused"
							className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
						>
							{labels.cycleRefused} — <code>{result.error}</code>
						</p>
					) : result.chain.causes.length === 0 ? (
						<p
							data-testid="empty-chain"
							className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
						>
							{labels.emptyChain}
						</p>
					) : (
						<>
							<h3 className="text-sm font-semibold tracking-tight text-foreground">
								{labels.chainHeading}
							</h3>
							<ol className="space-y-2">
								{result.chain.causes.map((cause, i) => (
									<li
										key={cause}
										data-testid={`cause-${cause}`}
										data-order={i}
										className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2"
									>
										<span className="font-mono text-xs text-muted-foreground">
											{i + 1}.
										</span>
										<span className="font-medium text-amber-700 dark:text-amber-400">
											{cause}
										</span>
									</li>
								))}
							</ol>
						</>
					)}

					{/* the content-addressed versioning made concrete: the first edge's kernel.link body */}
					<div className="space-y-1">
						<p className="text-xs font-medium text-muted-foreground">
							{labels.bodyLabel}
						</p>
						<pre
							data-testid="edge-body"
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
