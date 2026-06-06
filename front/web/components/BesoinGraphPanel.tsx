"use client";

import { useState } from "react";
import { allLevels, type Level, outgoingRef } from "@/lib/besoin-grammar";
import {
	addNode,
	type BesoinGraph,
	canonicalize,
	hash,
	hasVersionOrMirrorKey,
	type LevelNode,
	NODE_STATUSES,
	type NodeStatus,
	newGraph,
	withOutgoingRef,
} from "@/lib/besoin-graph";

/**
 * BesoinGraphPanel — the action-capable /compound-besoin-graph panel (EL03). The human EXECUTES the
 * BesoinGraph record FROM THE SCREEN (ui-completeness, CLAUDE.md §7, no headless capability):
 *  - "Add node" runs addNode(graph, …) — building an ordered, append-only graph; a duplicate rung is
 *    REFUSED (overwrite is a ChangeSet, §9).
 *  - "Compute graph_hash" runs hash(graph) = records.Hash(Canonicalize(graph)).
 *  - "Re-sort (reverse order)" re-inserts the same nodes reversed and proves the hash is UNCHANGED
 *    (insertion-order independence — determinism).
 *  - "Compare projects" rebuilds the same nodes under a different project key and proves DISJOINT
 *    hashes (project isolation; S55 RLS enforces it below the line).
 *  - The "Double absence" panel runs hasVersionOrMirrorKey(graph) and proves the canonical body
 *    carries NO version/mirror key (the wall — a need is not a truth).
 *
 * Every verdict is COMPUTED by lib/besoin-graph.ts (the byte-for-byte twin of
 * back/runtime/besoin/graph.go), never an LLM and never re-implemented here. ABOVE the wall: EL03
 * fixes the record shape; it writes no kernel/mirrors/fitness. Themed (ADR 0010), bilingual (ADR
 * 0011) — labels passed in.
 */

interface Labels {
	projectLabel: string;
	levelLabel: string;
	statusLabel: string;
	intentLabel: string;
	addNodeCta: string;
	hashCta: string;
	reorderCta: string;
	compareCta: string;
	clearCta: string;
	nodesHeading: string;
	hashHeading: string;
	reorderHeading: string;
	compareHeading: string;
	absenceHeading: string;
	colLevel: string;
	colStatus: string;
	colRefs: string;
	empty: string;
	pending: string;
	reorderSame: string;
	reorderDiff: string;
	compareDisjoint: string;
	compareCollide: string;
	absenceOk: string;
	absenceFail: string;
	dupRefused: string;
}

function buildFrom(project: string, nodes: LevelNode[]): BesoinGraph {
	let g = newGraph(project);
	for (const n of nodes) {
		const r = addNode(g, n);
		if (r.ok) g = r.graph;
	}
	return g;
}

