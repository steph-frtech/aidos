"use client";

import { useState } from "react";
import { type MergeStatus, mergeSemantic } from "@/lib/semantic-merge";
import { EXAMPLES } from "@/lib/semantic-merge-data";

/**
 * SemanticMergePanel — the action-capable /semantic-merge panel (S25). It lets the human PICK one of
 * the three canonical §122 triples (refund / cart / view) and RUN the semantic merge (the "merge two
 * branches semantically" action, executable from the screen — not a static display): it calls the
 * same pure `mergeSemantic` the Go MergeSemantic / the /merge-semantic gesture emit and renders the
 * verdict as a MIRROR DECISION, not a line diff (KRD §122) — a status badge (clean / conflict), and
 * on conflict the conflicting_mirrors[] list, a plain-language sentence ("git would merge these
 * cleanly, but the merged cut reddens the refund invariant — override decision; required authority:
 * …"), the referenced merged_cut@hash and requires_authority.
 *
 * THE DONE CRITERIA, visible & executable: the no-overlap refund EU/US pair renders CONFLICT (clean
 * text, red mirror, BLOCKED), the disjoint-lines cart pair renders CONFLICT, the free-space promo-
 * banner / help-link pair renders CLEAN.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): the action is the merge DECISION (a read); a
 * clean merge is recorded only via the S20 ChangeSet path (propose → approval), never a write from
 * this screen. The verdict is RENDERED, never re-implemented in the front-end. Themed on ADR 0010
 * tokens; bilingual via next-intl (ADR 0011) — strings are passed in as labels.
 */

interface Labels {
	pickLabel: string;
	mergeLabel: string;
	statusLabel: string;
	conflictingLabel: string;
	mergedCutLabel: string;
	requiresAuthorityLabel: string;
	awaiting: string;
	overrideAuthority: string;
	statusNames: Record<MergeStatus, string>;
	titles: Record<"refund" | "cart" | "view", string>;
	sentences: Record<MergeStatus, string>;
	conflictMirrorPrefix: string;
}

const badgeClass: Record<MergeStatus, string> = {
	clean:
		"border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	conflict: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
	unresolvable:
		"border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export function SemanticMergePanel({ labels }: { labels: Labels }) {
	const [selectedId, setSelectedId] = useState<string>("");

	const example = EXAMPLES.find((e) => e.id === selectedId) ?? null;
	const result = example
		? mergeSemantic(example.base, example.left, example.right)
		: null;

	return (
		<div className="space-y-6" data-testid="semantic-merge-panel">
			{/* The action: pick a base+left/right triple, then merge it semantically */}
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
						data-testid={`merge-${e.id}`}
						onClick={() => setSelectedId(e.id)}
						className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						{labels.mergeLabel} {labels.titles[e.titleKey]}
					</button>
				))}
			</div>

			{!result || !example ? (
				<p data-testid="awaiting" className="text-sm text-muted-foreground">
					{labels.awaiting}
				</p>
			) : (
				<article
					data-testid="merge-result"
					data-status={result.status}
					className="space-y-4 rounded-xl border border-border bg-card p-5"
				>
					<header className="flex flex-wrap items-center gap-3">
						<span className="text-sm font-medium text-muted-foreground">
							{labels.titles[example.titleKey]}{" "}
							<code className="font-mono text-foreground">
								{example.base.id} ← {example.left.ancestor}/
								{example.right.ancestor}
							</code>
						</span>
						<span
							data-testid="status-badge"
							className={`inline-flex items-center rounded-full border px-3 py-0.5 text-sm font-semibold ${badgeClass[result.status]}`}
						>
							{labels.statusLabel}: {labels.statusNames[result.status]}
						</span>
					</header>

					<p
						data-testid="sentence"
						className="text-sm leading-relaxed text-foreground"
					>
						{labels.sentences[result.status]}
					</p>

					{result.conflictingMirrors.length > 0 && (
						<div data-testid="conflicting-mirrors">
							<p className="text-sm font-medium text-muted-foreground">
								{labels.conflictingLabel}
							</p>
							<ul className="mt-1 flex flex-wrap gap-2">
								{result.conflictingMirrors.map((m) => (
									<li
										key={m}
										data-testid={`conflicting-${m}`}
										className="inline-flex items-center rounded-md border border-red-500/40 bg-red-500/10 px-2 py-0.5 font-mono text-xs text-red-600 dark:text-red-400"
									>
										{labels.conflictMirrorPrefix}
										{m}
									</li>
								))}
							</ul>
						</div>
					)}

					<dl className="grid gap-2 text-sm sm:grid-cols-2">
						<div>
							<dt className="font-medium text-muted-foreground">
								{labels.mergedCutLabel}
							</dt>
							<dd
								className="font-mono text-foreground"
								data-testid="merged-cut-hash"
							>
								{result.mergedCutHash || "—"}
							</dd>
						</div>
						<div>
							<dt className="font-medium text-muted-foreground">
								{labels.requiresAuthorityLabel}
							</dt>
							<dd className="text-foreground" data-testid="requires-authority">
								{result.requiresAuthority ? labels.overrideAuthority : "—"}
							</dd>
						</div>
					</dl>
				</article>
			)}
		</div>
	);
}
