"use client";

import { useMemo, useState } from "react";
import { aggregate, type Tree, type Verdict } from "@/lib/truth-tree";
import {
	buildTree,
	COSMETIC_CHANGED,
	NODE_ORDER,
	OWN_ALL_GREEN,
	OWN_COSMETIC_GREEN,
	OWN_RED_CONTROL,
	ROOT_ID,
} from "@/lib/truth-tree-data";

/**
 * TruthTree — the read-only /truth-tree panel (S18). It renders the KRD §114 composition chain
 * (product → journey → view → control + a cosmetic helptext leaf): each node shows its own_mirror
 * verdict AND its recursive AGGREGATE verdict (computed by the pure aggregate of lib/truth-tree.ts,
 * the projection of back/kernel/composes), each edge shows its composes WEIGHT (load-bearing |
 * cosmetic) and pinned `@version`, and the parent's declared activation_threshold.
 *
 * A scenario toggle flips the leaf own_mirrors: all-green ⇒ the product aggregates GREEN; the
 * load-bearing `control` leaf RED ⇒ the fall-back-up tints the view/journey/product RED and the
 * drill-down from the product names the control (THE done criterion); a cosmetic change below
 * threshold leaves the product GREEN.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): the toggle changes only which own_mirror snapshot the
 * pure aggregate runs against — it writes no truth (the wall). The verdict is computed here, never
 * declared.
 */

interface Labels {
	scenarioHeading: string;
	scenarioAllGreen: string;
	scenarioRedControl: string;
	scenarioCosmetic: string;
	nodeHeading: string;
	ownLabel: string;
	aggregateLabel: string;
	thresholdLabel: string;
	weightLabel: string;
	badgeGreen: string;
	badgeRed: string;
	rootHeading: string;
	rootAggregateLabel: string;
	drillHeading: string;
	drillEmpty: string;
	weightLoadBearing: string;
	weightCosmetic: string;
}

type Scenario = "all-green" | "red-control" | "cosmetic";

