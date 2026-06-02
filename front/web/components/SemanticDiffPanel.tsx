"use client";

import { useState } from "react";
import { type ChangeType, classify } from "@/lib/semantic-diff";
import { EXAMPLES } from "@/lib/semantic-diff-data";

/**
 * SemanticDiffPanel — the action-capable /semantic-diff panel (S21). It lets the human PICK one of
 * the three canonical §44.1 pairs (checkout-button / refund-policy / help-link) and RUN the
 * classification (the "classify a proposed change" action, executable from the screen — not a static
 * display): it calls the same pure `classify` the Go `aidos diff` emits and renders the SemanticDiff
 * in HUMAN LANGUAGE (KRD §44.1: not a YAML patch) — a change_type badge, the plain sentence, and the
 * REFERENCED blast_radius / requires_authority / red_wave (S15/S16/S17, not recomputed).
 *
 * THE DONE CRITERIA, visible & executable: classifying checkout-button shows OVERRIDE, refund-policy
 * shows RESCOPE (not override), help-link shows REWEIGHT.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): the action is the classification (a read); a
 * real apply goes through the ChangeSet path (propose → approval), never a write from this screen.
 * The classification is RENDERED, never re-implemented in the front-end. Themed on ADR 0010 tokens;
 * bilingual via next-intl (ADR 0011) — strings are passed in as labels.
 */

interface Labels {
	pickLabel: string;
	classifyLabel: string;
	changeTypeLabel: string;
	readingLabel: string;
	blastRadiusLabel: string;
	requiresAuthorityLabel: string;
	redWaveLabel: string;
	oldLabel: string;
	newLabel: string;
	idLabel: string;
	awaiting: string;
	sentences: Record<"override" | "rescope" | "reweight", string>;
	changeTypeNames: Record<ChangeType, string>;
}

const badgeClass: Record<ChangeType, string> = {
	override: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
	rescope: "border-blue-600/40 bg-blue-600/10 text-blue-600 dark:text-blue-400",
	reweight:
		"border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
	add: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	refine:
		"border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	deprecate:
		"border-zinc-500/40 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
	unclassifiable:
		"border-amber-600/40 bg-amber-600/10 text-amber-700 dark:text-amber-400",
	none: "border-border bg-muted text-muted-foreground",
};

export function SemanticDiffPanel({ labels }: { labels: Labels }) {
	const [selectedId, setSelectedId] = useState<string>("");

	const example = EXAMPLES.find((e) => e.id === selectedId) ?? null;
	const diff = example ? classify(example.old, example.next) : null;

	return (
		<div className="space-y-6" data-testid="semantic-diff-panel">
			{/* The action: pick a proposed change pair, then classify it */}
			<div className="flex flex-wrap items-end gap-3">
				<label className="flex flex-col gap-1 text-sm">
					<span className="font-medium text-foreground">
						{labels.pickLabel}
					</span>
					<select
						aria-label={labels.pickLabel}
						data-testid="example-select"
						value={selectedId}
						onChange={(e) => setSelectedId(e.target.value)}
						className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground"
					>
						<option value="">—</option>
						{EXAMPLES.map((e) => (
							<option key={e.id} value={e.id}>
								{e.id}
							</option>
						))}
					</select>
				</label>
				{EXAMPLES.map((e) => (
					<button
						key={e.id}
						type="button"
						data-testid={`classify-${e.id}`}
						onClick={() => setSelectedId(e.id)}
						className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						{labels.classifyLabel} {e.id}
					</button>
				))}
			</div>

			{!diff || !example ? (
				<p data-testid="awaiting" className="text-sm text-muted-foreground">
					{labels.awaiting}
				</p>
			) : (
				<article
					data-testid="diff-result"
					data-change-type={diff.changeType}
					className="space-y-4 rounded-xl border border-border bg-card p-5"
				>
					<header className="flex flex-wrap items-center gap-3">
						<span className="text-sm font-medium text-muted-foreground">
							{labels.idLabel}:{" "}
							<code className="font-mono text-foreground">{example.id}</code>{" "}
							<code className="font-mono text-foreground">
								@{diff.oldVersion} → @{diff.newVersion}
							</code>
						</span>
						<span
							data-testid="change-type-badge"
							className={`inline-flex items-center rounded-full border px-3 py-0.5 text-sm font-semibold ${badgeClass[diff.changeType]}`}
						>
							{labels.changeTypeNames[diff.changeType]}
						</span>
					</header>

					<p
						data-testid="reading"
						className="text-sm leading-relaxed text-foreground"
					>
						<span className="font-medium text-muted-foreground">
							{labels.readingLabel}:{" "}
						</span>
						{labels.sentences[example.sentenceKey]}
					</p>

					<dl className="grid gap-2 text-sm sm:grid-cols-2">
						<div>
							<dt className="font-medium text-muted-foreground">
								{labels.blastRadiusLabel}
							</dt>
							<dd className="text-foreground">{example.blastRadius}</dd>
						</div>
						<div>
							<dt className="font-medium text-muted-foreground">
								{labels.requiresAuthorityLabel}
							</dt>
							<dd className="text-foreground">{example.requiresAuthority}</dd>
						</div>
						<div className="sm:col-span-2">
							<dt className="font-medium text-muted-foreground">
								{labels.redWaveLabel}
							</dt>
							<dd className="text-foreground">{example.redWave}</dd>
						</div>
					</dl>
				</article>
			)}
		</div>
	);
}
