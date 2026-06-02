"use client";

import { useState } from "react";
import {
	type BlockReason,
	type ContextPackEntry,
	FLOW_STAGES,
	type IdeaCandidate,
	propose,
	toKernel,
	viaIdea,
} from "@/lib/firewall";
import { STALE_DISCOUNT_CLAIM } from "@/lib/firewall-data";

/**
 * MemoryFirewallPanel — the action-capable /memory-firewall panel (S30). The human RUNS the
 * firewall FROM THE SCREEN, calling the SAME pure twins the Go engine computes
 * (back/archive/brain/firewall):
 *   - CAPTURE a memory ⇒ a MemoryItem card (content/provenance/taint/confidence/scope/expiry)
 *     with the explicit "not truth — no mirror, no freeze" marker;
 *   - PROPOSE it into a ContextPack ⇒ an entry that carries the taint forward (allowed);
 *   - attempt TO-KERNEL ⇒ ALWAYS Blocked, the red MEMORY_CANNOT_DECLARE_TRUTH BlockReason with
 *     the full flow in how_to_fix, NO kernel write (the done criterion);
 *   - VIA-IDEA ⇒ the memory becomes a DRAFT idea (link to /ideas, S27), provenance back to the
 *     memory, with a "still no mirror" marker — still short of the kernel.
 *
 * The verdict is RENDERED, never re-implemented: computed from lib/firewall.ts (the twin), so
 * the screen matches the engine. READ-ONLY against truth (the wall). Themed (ADR 0010),
 * bilingual (ADR 0011) — labels passed in.
 */

interface Labels {
	captureCta: string;
	proposeCta: string;
	toKernelCta: string;
	viaIdeaCta: string;
	flowHeading: string;
	shortcutLabel: string;
	shortcutBlocked: string;
	memoryHeading: string;
	notTruthMarker: string;
	provenanceLabel: string;
	confidenceLabel: string;
	scopeLabel: string;
	expiresLabel: string;
	taintLabel: string;
	contextPackHeading: string;
	taintTravels: string;
	blockedHeading: string;
	noKernelWrite: string;
	howToFixLabel: string;
	viaIdeaHeading: string;
	draftIdeaLabel: string;
	stillNoMirror: string;
	provenanceBackLabel: string;
	ideasLink: string;
}

