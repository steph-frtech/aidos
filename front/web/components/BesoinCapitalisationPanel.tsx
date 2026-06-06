"use client";

import { useMemo, useState } from "react";
import {
	anchor,
	type BesoinAnchor,
	type CapNode,
	isFullyResolved,
	parseGraphHash,
	type ReusePlan,
	reuseFor,
} from "@/lib/besoin-capitalisation";
import { levels } from "@/lib/besoin-grammar";
import { addNode, type BesoinGraph, newGraph } from "@/lib/besoin-graph";
import { isNoEmit } from "@/lib/besoin-proposes";

/**
 * BesoinCapitalisationPanel — the action-capable /compound-besoin-capitalisation panel (EL18). The
 * human EXECUTES the need-capitalisation FROM THE SCREEN (ui-completeness, CLAUDE.md §7 — no headless
 * capability): edit each SOURCE rung's verbatim intent of a FIRST resolved need, then "Capitaliser le
 * besoin" runs anchor() — the besoin_capitalise tool: the reusable anchor (graph_hash + canonicalised
 * (level, intent) keys), the candidate besoin-behaviour idea (a DRAFT via the wall whose provenance
 * reconstructs to the graph_hash), and the always-false wroteKernel proof. A SECOND need's intents
 * drive "Mesurer la réutilisation" (reuseFor) — the CE05 name-match on canonical keys: a similar
 * need replays units (ReplayCost), a dissimilar need fabricates NO reuse (anti-false-positive).
 *
 * Every verdict is COMPUTED by the deterministic twin lib/besoin-capitalisation.ts (byte-equivalent to
 * back/runtime/besoin/capitalisation.go + the besoin_capitalise MCP tool), never an LLM. ABOVE the
 * wall (CLAUDE.md §2): capitalisation writes no truth — STRICTLY via firewall.ViaIdea, NEVER ToKernel,
 * NEVER fitness. Themed (ADR 0010), bilingual (ADR 0011).
 */

interface Labels {
	intro: string;
	firstHeading: string;
	secondHeading: string;
	capitaliseCta: string;
	reuseCta: string;
	resetCta: string;
	graphHashLabel: string;
	unitsLabel: string;
	noEmitLabel: string;
	behaviorLabel: string;
	provenanceLabel: string;
	reconstructLabel: string;
	wallNote: string;
	notResolved: string;
	reuseHeading: string;
	replayedLabel: string;
	freshLabel: string;
	savedLabel: string;
	dissimilarNote: string;
}

const SOURCE = levels();

function defaultFirst(): Record<string, string> {
	const init: Record<string, string> = {};
	for (const l of SOURCE) init[l] = "";
	init.product = "Gérer des tâches";
	init.entity = "une entité Tâche";
	return init;
}

function defaultSecond(): Record<string, string> {
	const init: Record<string, string> = {};
	for (const l of SOURCE) init[l] = "";
	// Cosmetically different from the first → same canonical keys → reuse.
	init.product = "  gérer   des tâches.  ";
	init.entity = "Une entité tâche!";
	return init;
}

function toNodes(intents: Record<string, string>): CapNode[] {
	return SOURCE.filter((l) => intents[l]?.trim() && !isNoEmit(l)).map((l) => ({
		level: l,
		status: "resolved" as const,
		utterance: intents[l],
	}));
}

