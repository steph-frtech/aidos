"use client";

import { useMemo, useState } from "react";
import {
	branch,
	checkoutAncestor,
	type Dag,
	type DagNode,
	heads,
	isReachable,
	type MovementEvent,
	rebranch,
} from "@/lib/version-dag";
import {
	DEMO_ANCESTOR,
	DEMO_CHANGESET,
	SEED_DAG,
} from "@/lib/version-dag-data";

/**
 * VersionDagPanel — the action-capable /version-dag panel (S24). It renders the canonical §120 DAG
 * (nodes = stable phases, edges = ChangeSets) stratified into TWO waterline bands (`above` = human
 * truth, `below` = evolutionary, §124), the current head(s) HIGHLIGHTED, and any node NOT on the
 * path to a head DIMMED (the abandoned-but-present line — making append-only visible).
 *
 * It EXECUTES the three §121 moves from the screen (not a static display): BRANCH a line off v1,
 * CHECKOUT the ancestor v1 (the head jumps back; v2/w1 stay), REBRANCH v2a off v1 (a new line; the
 * abandoned line stays). Each runs the SAME pure functions the Go dag package / the `dag` MCP run, so
 * the animation matches the engine. RESET restores the seed.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): the moves mutate LOCAL panel state to animate
 * the navigation; recording a node/edge into dag.node/dag.edge goes via the `aidos` writer role
 * through the `dag` MCP, never from this screen. The verdict/graph is RENDERED, never re-implemented.
 * Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011) — strings passed in as labels.
 */

interface Labels {
	branchLabel: string;
	checkoutLabel: string;
	rebranchLabel: string;
	resetLabel: string;
	aboveBand: string;
	belowBand: string;
	headBadge: string;
	abandonedBadge: string;
	lastEventLabel: string;
	noEvent: string;
	headsLabel: string;
	reachableLabel: string;
	events: Record<MovementEvent, string>;
	edgesHeading: string;
}

/** A node is "live" when it is a head or an ancestor of some head (on the active path). */
function liveSet(d: Dag): Set<string> {
	const live = new Set<string>();
	for (const h of heads(d)) {
		live.add(h.id);
		// every ancestor of a head is live.
		for (const n of d.nodes) {
			if (isReachable(d, n.id, h.id)) live.add(n.id);
		}
	}
	return live;
}