export function MemoryFirewallPanel({ labels }: { labels: Labels }) {
	const [captured, setCaptured] = useState(false);
	const [entry, setEntry] = useState<ContextPackEntry | null>(null);
	const [block, setBlock] = useState<BlockReason | null>(null);
	const [idea, setIdea] = useState<IdeaCandidate | null>(null);

	const m = STALE_DISCOUNT_CLAIM;

	return (
		<div className="space-y-10" data-testid="memory-firewall-panel">
			{/* The mandatory one-way flow as a left-to-right pipeline. */}
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
				{/* The forbidden direct Memory → Kernel shortcut — red and crossed out. */}
				<div
					data-testid="kernel-shortcut"
					className="flex flex-wrap items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm"
				>
					<span className="font-mono text-xs text-red-700 line-through dark:text-red-300">
						Memory → Kernel
					</span>
					<span className="inline-flex items-center rounded-md border border-red-500/50 bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">
						{labels.shortcutBlocked}
					</span>
					<span className="text-xs text-muted-foreground">
						{labels.shortcutLabel}
					</span>
				</div>
			</section>

			{/* Controls — capture, propose, to-kernel (blocked), via-idea. */}
			<section className="flex flex-wrap gap-3">
				<button
					type="button"
					data-testid="capture-memory"
					onClick={() => setCaptured(true)}
					className="inline-flex items-center rounded-md border border-blue-600/40 bg-blue-600/10 px-3 py-1.5 text-sm font-medium text-blue-700 transition hover:bg-blue-600/20 dark:text-blue-300"
				>
					{labels.captureCta}
				</button>
				<button
					type="button"
					data-testid="propose-to-contextpack"
					disabled={!captured}
					onClick={() => setEntry(propose(m, "order-discount"))}
					className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
				>
					{labels.proposeCta}
				</button>
				<button
					type="button"
					data-testid="to-kernel"
					disabled={!captured}
					onClick={() => setBlock(toKernel(m))}
					className="inline-flex items-center rounded-md border border-red-600/40 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-500/20 disabled:opacity-50 dark:text-red-300"
				>
					{labels.toKernelCta}
				</button>
				<button
					type="button"
					data-testid="via-idea"
					disabled={!captured}
					onClick={() => setIdea(viaIdea(m))}
					className="inline-flex items-center rounded-md border border-emerald-600/40 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-300"
				>
					{labels.viaIdeaCta}
				</button>
			</section>

			{/* The MemoryItem card — context fuel, NOT truth. */}
			{captured ? (
				<section
					data-testid="memory-card"
					className="space-y-3 rounded-xl border border-border bg-card px-4 py-3 text-sm"
				>
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{labels.memoryHeading}
						</h2>
						<span
							data-testid="not-truth-marker"
							className="inline-flex items-center rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
						>
							{labels.notTruthMarker}
						</span>
					</div>
					<p className="text-foreground" data-testid="memory-content">
						{m.content}
					</p>
					<dl className="grid gap-2 sm:grid-cols-2">
						<div>
							<dt className="text-xs text-muted-foreground">
								{labels.provenanceLabel}
							</dt>
							<dd
								data-testid="memory-provenance"
								className="font-mono text-xs text-foreground"
							>
								{m.provenance}
							</dd>
						</div>
						<div>
							<dt className="text-xs text-muted-foreground">
								{labels.confidenceLabel}
							</dt>
							<dd className="font-mono text-xs text-foreground">
								{m.confidence}
							</dd>
						</div>
						<div>
							<dt className="text-xs text-muted-foreground">
								{labels.scopeLabel}
							</dt>
							<dd className="font-mono text-xs text-foreground">
								{m.validityScope}
							</dd>
						</div>
						<div>
							<dt className="text-xs text-muted-foreground">
								{labels.expiresLabel}
							</dt>
							<dd className="font-mono text-xs text-foreground">
								{m.expiresAt}
							</dd>
						</div>
					</dl>
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-xs text-muted-foreground">
							{labels.taintLabel}:
						</span>
						<ul className="flex flex-wrap gap-1.5" data-testid="memory-taint">
							{m.taint.map((t) => (
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
				</section>
			) : null}

			{/* The ContextPack entry — the allowed read-side edge; taint travels. */}
			{entry ? (
				<section
					data-testid="contextpack-entry"
					className="space-y-2 rounded-xl border border-emerald-500/40 bg-emerald-500/5 px-4 py-3 text-sm"
				>
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{labels.contextPackHeading}
					</h2>
					<p className="text-xs text-muted-foreground">{labels.taintTravels}</p>
					<ul className="flex flex-wrap gap-1.5" data-testid="entry-taint">
						{entry.taint.map((t) => (
							<li
								key={t}
								data-taint={t}
								className="inline-flex items-center rounded-md border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-300"
							>
								{t}
							</li>
						))}
					</ul>
				</section>
			) : null}

			{/* THE done case — the direct Memory → Kernel edge, Blocked and red. */}
			{block ? (
				<section
					data-testid="block-reason"
					data-code={block.code}
					className="space-y-3 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm"
				>
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="text-sm font-semibold tracking-tight text-red-700 dark:text-red-300">
							{labels.blockedHeading}
						</h2>
						<code
							data-testid="block-code"
							className="rounded bg-red-500/20 px-1.5 py-0.5 font-mono text-xs text-red-700 dark:text-red-300"
						>
							{block.code}
						</code>
						<span
							data-testid="no-kernel-write"
							className="inline-flex items-center rounded-md border border-red-500/50 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300"
						>
							{labels.noKernelWrite}
						</span>
					</div>
					<p className="text-foreground">{block.explanation}</p>
					<div>
						<p className="text-xs font-medium text-muted-foreground">
							{labels.howToFixLabel}
						</p>
						<ol
							className="mt-1 list-decimal space-y-1 pl-5 text-xs text-foreground"
							data-testid="how-to-fix"
						>
							{block.howToFix.map((f) => (
								<li key={f}>{f}</li>
							))}
						</ol>
					</div>
				</section>
			) : null}

			{/* The ONLY legal door — the memory becomes a DRAFT idea (S27), still short of the kernel. */}
			{idea ? (
				<section
					data-testid="via-idea-result"
					className="space-y-2 rounded-xl border border-blue-500/40 bg-blue-500/5 px-4 py-3 text-sm"
				>
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{labels.viaIdeaHeading}
						</h2>
						<span className="inline-flex items-center rounded-md border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
							{labels.draftIdeaLabel}
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
							{labels.provenanceBackLabel}:{" "}
						</span>
						<code data-testid="idea-provenance" className="font-mono text-xs">
							{idea.provenance}
						</code>
					</p>
					<a
						href="/ideas"
						data-testid="ideas-link"
						className="inline-flex items-center text-xs font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
					>
						{labels.ideasLink} →
					</a>
				</section>
			) : null}
		</div>
	);
}