export function BesoinCapitalisationPanel({ labels }: { labels: Labels }) {
	const [first, setFirst] = useState<Record<string, string>>(defaultFirst);
	const [second, setSecond] = useState<Record<string, string>>(defaultSecond);
	const [captured, setCaptured] = useState<BesoinAnchor | null>(null);
	const [behaviorProv, setBehaviorProv] = useState<string | null>(null);
	const [reuse, setReuse] = useState<ReusePlan | null>(null);

	const firstNodes = useMemo(() => toNodes(first), [first]);
	const secondNodes = useMemo(() => toNodes(second), [second]);
	const resolved = isFullyResolved(firstNodes);

	// buildResolvedGraph appends the resolved mapping rungs into a BesoinGraph so its graph_hash
	// addresses the canonical body (the same content-addressing the Go authority uses). Pure.
	function buildResolvedGraph(
		project: string,
		intents: Record<string, string>,
	): BesoinGraph {
		let g = newGraph(project);
		for (const l of SOURCE) {
			if (!intents[l]?.trim() || isNoEmit(l)) continue;
			const res = addNode(g, {
				level: l,
				status: "resolved",
				provenance: { source: "human", detail: intents[l] },
			});
			if (res.ok) g = res.graph;
		}
		return g;
	}

	function onCapitalise() {
		const g = buildResolvedGraph("capitalise-demo", first);
		const a = anchor(g, firstNodes, "main");
		setCaptured(a);
		// The behaviour candidate's memory provenance carries the graph_hash (provenance honesty).
		setBehaviorProv(`besoin:${a.graphHash}`);
		setReuse(null);
	}

	function onReuse() {
		if (!captured) return;
		const g2 = buildResolvedGraph("capitalise-demo-2", second);
		setReuse(reuseFor(captured, anchor(g2, secondNodes, "main")));
	}

	function onReset() {
		setFirst(defaultFirst());
		setSecond(defaultSecond());
		setCaptured(null);
		setBehaviorProv(null);
		setReuse(null);
	}

	const reconstructed = behaviorProv ? parseGraphHash(behaviorProv) : null;

	return (
		<div className="space-y-8">
			<p className="text-sm text-muted-foreground">{labels.intro}</p>

			{/* the FIRST resolved need */}
			<div className="space-y-3 rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold text-foreground">
					{labels.firstHeading}
				</h2>
				<ul className="space-y-2">
					{SOURCE.filter((l) => !isNoEmit(l)).map((level) => (
						<li
							key={level}
							className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
						>
							<span className="text-sm font-medium text-foreground">
								{level}
							</span>
							<input
								data-testid={`first-${level}`}
								value={first[level]}
								onChange={(e) =>
									setFirst((s) => ({ ...s, [level]: e.target.value }))
								}
								className="min-w-[14rem] flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
							/>
						</li>
					))}
				</ul>
				<div className="flex flex-wrap items-center gap-3 pt-2">
					<button
						type="button"
						data-testid="capitalise-cta"
						onClick={onCapitalise}
						disabled={!resolved}
						className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
					>
						{labels.capitaliseCta}
					</button>
					<button
						type="button"
						data-testid="reset-cta"
						onClick={onReset}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
					>
						{labels.resetCta}
					</button>
				</div>
				{!resolved && (
					<p
						data-testid="not-resolved"
						className="text-xs text-muted-foreground"
					>
						{labels.notResolved}
					</p>
				)}
			</div>

			{/* the captured anchor */}
			{captured && (
				<div
					data-testid="anchor"
					className="space-y-3 rounded-xl border border-border bg-card p-5"
				>
					<h2 className="text-sm font-semibold text-foreground">
						{labels.secondHeading}
					</h2>
					<p className="text-sm text-foreground">
						<span className="text-muted-foreground">
							{labels.graphHashLabel}{" "}
						</span>
						<code data-testid="graph-hash" className="text-xs">
							{captured.graphHash}
						</code>
					</p>
					<div className="text-sm">
						<span className="text-muted-foreground">{labels.unitsLabel} </span>
						<ul data-testid="anchor-units" className="mt-1 space-y-1">
							{captured.units.map((u) => (
								<li key={u.key} className="text-foreground">
									<span className="font-medium">{u.level}</span> · {u.intent} ·{" "}
									<code className="text-xs text-muted-foreground">{u.key}</code>
								</li>
							))}
						</ul>
					</div>
					<p className="text-sm text-foreground">
						<span className="text-muted-foreground">
							{labels.behaviorLabel}{" "}
						</span>
						<span data-testid="behavior-draft">draft</span>
					</p>
					<p className="text-sm text-foreground">
						<span className="text-muted-foreground">
							{labels.provenanceLabel}{" "}
						</span>
						<code data-testid="behavior-prov" className="text-xs">
							{behaviorProv}
						</code>
					</p>
					<p className="text-sm text-foreground">
						<span className="text-muted-foreground">
							{labels.reconstructLabel}{" "}
						</span>
						<code data-testid="reconstructed-hash" className="text-xs">
							{reconstructed === captured.graphHash ? reconstructed : "—"}
						</code>
					</p>
					<p
						data-testid="wall-note"
						className="pt-1 text-xs text-muted-foreground"
					>
						{labels.wallNote}
					</p>
				</div>
			)}

			{/* the SECOND need + reuse measurement */}
			{captured && (
				<div className="space-y-3 rounded-xl border border-border bg-card p-5">
					<h2 className="text-sm font-semibold text-foreground">
						{labels.reuseHeading}
					</h2>
					<ul className="space-y-2">
						{SOURCE.filter((l) => !isNoEmit(l)).map((level) => (
							<li
								key={level}
								className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
							>
								<span className="text-sm font-medium text-foreground">
									{level}
								</span>
								<input
									data-testid={`second-${level}`}
									value={second[level]}
									onChange={(e) =>
										setSecond((s) => ({ ...s, [level]: e.target.value }))
									}
									className="min-w-[14rem] flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
								/>
							</li>
						))}
					</ul>
					<button
						type="button"
						data-testid="reuse-cta"
						onClick={onReuse}
						className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
					>
						{labels.reuseCta}
					</button>
					{reuse && (
						<div data-testid="reuse-result" className="space-y-1 pt-2 text-sm">
							<p className="text-foreground">
								<span className="text-muted-foreground">
									{labels.replayedLabel}{" "}
								</span>
								<span data-testid="reused-count">{reuse.reusedProcedural}</span>
							</p>
							<p className="text-foreground">
								<span className="text-muted-foreground">
									{labels.freshLabel}{" "}
								</span>
								{reuse.derivedFresh}
							</p>
							<p className="text-foreground">
								<span className="text-muted-foreground">
									{labels.savedLabel}{" "}
								</span>
								<span data-testid="saved-tokens">{reuse.savedTokens}</span>
							</p>
							{reuse.reusedProcedural === 0 && (
								<p
									data-testid="dissimilar-note"
									className="text-xs text-muted-foreground"
								>
									{labels.dissimilarNote}
								</p>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