export function BesoinGraphPanel({ labels }: { labels: Labels }) {
	const [project, setProject] = useState("checkout");
	const [level, setLevel] = useState<Level>("product");
	const [status, setStatus] = useState<NodeStatus>("resolved");
	const [intent, setIntent] = useState("");
	const [nodes, setNodes] = useState<LevelNode[]>([]);
	const [dupError, setDupError] = useState(false);
	const [graphHash, setGraphHash] = useState<string | null>(null);
	const [reorder, setReorder] = useState<boolean | null>(null);
	const [compare, setCompare] = useState<boolean | null>(null);

	const graph = buildFrom(project, nodes);

	function runAddNode() {
		const n = withOutgoingRef({
			level,
			body: { intent: intent.trim() },
			provenance: { source: "human", detail: intent.trim() },
			status,
		});
		const r = addNode(buildFrom(project, nodes), n);
		if (!r.ok) {
			setDupError(true);
			return;
		}
		setDupError(false);
		setNodes([...nodes, n]);
		// Any change invalidates prior verdicts.
		setGraphHash(null);
		setReorder(null);
		setCompare(null);
	}

	function runHash() {
		setGraphHash(hash(buildFrom(project, nodes)));
	}

	function runReorder() {
		const forward = hash(buildFrom(project, nodes));
		const reversed = hash(buildFrom(project, [...nodes].reverse()));
		setReorder(forward === reversed);
		setGraphHash(forward);
	}

	function runCompare() {
		const here = hash(buildFrom(project, nodes));
		const other = hash(buildFrom(`${project}-other`, nodes));
		setCompare(here !== other);
	}

	function runClear() {
		setNodes([]);
		setDupError(false);
		setGraphHash(null);
		setReorder(null);
		setCompare(null);
	}

	const noVersionMirror = !hasVersionOrMirrorKey(graph);

	return (
		<div className="space-y-8" data-testid="besoin-graph-panel">
			{/* Builder form */}
			<div className="space-y-4">
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
						{labels.projectLabel}
						<input
							type="text"
							value={project}
							onChange={(e) => setProject(e.target.value)}
							data-testid="project-input"
							className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						/>
					</label>
					<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
						{labels.levelLabel}
						<select
							value={level}
							onChange={(e) => setLevel(e.target.value as Level)}
							data-testid="level-select"
							className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						>
							{allLevels().map((l) => (
								<option key={l} value={l}>
									{l}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
						{labels.statusLabel}
						<select
							value={status}
							onChange={(e) => setStatus(e.target.value as NodeStatus)}
							data-testid="status-select"
							className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						>
							{NODE_STATUSES.map((s) => (
								<option key={s} value={s}>
									{s}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
						{labels.intentLabel}
						<input
							type="text"
							value={intent}
							onChange={(e) => setIntent(e.target.value)}
							data-testid="intent-input"
							className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						/>
					</label>
				</div>

				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={runAddNode}
						data-testid="add-node"
						className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						{labels.addNodeCta}
					</button>
					<button
						type="button"
						onClick={runHash}
						data-testid="compute-hash"
						className="inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						{labels.hashCta}
					</button>
					<button
						type="button"
						onClick={runReorder}
						data-testid="reorder"
						className="inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						{labels.reorderCta}
					</button>
					<button
						type="button"
						onClick={runCompare}
						data-testid="compare"
						className="inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						{labels.compareCta}
					</button>
					<button
						type="button"
						onClick={runClear}
						data-testid="clear"
						className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						{labels.clearCta}
					</button>
				</div>

				{dupError && (
					<p
						data-testid="dup-refused"
						className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive"
					>
						{labels.dupRefused}
					</p>
				)}
			</div>

			{/* Nodes table */}
			<section className="space-y-2">
				<h3 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.nodesHeading}
				</h3>
				{graph.nodes.length === 0 ? (
					<p
						className="text-sm text-muted-foreground"
						data-testid="nodes-empty"
					>
						{labels.empty}
					</p>
				) : (
					<div className="overflow-hidden rounded-xl border border-border">
						<table className="w-full text-left text-sm">
							<thead className="bg-muted/60 text-xs text-muted-foreground uppercase">
								<tr>
									<th className="px-3 py-2 font-medium">{labels.colLevel}</th>
									<th className="px-3 py-2 font-medium">{labels.colStatus}</th>
									<th className="px-3 py-2 font-medium">{labels.colRefs}</th>
								</tr>
							</thead>
							<tbody>
								{graph.nodes.map((n) => {
									const ref = outgoingRef(n.level);
									return (
										<tr
											key={n.level}
											data-testid={`node-${n.level}`}
											className="border-t border-border"
										>
											<td className="px-3 py-2 font-mono text-foreground">
												{n.level}
											</td>
											<td className="px-3 py-2 font-mono text-muted-foreground">
												{n.status}
											</td>
											<td className="px-3 py-2 font-mono text-xs text-muted-foreground">
												{ref ? `${ref.refField} → ${ref.refTo}` : "—"}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{/* graph_hash */}
			<section className="space-y-2 border-t border-border pt-6">
				<h3 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.hashHeading}
				</h3>
				{graphHash === null ? (
					<p
						className="text-sm text-muted-foreground"
						data-testid="hash-pending"
					>
						{labels.pending}
					</p>
				) : (
					<code
						data-testid="graph-hash"
						className="block break-all rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground"
					>
						{graphHash}
					</code>
				)}
			</section>

			{/* order-independence */}
			<section className="space-y-2 border-t border-border pt-6">
				<h3 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.reorderHeading}
				</h3>
				{reorder !== null && (
					<p
						data-testid="reorder-result"
						className={
							reorder
								? "inline-flex items-center rounded-md border border-green-600/40 bg-green-600/10 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-400"
								: "inline-flex items-center rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive"
						}
					>
						{reorder ? labels.reorderSame : labels.reorderDiff}
					</p>
				)}
			</section>

			{/* project disjointness */}
			<section className="space-y-2 border-t border-border pt-6">
				<h3 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.compareHeading}
				</h3>
				{compare !== null && (
					<p
						data-testid="compare-result"
						className={
							compare
								? "inline-flex items-center rounded-md border border-green-600/40 bg-green-600/10 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-400"
								: "inline-flex items-center rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive"
						}
					>
						{compare ? labels.compareDisjoint : labels.compareCollide}
					</p>
				)}
			</section>

			{/* double absence (the wall) */}
			<section className="space-y-2 border-t border-border pt-6">
				<h3 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.absenceHeading}
				</h3>
				<p
					data-testid="absence-result"
					className={
						noVersionMirror
							? "inline-flex items-center rounded-md border border-green-600/40 bg-green-600/10 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-400"
							: "inline-flex items-center rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive"
					}
				>
					{noVersionMirror ? labels.absenceOk : labels.absenceFail}
				</p>
				<pre
					data-testid="canonical-body"
					className="max-h-48 overflow-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground"
				>
					{canonicalize(graph)}
				</pre>
			</section>
		</div>
	);
}