export function VersionDagPanel({ labels }: { labels: Labels }) {
	const [dag, setDag] = useState<Dag>(SEED_DAG);
	const [lastEvent, setLastEvent] = useState<MovementEvent | null>(null);
	const [lastNew, setLastNew] = useState<string | null>(null);

	const live = useMemo(() => liveSet(dag), [dag]);
	const headIds = useMemo(() => new Set(heads(dag).map((n) => n.id)), [dag]);

	const above = dag.nodes.filter((n) => n.stratum === "above");
	const below = dag.nodes.filter((n) => n.stratum === "below");

	const doBranch = (): void => {
		const r = branch(dag, DEMO_ANCESTOR, "tva-eu-variant", DEMO_CHANGESET);
		if (r.blocked) return;
		setDag(r.dag);
		setLastEvent(r.event);
		setLastNew(r.newNode ?? null);
	};
	const doCheckout = (): void => {
		const r = checkoutAncestor(dag, DEMO_ANCESTOR);
		if (r.blocked) return;
		setDag(r.dag);
		setLastEvent(r.event);
		setLastNew(null);
	};
	const doRebranch = (): void => {
		const r = rebranch(dag, DEMO_ANCESTOR, "v2a-line", DEMO_CHANGESET);
		if (r.blocked) return;
		setDag(r.dag);
		setLastEvent(r.event);
		setLastNew(r.newNode ?? null);
	};
	const doReset = (): void => {
		setDag(SEED_DAG);
		setLastEvent(null);
		setLastNew(null);
	};

	const renderNode = (n: DagNode) => {
		const isHead = headIds.has(n.id);
		const isLive = live.has(n.id);
		const isNew = n.id === lastNew;
		return (
			<li
				key={n.id}
				data-testid={`node-${n.id}`}
				data-head={isHead}
				data-live={isLive}
				data-stratum={n.stratum}
				className={[
					"inline-flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-xs transition",
					isHead
						? "border-blue-600 bg-blue-600/10 text-foreground ring-2 ring-blue-600/40"
						: isLive
							? "border-border bg-card text-foreground"
							: "border-dashed border-border bg-muted/30 text-muted-foreground opacity-50",
					isNew ? "ring-2 ring-emerald-500/50" : "",
				].join(" ")}
			>
				<span className="flex items-center gap-1.5">
					<code className="font-mono font-semibold">{n.id}</code>
					{isHead ? (
						<span
							data-testid={`head-${n.id}`}
							className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white"
						>
							{labels.headBadge}
						</span>
					) : !isLive ? (
						<span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
							{labels.abandonedBadge}
						</span>
					) : null}
				</span>
				{n.parentIds.length > 0 ? (
					<span className="font-mono text-[10px] text-muted-foreground">
						↑ {n.parentIds.join(", ")}
					</span>
				) : null}
				<span className="text-[10px] text-muted-foreground">{n.label}</span>
			</li>
		);
	};

	return (
		<div className="space-y-6">
			{/* The actions: the three §121 moves, executable from the screen */}
			<div className="flex flex-wrap items-center gap-3">
				<button
					type="button"
					data-testid="action-branch"
					onClick={doBranch}
					className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
				>
					{labels.branchLabel}
				</button>
				<button
					type="button"
					data-testid="action-checkout"
					onClick={doCheckout}
					className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
				>
					{labels.checkoutLabel}
				</button>
				<button
					type="button"
					data-testid="action-rebranch"
					onClick={doRebranch}
					className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
				>
					{labels.rebranchLabel}
				</button>
				<button
					type="button"
					data-testid="action-reset"
					onClick={doReset}
					className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
				>
					{labels.resetLabel}
				</button>
			</div>

			{/* Last event + heads */}
			<div className="flex flex-wrap items-center gap-4 text-sm">
				<span className="text-muted-foreground">
					{labels.lastEventLabel}{" "}
					<span
						data-testid="last-event"
						className="font-medium text-foreground"
					>
						{lastEvent ? labels.events[lastEvent] : labels.noEvent}
					</span>
				</span>
				<span className="text-muted-foreground">
					{labels.headsLabel}{" "}
					<span data-testid="heads" className="font-mono text-foreground">
						{heads(dag)
							.map((h) => h.id)
							.join(", ")}
					</span>
				</span>
			</div>

			{/* The DAG, stratified into two waterline bands (§124) */}
			<section
				data-testid="version-dag"
				className="space-y-4 rounded-lg border border-border bg-card p-5"
			>
				<div
					data-testid="band-above"
					className="space-y-2 rounded-md border border-border bg-background p-4"
				>
					<h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						{labels.aboveBand}
					</h3>
					<ul className="flex flex-wrap gap-3">{above.map(renderNode)}</ul>
				</div>

				{/* the waterline */}
				<div className="flex items-center gap-2">
					<div className="h-px flex-1 bg-blue-600/40" />
					<span className="text-[10px] tracking-widest text-blue-600/70 uppercase">
						≈≈≈ ligne de flottaison ≈≈≈
					</span>
					<div className="h-px flex-1 bg-blue-600/40" />
				</div>

				<div
					data-testid="band-below"
					className="space-y-2 rounded-md border border-dashed border-border bg-muted/20 p-4"
				>
					<h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						{labels.belowBand}
					</h3>
					<ul className="flex flex-wrap gap-3">{below.map(renderNode)}</ul>
				</div>

				{/* The edges (ChangeSets) */}
				<div className="space-y-2">
					<h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						{labels.edgesHeading}
					</h3>
					<ul className="space-y-1.5">
						{dag.edges.map((e) => (
							<li
								key={`${e.from}->${e.to}-${e.changeset}`}
								data-testid={`edge-${e.from}-${e.to}`}
								className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs"
							>
								<span className="font-mono text-foreground">
									{e.from} → {e.to}
								</span>
								<code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
									{e.changeset}
								</code>
							</li>
						))}
					</ul>
				</div>
			</section>
		</div>
	);
}
