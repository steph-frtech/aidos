"use client";

import { useState } from "react";
import {
	type BlockReason,
	FLOW_STAGES,
	type IdeaCandidate,
	type Incident,
	learn,
	toKernel,
} from "@/lib/reality";
import { SEED_INCIDENTS } from "@/lib/reality-data";

/**
 * IncidentsToIdeasPanel — the action-capable /incidents-to-ideas panel (S43). The human RUNS the
 * external loop FROM THE SCREEN, calling the SAME pure twins the Go engine computes
 * (back/runtime/reality):
 *   - each observed incident is a card (signal/cause_sketch/provenance/taint) with the explicit
 *     "reality, not a truth — no mirror, no freeze" marker;
 *   - /LEARN ⇒ the incident becomes a DRAFT idea (provenance incident:#NNNN carried), the
 *     incident:#NNNN → draft idea arrow, the idea shown as draft with no mirror yet; when the
 *     signal does not pin a proposes kind, an OpenQuestion marker (never a guessed kind);
 *   - attempt TO-KERNEL ⇒ ALWAYS Blocked, the red REALITY_CANNOT_DECLARE_TRUTH BlockReason with
 *     the full flow in how_to_fix, NO kernel write (the done criterion), the kernel UNCHANGED.
 *
 * The verdict is RENDERED, never re-implemented: computed from lib/reality.ts (the twin), so the
 * screen matches the engine. READ-ONLY against truth (the wall). Themed (ADR 0010), bilingual
 * (ADR 0011) — labels passed in.
 */

interface Labels {
	flowHeading: string;
	shortcutLabel: string;
	shortcutBlocked: string;
	incidentsHeading: string;
	notTruthMarker: string;
	signalLabel: string;
	operationLabel: string;
	errorLabel: string;
	recurrenceLabel: string;
	causeSketchLabel: string;
	provenanceLabel: string;
	taintLabel: string;
	learnCta: string;
	toKernelCta: string;
	learnedHeading: string;
	draftIdeaLabel: string;
	stillNoMirror: string;
	intentLabel: string;
	proposesLabel: string;
	openQuestionLabel: string;
	ideasLink: string;
	blockedHeading: string;
	noKernelWrite: string;
	kernelUnchanged: string;
	howToFixLabel: string;
}

interface RowState {
	idea: IdeaCandidate | null;
	block: BlockReason | null;
}

