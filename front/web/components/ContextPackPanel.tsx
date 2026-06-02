"use client";

import { useState } from "react";
import { compile, type ExclusionReason } from "@/lib/context-pack";
import {
	BRANCHES,
	type Branch,
	CHECKOUT_GOAL,
	CHECKOUT_GRAPH,
} from "@/lib/context-pack-data";

/**
 * ContextPackPanel — the action-capable /context-pack panel (S33). The human RUNS the
 * ContextRouter FROM THE SCREEN, calling the SAME pure twin the Go engine computes
 * (back/runtime/context.Compile): pick the branch, click COMPILER, and the compiled ContextPack
 * appears — an Included panel (affected layers, active kernel mirrors/contracts, scoped memory
 * lessons + recent incidents, skills/tools, the stop condition, the pack hash), an Excluded panel
 * where each item is tagged with WHY (cross-BC / stale / out-of-scope / cosmetic-below-threshold),
 * and a Boundaries strip showing allowed_paths + the forbidden /kernel/** /mirror/** (the wall).
 *
 * The pack is COMPUTED by lib/context-pack.ts (the deterministic twin), never an LLM and never a
 * RAG and never re-implemented here — the ContextRouter is an ALGORITHM (KRD §144). READ-ONLY
 * against truth (the wall): the router reads the ContextGraph view; the pack always forbids
 * /kernel/** /mirror/**; truth-writes go via propose → ChangeSet → approval, never this screen.
 * Themed (ADR 0010), bilingual (ADR 0011) — labels passed in.
 */

interface Labels {
	compileCta: string;
	branchLabel: string;
	goalLabel: string;
	includedHeading: string;
	excludedHeading: string;
	boundariesHeading: string;
	affectedLayers: string;
	activeMirrors: string;
	activeContracts: string;
	memoryLessons: string;
	memoryIncidents: string;
	skillsTools: string;
	stopCondition: string;
	packHash: string;
	allowedPaths: string;
	forbiddenPaths: string;
	pending: string;
	reason: Record<ExclusionReason, string>;
}

function reasonClasses(r: ExclusionReason): string {
	if (r === "stale" || r === "out-of-scope")
		return "border-red-500/50 bg-red-500/15 text-red-700 dark:text-red-300";
	if (r === "cross-BC")
		return "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300";
	return "border-border bg-muted text-muted-foreground";
}

function Chips({ items, testid }: { items: string[]; testid: string }) {
	return (
		<ul className="flex flex-wrap gap-2" data-testid={testid}>
			{items.map((x) => (
				<li
					key={x}
					data-testid={`${testid}-item`}
					data-id={x}
					className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs text-foreground/80"
				>
					{x}
				</li>
			))}
		</ul>
	);
}

