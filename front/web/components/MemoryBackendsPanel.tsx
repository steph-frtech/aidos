"use client";

import { useMemo, useState } from "react";
import { type Backend, type Hit, KINDS, type Kind, recall } from "@/lib/memory";
import { EXAMPLE_QUERY, SEED_MEMORIES } from "@/lib/memory-data";

/**
 * MemoryBackendsPanel — the action-capable /memory-backends panel (S31). The human RUNS recall
 * FROM THE SCREEN, calling the SAME pure twin the Go engine computes
 * (back/archive/brain/memory.rankHits):
 *   - enter a RECALL QUERY ⇒ the ranked hits, ordered by score descending, nearest first;
 *   - filter by KIND (the four indexable memories) and/or BRANCH ⇒ the set narrows;
 *   - flip the BACKEND TOGGLE (mock ↔ real) ⇒ recall re-runs through the other Store, the same
 *     top hit returns (the injection seam, made observable — the backends are interchangeable).
 * Each hit shows score / kind / branch / taint / provenance — memory is FUEL WITH PROVENANCE,
 * never silent truth. A banner states "context fuel, never truth".
 *
 * The hits are RENDERED, never re-implemented: computed from lib/memory.ts (the twin), so the
 * screen matches the engine. READ-ONLY against truth (the wall): the /brain store is below the
 * waterline. Themed (ADR 0010), bilingual (ADR 0011) — labels passed in.
 */

interface Labels {
	queryLabel: string;
	queryPlaceholder: string;
	recallCta: string;
	allKinds: string;
	backendLabel: string;
	backendMock: string;
	backendReal: string;
	hitsHeading: string;
	scoreLabel: string;
	kindLabel: string;
	branchLabel: string;
	taintLabel: string;
	provenanceLabel: string;
	noTaint: string;
	noHits: string;
	banner: string;
	seamNote: string;
}

const KIND_LABEL_KEY: Record<Kind, string> = {
	episodic: "episodic",
	semantic: "semantic",
	procedural: "procedural",
	structural: "structural",
};

export function MemoryBackendsPanel({
	labels,
	kindLabels,
}: {
	labels: Labels;
	kindLabels: Record<Kind, string>;
}) {
	const [query, setQuery] = useState(EXAMPLE_QUERY);
	const [kindFilter, setKindFilter] = useState<Kind | "">("");
	const [backend, setBackend] = useState<Backend>("mock");

	const hits: Hit[] = useMemo(
		() =>
			recall(backend, SEED_MEMORIES, {
				queryText: query,
				kind: kindFilter || undefined,
				branch: "main",
				k: 5,
			}),
		[backend, query, kindFilter],
	);

	return (
		<div className="space-y-8">
			{/* Fuel-never-truth banner */}
			<p
				data-testid="fuel-banner"
				className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm leading-relaxed text-muted-foreground"
			>
				{labels.banner}
			</p>

			{/* Backend toggle — the injection seam */}
			<section className="space-y-2" aria-label={labels.backendLabel}>
				<div className="flex flex-wrap items-center gap-3">
					<span className="text-sm font-medium text-foreground">
						{labels.backendLabel}
					</span>
					<div className="inline-flex rounded-lg border border-border bg-card p-1">
						{(["mock", "real"] as Backend[]).map((b) => (
							<button
								key={b}
								type="button"
								data-testid={`backend-${b}`}
								aria-pressed={backend === b}
								onClick={() => setBackend(b)}
								className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
									backend === b
										? "bg-primary text-primary-foreground"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								{b === "mock" ? labels.backendMock : labels.backendReal}
							</button>
						))}
					</div>
				</div>
				<p className="text-xs text-muted-foreground">{labels.seamNote}</p>
			</section>

			{/* Kind filter chips — the four indexable memories */}
			<section className="space-y-2" aria-label={labels.kindLabel}>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						data-testid="kind-chip-all"
						aria-pressed={kindFilter === ""}
						onClick={() => setKindFilter("")}
						className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
							kindFilter === ""
								? "border-primary bg-primary text-primary-foreground"
								: "border-border bg-card text-muted-foreground hover:text-foreground"
						}`}
					>
						{labels.allKinds}
					</button>
					{KINDS.map((k) => (
						<button
							key={k}
							type="button"
							data-testid={`kind-chip-${k}`}
							aria-pressed={kindFilter === k}
							onClick={() => setKindFilter(kindFilter === k ? "" : k)}
							className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
								kindFilter === k
									? "border-primary bg-primary text-primary-foreground"
									: "border-border bg-card text-muted-foreground hover:text-foreground"
							}`}
						>
							{kindLabels[k]}
						</button>
					))}
				</div>
			</section>

			{/* Recall query */}
			<section className="space-y-2">
				<label
					htmlFor="recall-query"
					className="text-sm font-medium text-foreground"
				>
					{labels.queryLabel}
				</label>
				<div className="flex flex-wrap gap-2">
					<input
						id="recall-query"
						data-testid="recall-query"
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={labels.queryPlaceholder}
						className="min-w-64 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
					/>
					<button
						type="button"
						data-testid="recall-cta"
						className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
					>
						{labels.recallCta}
					</button>
				</div>
			</section>

			{/* Ranked hits */}
			<section className="space-y-3" aria-label={labels.hitsHeading}>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.hitsHeading}
				</h2>
				{hits.length === 0 ? (
					<p data-testid="no-hits" className="text-sm text-muted-foreground">
						{labels.noHits}
					</p>
				) : (
					<ol data-testid="hits-list" className="space-y-3">
						{hits.map((h, i) => (
							<li
								key={h.item.id}
								data-testid="hit-row"
								data-kind={h.item.kind}
								data-branch={h.item.branch}
								className="rounded-xl border border-border bg-card p-4"
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<span className="text-sm font-medium text-foreground">
										#{i + 1} · {h.item.content}
									</span>
									<span
										data-testid="hit-score"
										className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums"
									>
										{labels.scoreLabel}: {h.score.toFixed(3)}
									</span>
								</div>
								<dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
									<div>
										<dt className="font-medium text-foreground/70">
											{labels.kindLabel}
										</dt>
										<dd data-testid="hit-kind">{kindLabels[h.item.kind]}</dd>
									</div>
									<div>
										<dt className="font-medium text-foreground/70">
											{labels.branchLabel}
										</dt>
										<dd data-testid="hit-branch">{h.item.branch}</dd>
									</div>
									<div>
										<dt className="font-medium text-foreground/70">
											{labels.provenanceLabel}
										</dt>
										<dd data-testid="hit-provenance">
											{h.item.provenance || "—"}
										</dd>
									</div>
									<div>
										<dt className="font-medium text-foreground/70">
											{labels.taintLabel}
										</dt>
										<dd data-testid="hit-taint">
											{h.item.taint.length > 0
												? h.item.taint.join(", ")
												: labels.noTaint}
										</dd>
									</div>
								</dl>
							</li>
						))}
					</ol>
				)}
			</section>
		</div>
	);
}

export { KIND_LABEL_KEY };
