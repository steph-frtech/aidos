"use client";

import { useState } from "react";
import { build, serializeBody } from "@/lib/why-tree";
import { WHY_TREE_CASES, type WhyTreeCase } from "@/lib/why-tree-data";

/**
 * WhyTreePanel — the action-capable /why-tree panel (FK13, the `/why` gesture). It lets the human
 * PICK one of the canonical scenarios (an incident → tree → terminal mirror, or one of the three
 * refusals) and RUN the build (the "/why" action, executable from the screen — not a static
 * display): it calls the same pure `build` the Go whytree.Build computes, then renders the WhyTree
 * (ordered REPRODUCED candidate causes, the ROOT cause, the terminal anti-recurrence mirror), OR
 * the closed refusal (WHYTREE_NO_MIRROR / WHYTREE_CAUSE_NOT_REPRODUCED / CAUSED_BY_CYCLE).
 *
 * THE DONE CRITERIA, visible & executable: building the incident scenario shows the tree rooted at
 * add_total_col with its terminal mirror (root → /learn → red wave); the no-mirror scenario is
 * REFUSED WHYTREE_NO_MIRROR; the non-reproduced scenario is REFUSED (anti-confabulation); the
 * cyclic scenario is REFUSED CAUSED_BY_CYCLE with no partial tree.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): the action computes + projects the tree; it
 * NEVER writes truth — freezing the terminal anti-recurrence mirror goes via propose → /learn →
 * /goal → approval. The build is RENDERED, never re-implemented here. Themed on ADR 0010 tokens;
 * bilingual via next-intl (ADR 0011) — strings are passed in as labels.
 */

interface Labels {
	pickLabel: string;
	buildLabel: string;
	awaiting: string;
	symptomLabel: string;
	provenanceLabel: string;
	causesHeading: string;
	rootLabel: string;
	leafNote: string;
	terminalHeading: string;
	terminalNote: string;
	redWaveNote: string;
	refusedLabel: string;
	bodyLabel: string;
	caseNames: Record<string, string>;
	errorNames: Record<string, string>;
}

export function WhyTreePanel({ labels }: { labels: Labels }) {
	const [selectedId, setSelectedId] = useState<string>("");

	const chosen: WhyTreeCase | null =
		WHY_TREE_CASES.find((c) => c.id === selectedId) ?? null;
	const result = chosen ? build(chosen.input) : null;
	const body = result?.ok ? serializeBody(result.tree) : "";

	return (
		<div className="space-y-6">
			{/* The action: pick a scenario, run /why */}
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
						{WHY_TREE_CASES.map((c) => (
							<option key={c.id} value={c.id}>
								{labels.caseNames[c.labelKey] ?? c.id}
							</option>
						))}
					</select>
				</label>
				<span className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">
					{labels.buildLabel}
				</span>
			</div>

			{chosen && result ? (
				<section
					aria-label="why-tree"
					data-testid="why-tree"
					className="space-y-4 rounded-lg border border-border bg-card p-5"
				>
					<p className="text-sm text-muted-foreground">
						<span className="font-medium text-foreground">
							{labels.symptomLabel}:{" "}
						</span>
						<code className="rounded bg-muted px-1.5 py-0.5 text-xs text-red-600 dark:text-red-400">
							{chosen.input.symptom}
						</code>
						<span className="ml-3 font-medium text-foreground">
							{labels.provenanceLabel}:{" "}
						</span>
						<code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
							{chosen.input.provenance}
						</code>
					</p>

					{!result.ok ? (
						<p
							data-testid="refused"
							data-error={result.error}
							className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
						>
							{labels.refusedLabel} —{" "}
							<code>{labels.errorNames[result.error] ?? result.error}</code>
						</p>
					) : (
						<>
							{/* the ordered reproduced causes (the fishbone, nearest-first) */}
							{result.tree.causes.length === 0 ? (
								<p
									data-testid="leaf-note"
									className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
								>
									{labels.leafNote}
								</p>
							) : (
								<>
									<h3 className="text-sm font-semibold tracking-tight text-foreground">
										{labels.causesHeading}
									</h3>
									<ol className="space-y-2">
										{result.tree.causes.map((c, i) => (
											<li
												key={c.causeId}
												data-testid={`cause-${c.causeId}`}
												data-order={i}
												data-reproduced={c.reproduced ? "true" : "false"}
												className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2"
											>
												<span className="font-mono text-xs text-muted-foreground">
													{i + 1}.
												</span>
												<span className="font-medium text-amber-700 dark:text-amber-400">
													{c.causeId}
												</span>
												<span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
													reproduced
												</span>
											</li>
										))}
									</ol>
								</>
							)}

							{/* the ROOT cause + the OBLIGATORY terminal anti-recurrence mirror */}
							<div
								data-testid="terminal"
								className="space-y-2 rounded-md border border-blue-500/40 bg-blue-500/5 px-3 py-3"
							>
								<p className="text-sm">
									<span className="font-medium text-foreground">
										{labels.rootLabel}:{" "}
									</span>
									<code
										data-testid="root-cause"
										className="rounded bg-muted px-1.5 py-0.5 text-xs text-blue-700 dark:text-blue-400"
									>
										{result.tree.rootCause}
									</code>
								</p>
								<h3 className="text-sm font-semibold tracking-tight text-foreground">
									{labels.terminalHeading}
								</h3>
								<p className="text-sm text-muted-foreground">
									{labels.terminalNote}{" "}
									<code
										data-testid="terminal-mirror"
										className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground"
									>
										{result.tree.terminal.mirrorId}
									</code>
								</p>
								<p
									data-testid="red-wave"
									className="text-sm text-muted-foreground"
								>
									{labels.redWaveNote}
								</p>
							</div>

							{/* the content-addressed body made concrete */}
							<div className="space-y-1">
								<p className="text-xs font-medium text-muted-foreground">
									{labels.bodyLabel}
								</p>
								<pre
									data-testid="tree-body"
									className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-foreground"
								>
									{body}
								</pre>
							</div>
						</>
					)}
				</section>
			) : null}
		</div>
	);
}