export function ContextPackPanel({ labels }: { labels: Labels }) {
	const [branch, setBranch] = useState<Branch>("main");
	const [pack, setPack] = useState<ReturnType<typeof compile> | null>(null);

	return (
		<div className="space-y-6" data-testid="context-pack-panel">
			<div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-5">
				<div className="space-y-1">
					<span className="block text-xs font-medium text-muted-foreground">
						{labels.goalLabel}
					</span>
					<span
						data-testid="goal-id"
						className="inline-flex items-center rounded-md border border-border bg-muted px-2.5 py-1 font-mono text-xs text-foreground"
					>
						{CHECKOUT_GOAL.id}
					</span>
				</div>
				<label className="space-y-1">
					<span className="block text-xs font-medium text-muted-foreground">
						{labels.branchLabel}
					</span>
					<select
						data-testid="branch-select"
						value={branch}
						onChange={(e) => {
							setBranch(e.target.value as Branch);
							setPack(null);
						}}
						className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
					>
						{BRANCHES.map((b) => (
							<option key={b} value={b}>
								{b}
							</option>
						))}
					</select>
				</label>
				<button
					type="button"
					data-testid="run-compile"
					onClick={() =>
						setPack(compile(CHECKOUT_GOAL, branch, CHECKOUT_GRAPH))
					}
					className="inline-flex items-center rounded-md border border-blue-600/40 bg-blue-600/10 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-600/20 dark:text-blue-300"
				>
					{labels.compileCta}
				</button>
			</div>

			{pack ? (
				<div className="grid gap-6 lg:grid-cols-2">
					{/* Included */}
					<section
						data-testid="included-panel"
						className="space-y-4 rounded-xl border border-emerald-500/30 bg-card p-5"
					>
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{labels.includedHeading}
						</h2>
						<div className="space-y-1">
							<p className="text-xs font-medium text-muted-foreground">
								{labels.affectedLayers}
							</p>
							<Chips items={pack.affectedLayers} testid="affected-layers" />
						</div>
						<div className="space-y-1">
							<p className="text-xs font-medium text-muted-foreground">
								{labels.activeMirrors}
							</p>
							<Chips
								items={pack.activeKernel.mirrors}
								testid="active-mirrors"
							/>
						</div>
						<div className="space-y-1">
							<p className="text-xs font-medium text-muted-foreground">
								{labels.activeContracts}
							</p>
							<Chips
								items={pack.activeKernel.contracts}
								testid="active-contracts"
							/>
						</div>
						<div className="space-y-1">
							<p className="text-xs font-medium text-muted-foreground">
								{labels.memoryLessons}
							</p>
							<Chips
								items={pack.memory.relevantLessons}
								testid="memory-lessons"
							/>
						</div>
						<div className="space-y-1">
							<p className="text-xs font-medium text-muted-foreground">
								{labels.memoryIncidents}
							</p>
							<Chips
								items={pack.memory.recentIncidents}
								testid="memory-incidents"
							/>
						</div>
						<div className="space-y-1">
							<p className="text-xs font-medium text-muted-foreground">
								{labels.skillsTools}
							</p>
							<Chips
								items={[...pack.skills, ...pack.tools]}
								testid="skills-tools"
							/>
						</div>
						<p
							className="text-sm text-foreground/80"
							data-testid="stop-condition"
						>
							<span className="font-medium text-muted-foreground">
								{labels.stopCondition}{" "}
							</span>
							<code className="font-mono text-xs">{pack.stopCondition}</code>
						</p>
						<p
							className="text-xs text-muted-foreground"
							data-testid="pack-hash"
						>
							<span className="font-medium">{labels.packHash} </span>
							<code className="font-mono">{pack.hash}</code>
						</p>
					</section>

					{/* Excluded */}
					<section
						data-testid="excluded-panel"
						className="space-y-3 rounded-xl border border-red-500/30 bg-card p-5"
					>
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{labels.excludedHeading}
						</h2>
						<ul className="space-y-2" data-testid="excluded-list">
							{pack.excluded.map((e) => (
								<li
									key={`${e.id}:${e.reason}`}
									data-testid="excluded-item"
									data-id={e.id}
									data-reason={e.reason}
									className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5"
								>
									<code className="font-mono text-xs text-foreground/80">
										{e.id}
									</code>
									<span
										className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${reasonClasses(e.reason)}`}
									>
										{labels.reason[e.reason]}
									</span>
								</li>
							))}
						</ul>
					</section>

					{/* Boundaries strip */}
					<section
						data-testid="boundaries-strip"
						className="space-y-3 rounded-xl border border-border bg-muted/40 p-5 lg:col-span-2"
					>
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{labels.boundariesHeading}
						</h2>
						<div className="space-y-1">
							<p className="text-xs font-medium text-muted-foreground">
								{labels.allowedPaths}
							</p>
							<Chips
								items={pack.boundaries.allowedPaths}
								testid="allowed-paths"
							/>
						</div>
						<div className="space-y-1">
							<p className="text-xs font-medium text-muted-foreground">
								{labels.forbiddenPaths}
							</p>
							<ul
								className="flex flex-wrap gap-2"
								data-testid="forbidden-paths"
							>
								{pack.boundaries.forbiddenPaths.map((p) => (
									<li
										key={p}
										data-testid="forbidden-path"
										data-path={p}
										className="inline-flex items-center rounded-md border border-red-500/50 bg-red-500/15 px-2 py-0.5 font-mono text-xs text-red-700 dark:text-red-300"
									>
										{p}
									</li>
								))}
							</ul>
						</div>
					</section>
				</div>
			) : (
				<p
					className="text-xs italic text-muted-foreground"
					data-testid="pack-pending"
				>
					{labels.pending}
				</p>
			)}
		</div>
	);
}