export function IncidentsToIdeasPanel({ labels }: { labels: Labels }) {
	const [state, setState] = useState<Record<string, RowState>>({});

	const runLearn = (inc: Incident) =>
		setState((s) => ({
			...s,
			[inc.id]: { idea: learn(inc), block: s[inc.id]?.block ?? null },
		}));
	const runToKernel = (inc: Incident) =>
		setState((s) => ({
			...s,
			[inc.id]: { idea: s[inc.id]?.idea ?? null, block: toKernel(inc) },
		}));

	return (
		<div className="space-y-10" data-testid="incidents-to-ideas-panel">
			{/* The external loop as a left-to-right pipeline. */}
			<section className="space-y-3">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.flowHeading}
				</h2>
				<ol
					data-testid="flow-pipeline"
					className="flex flex-wrap items-center gap-2"
				>
					{FLOW_STAGES.map((stage, i) => (
						<li key={stage} className="flex items-center gap-2">
							<span
								data-testid="flow-stage"
								data-stage={stage}
								className="inline-flex items-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
							>
								{stage}
							</span>
							{i < FLOW_STAGES.length - 1 ? (
								<span aria-hidden className="text-muted-foreground">
									→
								</span>
							) : null}
						</li>
					))}
				</ol>
				{/* The forbidden direct Incident → Kernel shortcut — red and crossed out. */}
				<div
					data-testid="kernel-shortcut"
					className="flex flex-wrap items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm"
				>
					<span className="font-mono text-xs text-red-700 line-through dark:text-red-300">
						Incident → Kernel
					</span>
					<span className="inline-flex items-center rounded-md border border-red-500/50 bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">
						{labels.shortcutBlocked}
					</span>
					<span className="text-xs text-muted-foreground">
						{labels.shortcutLabel}
					</span>
				</div>
			</section>

			{/* One card per observed incident. */}
			<section className="space-y-6">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.incidentsHeading}
				</h2>
				{SEED_INCIDENTS.map((inc) => {
					const row = state[inc.id];
					return (
						<article
							key={inc.id}
							data-testid="incident-card"
							data-incident={inc.ref}
							className="space-y-4 rounded-xl border border-border bg-card px-4 py-4 text-sm"
						>
							<div className="flex flex-wrap items-center gap-2">
								<code
									data-testid="incident-ref"
									className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
								>
									incident:{inc.ref}
								</code>
								<span
									data-testid="not-truth-marker"
									className="inline-flex items-center rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
								>
									{labels.notTruthMarker}
								</span>
							</div>

							{/* The signal. */}
							<dl
								className="grid gap-2 sm:grid-cols-3"
								data-testid="incident-signal"
							>
								<div>
									<dt className="text-xs text-muted-foreground">
										{labels.operationLabel}
									</dt>
									<dd
										data-testid="incident-operation"
										className="font-mono text-xs text-foreground"
									>
										{inc.signal.operation || "—"}
									</dd>
								</div>
								<div>
									<dt className="text-xs text-muted-foreground">
										{labels.errorLabel}
									</dt>
									<dd
										data-testid="incident-error"
										className="font-mono text-xs text-foreground"
									>
										{inc.signal.error}
									</dd>
								</div>
								<div>
									<dt className="text-xs text-muted-foreground">
										{labels.recurrenceLabel}
									</dt>
									<dd className="font-mono text-xs text-foreground">
										{inc.signal.recurrence}
									</dd>
								</div>
							</dl>

							{/* The cause SKETCH (a hypothesis, never a truth). */}
							<div>
								<p className="text-xs text-muted-foreground">
									{labels.causeSketchLabel}
								</p>
								<p
									data-testid="incident-cause-sketch"
									className="text-foreground"
								>
									{inc.causeSketch}
								</p>
							</div>

							<div className="flex flex-wrap items-center gap-2">
								<span className="text-xs text-muted-foreground">
									{labels.taintLabel}:
								</span>
								<ul
									className="flex flex-wrap gap-1.5"
									data-testid="incident-taint"
								>
									{inc.taint.map((t) => (
										<li
											key={t}
											data-taint={t}
											className="inline-flex items-center rounded-md border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-300"
										>
											{t}
										</li>
									))}
								</ul>
							</div>

							{/* Controls — /learn, to-kernel (blocked). */}
							<div className="flex flex-wrap gap-3">
								<button
									type="button"
									data-testid="learn"
									onClick={() => runLearn(inc)}
									className="inline-flex items-center rounded-md border border-blue-600/40 bg-blue-600/10 px-3 py-1.5 text-sm font-medium text-blue-700 transition hover:bg-blue-600/20 dark:text-blue-300"
								>
									{labels.learnCta}
								</button>
								<button
									type="button"
									data-testid="to-kernel"
									onClick={() => runToKernel(inc)}
									className="inline-flex items-center rounded-md border border-red-600/40 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-500/20 dark:text-red-300"
								>
									{labels.toKernelCta}
								</button>
							</div>

							{/* THE done case (a) — /learn → a DRAFT idea, the incident:#NNNN → draft idea arrow. */}
							{row?.idea ? (
								<section
									data-testid="learned-idea"
									className="space-y-2 rounded-lg border border-blue-500/40 bg-blue-500/5 px-3 py-3"
								>
									<div className="flex flex-wrap items-center gap-2">
										<span
											data-testid="learn-arrow"
											className="font-mono text-xs text-foreground"
										>
											incident:{inc.ref} → {labels.draftIdeaLabel}
										</span>
										<span
											data-testid="still-no-mirror"
											className="inline-flex items-center rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
										>
											{labels.stillNoMirror}
										</span>
									</div>
									<p className="text-foreground">
										<span className="text-muted-foreground">
											{labels.provenanceLabel}:{" "}
										</span>
										<code
											data-testid="idea-provenance"
											className="font-mono text-xs"
										>
											incident:{row.idea.provenanceDetail}
										</code>
									</p>
									<p className="text-foreground">
										<span className="text-muted-foreground">
											{labels.intentLabel}:{" "}
										</span>
										<span data-testid="idea-intent">{row.idea.intent}</span>
									</p>
									{/* proposes: pinned kind, OR an OpenQuestion marker (never a guess). */}
									{row.idea.proposesPinned ? (
										<p className="text-foreground">
											<span className="text-muted-foreground">
												{labels.proposesLabel}:{" "}
											</span>
											<code
												data-testid="idea-proposes"
												className="font-mono text-xs"
											>
												{row.idea.proposes}
											</code>
										</p>
									) : (
										<p
											data-testid="open-question"
											className="rounded-md border border-purple-500/40 bg-purple-500/10 px-2 py-1 text-xs text-purple-700 dark:text-purple-300"
										>
											<span className="font-semibold">
												{labels.openQuestionLabel}:{" "}
											</span>
											{row.idea.openQuestion}
										</p>
									)}
									<a
										href="/ideas"
										data-testid="ideas-link"
										className="inline-flex items-center text-xs font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
									>
										{labels.ideasLink} →
									</a>
								</section>
							) : null}

							{/* THE done case (b) — the direct Incident → Kernel edge, Blocked and red. */}
							{row?.block ? (
								<section
									data-testid="block-reason"
									data-code={row.block.code}
									className="space-y-3 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-3"
								>
									<div className="flex flex-wrap items-center gap-2">
										<h3 className="text-sm font-semibold tracking-tight text-red-700 dark:text-red-300">
											{labels.blockedHeading}
										</h3>
										<code
											data-testid="block-code"
											className="rounded bg-red-500/20 px-1.5 py-0.5 font-mono text-xs text-red-700 dark:text-red-300"
										>
											{row.block.code}
										</code>
										<span
											data-testid="no-kernel-write"
											className="inline-flex items-center rounded-md border border-red-500/50 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300"
										>
											{labels.noKernelWrite}
										</span>
										<span
											data-testid="kernel-unchanged"
											className="inline-flex items-center rounded-md border border-border bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground"
										>
											{labels.kernelUnchanged}
										</span>
									</div>
									<p className="text-foreground">{row.block.explanation}</p>
									<div>
										<p className="text-xs font-medium text-muted-foreground">
											{labels.howToFixLabel}
										</p>
										<ol
											className="mt-1 list-decimal space-y-1 pl-5 text-xs text-foreground"
											data-testid="how-to-fix"
										>
											{row.block.howToFix.map((f) => (
												<li key={f}>{f}</li>
											))}
										</ol>
									</div>
								</section>
							) : null}
						</article>
					);
				})}
			</section>
		</div>
	);
}