const verdictBadge: Record<Verdict, string> = {
	GREEN:
		"border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	RED: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function TruthTree({ labels }: { labels: Labels }) {
	const [scenario, setScenario] = useState<Scenario>("all-green");

	const tree: Tree = useMemo(() => {
		switch (scenario) {
			case "red-control":
				return buildTree(OWN_RED_CONTROL);
			case "cosmetic": {
				const t = buildTree(OWN_COSMETIC_GREEN);
				return { ...t, changed: COSMETIC_CHANGED };
			}
			default:
				return buildTree(OWN_ALL_GREEN);
		}
	}, [scenario]);

	const rootResult = useMemo(() => aggregate(tree, ROOT_ID), [tree]);
	const verdictText: Record<Verdict, string> = {
		GREEN: labels.badgeGreen,
		RED: labels.badgeRed,
	};
	const weightText = (w: string) =>
		w === "load-bearing" ? labels.weightLoadBearing : labels.weightCosmetic;

	// parent weight + threshold per child id, for the per-row edge metadata
	const edgeOf = (childId: string) =>
		tree.edges.find((e) => e.child.id === childId);

	return (
		<div className="space-y-6">
			{/* Scenario toggle — flips which own_mirror snapshot the pure aggregate runs against */}
			<fieldset className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-3">
				<legend className="px-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
					{labels.scenarioHeading}
				</legend>
				<div className="flex flex-wrap gap-1.5">
					<button
						type="button"
						data-testid="scenario-all-green"
						aria-pressed={scenario === "all-green"}
						onClick={() => setScenario("all-green")}
						className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
							scenario === "all-green"
								? "border-blue-600 bg-blue-600 text-white"
								: "border-border bg-card text-muted-foreground hover:bg-muted"
						}`}
					>
						{labels.scenarioAllGreen}
					</button>
					<button
						type="button"
						data-testid="scenario-red-control"
						aria-pressed={scenario === "red-control"}
						onClick={() => setScenario("red-control")}
						className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
							scenario === "red-control"
								? "border-destructive bg-destructive text-white"
								: "border-border bg-card text-muted-foreground hover:bg-muted"
						}`}
					>
						{labels.scenarioRedControl}
					</button>
					<button
						type="button"
						data-testid="scenario-cosmetic"
						aria-pressed={scenario === "cosmetic"}
						onClick={() => setScenario("cosmetic")}
						className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
							scenario === "cosmetic"
								? "border-blue-600 bg-blue-600 text-white"
								: "border-border bg-card text-muted-foreground hover:bg-muted"
						}`}
					>
						{labels.scenarioCosmetic}
					</button>
				</div>
			</fieldset>

			{/* The root aggregate — the whole's recursive verdict */}
			<section
				data-testid="root-aggregate"
				data-verdict={rootResult.verdict}
				className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.rootHeading}
				</h2>
				<span className="font-mono text-xs text-muted-foreground">
					{tree.nodes[ROOT_ID].layerId}@{tree.nodes[ROOT_ID].version}
				</span>
				<span className="text-xs text-muted-foreground">
					{labels.rootAggregateLabel}
				</span>
				<span
					data-testid="root-verdict"
					className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold ${verdictBadge[rootResult.verdict]}`}
				>
					{verdictText[rootResult.verdict]}
				</span>
			</section>

			{/* Per-node verdicts (own + aggregate), composes weight + pinned version, threshold */}
			<section aria-label={labels.nodeHeading} className="space-y-2">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.nodeHeading}
				</h2>
				<div className="overflow-x-auto rounded-xl border border-border">
					<table className="w-full border-collapse text-left text-sm">
						<thead>
							<tr className="border-b border-border bg-muted/40 text-[0.7rem] tracking-wider text-muted-foreground uppercase">
								<th className="px-4 py-3 font-medium">{labels.nodeHeading}</th>
								<th className="px-4 py-3 font-medium">{labels.weightLabel}</th>
								<th className="px-4 py-3 font-medium">
									{labels.thresholdLabel}
								</th>
								<th className="px-4 py-3 font-medium">{labels.ownLabel}</th>
								<th className="px-4 py-3 font-medium">
									{labels.aggregateLabel}
								</th>
							</tr>
						</thead>
						<tbody>
							{NODE_ORDER.map((id) => {
								const node = tree.nodes[id];
								const agg = aggregate(tree, id).verdict;
								const edge = edgeOf(id);
								return (
									<tr
										key={id}
										data-testid="tree-node"
										data-node={id}
										data-own={node.ownMirror}
										data-aggregate={agg}
										className="border-b border-border align-top last:border-0"
									>
										<td className="px-4 py-3 font-mono text-xs text-card-foreground">
											{node.layerId}@{node.version}
										</td>
										<td className="px-4 py-3">
											{edge ? (
												<span
													data-testid="edge-weight"
													data-weight={edge.weight}
													className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-0.5 font-mono text-xs text-foreground"
												>
													{weightText(edge.weight)}
												</span>
											) : (
												<span className="text-xs text-muted-foreground">—</span>
											)}
										</td>
										<td className="px-4 py-3 font-mono text-xs text-muted-foreground">
											{node.activationThreshold}
										</td>
										<td className="px-4 py-3">
											<span
												className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold ${verdictBadge[node.ownMirror]}`}
											>
												{verdictText[node.ownMirror]}
											</span>
										</td>
										<td className="px-4 py-3">
											<span
												data-testid="node-aggregate"
												className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold ${verdictBadge[agg]}`}
											>
												{verdictText[agg]}
											</span>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</section>

			{/* Drill-down — the chain from the root down to the red child (KRD §110) */}
			<section
				aria-label={labels.drillHeading}
				data-testid="drill-down"
				className="space-y-2 rounded-xl border border-border bg-muted/40 p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.drillHeading}
				</h2>
				{rootResult.verdict === "GREEN" ? (
					<p className="text-sm text-muted-foreground">{labels.drillEmpty}</p>
				) : (
					<ol className="flex flex-wrap items-center gap-2 text-xs">
						{rootResult.drillDown.map((s, i) => (
							<li
								key={`${s.layerId}@${s.version}`}
								data-testid="drill-step"
								data-layer={s.layerId}
								className="flex items-center gap-2"
							>
								{i > 0 && <span className="text-muted-foreground">→</span>}
								<span
									className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono ${verdictBadge[s.aggregate]}`}
								>
									{s.layerId}
								</span>
							</li>
						))}
					</ol>
				)}
			</section>
		</div>
	);
}
