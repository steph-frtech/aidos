import Link from "next/link";
import type { Edge, LegendEntry, Node, NodeKind } from "@/lib/workbench-graph";

/**
 * GraphCockpit — the shared deep-nav helper for the "/" full-graph cockpit (AIDOS step S44).
 *
 * It renders the WorkbenchGraph (a deterministic projection — lib/workbench-graph.ts) as a
 * navigable map: one node card per truth (button → view → action → operation → entity →
 * mirror → scope → incident), each card a DEEP-LINK to that node's per-step panel via its
 * `route` (/web-preview, /control, /operation, /entity-map, /mirrors, /scopes, /red-wave) —
 * it LINKS, it never re-renders those panels. The edges list mirrors prior link/propagation
 * truth (S17/S19) verbatim. The declared color legend (truth-type / liveness / red-wave)
 * comes from the projection, never a UI guess.
 *
 * READ-ONLY (CLAUDE.md §7): a Server-Component-friendly pure render — no state, no I/O, no
 * clock, no rng. Layout is a deterministic, content-ordered grid so the snapshot is stable.
 * The wall is untouched: this authors nothing.
 */

interface Labels {
	nodesHeading: string;
	edgesHeading: string;
	legendHeading: string;
	open: string;
	fromLabel: string;
	toLabel: string;
	relationLabel: string;
	hashLabel: string;
	kind: Record<NodeKind, string>;
	dimension: Record<"truth_type" | "liveness" | "red_wave", string>;
}

/** The declared color token → a tailwind class. The token IS the legend's truth (ADR 0010). */
const colorClass: Record<string, string> = {
	primary: "border-primary/40 bg-primary/10 text-primary",
	muted: "border-border bg-muted text-muted-foreground",
	"chart-2":
		"border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	destructive: "border-destructive/40 bg-destructive/10 text-destructive",
};

function tokenFor(
	legend: LegendEntry[],
	dimension: string,
	value: string,
): string {
	if (value === "") return "muted";
	const e = legend.find((l) => l.dimension === dimension && l.value === value);
	return e?.color ?? "muted";
}

export function GraphCockpit({
	nodes,
	edges,
	legend,
	graphHash,
	labels,
}: {
	nodes: Node[];
	edges: Edge[];
	legend: LegendEntry[];
	graphHash: string;
	labels: Labels;
}) {
	return (
		<div data-testid="workbench-graph" data-graph-hash={graphHash}>
			{/* Color legend — declared, enumerates exactly the colors used */}
			<section
				aria-label={labels.legendHeading}
				data-testid="legend"
				className="space-y-3 rounded-xl border border-border bg-muted/40 p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.legendHeading}
				</h2>
				<ul className="flex flex-wrap gap-2">
					{legend.map((l) => (
						<li
							key={`${l.dimension}-${l.value}`}
							data-testid={`legend-${l.dimension}-${l.value}`}
							data-color={l.color}
							className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${colorClass[l.color] ?? colorClass.muted}`}
						>
							<span className="text-[0.65rem] uppercase opacity-70">
								{labels.dimension[l.dimension]}
							</span>
							{l.value}
						</li>
					))}
				</ul>
			</section>

			{/* Nodes — each a deep-link to its per-step panel */}
			<section aria-label={labels.nodesHeading} className="mt-8 space-y-4">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.nodesHeading}
				</h2>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{nodes.map((n) => {
						const ttToken = tokenFor(legend, "truth_type", n.truthType);
						const rwToken = tokenFor(legend, "red_wave", n.redWaveState);
						return (
							<Link
								key={n.id}
								href={n.route}
								data-testid={`node-${n.id}`}
								data-kind={n.kind}
								data-route={n.route}
								data-truth-type={n.truthType}
								data-red-wave={n.redWaveState}
								className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<div className="flex items-center justify-between gap-2">
									<span className="font-mono text-sm font-semibold tracking-tight text-card-foreground">
										{n.id}
									</span>
									<span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
										{labels.kind[n.kind]}
									</span>
								</div>
								<div className="flex flex-wrap gap-1.5">
									<span
										data-testid={`node-${n.id}-truthtype`}
										className={`inline-flex rounded-full border px-2 py-0.5 text-[0.65rem] font-medium ${colorClass[ttToken] ?? colorClass.muted}`}
									>
										{n.truthType}
									</span>
									{n.liveness !== "" && (
										<span
											className={`inline-flex rounded-full border px-2 py-0.5 text-[0.65rem] font-medium ${colorClass[tokenFor(legend, "liveness", n.liveness)] ?? colorClass.muted}`}
										>
											{n.liveness}
										</span>
									)}
									{n.redWaveState !== "" && (
										<span
											data-testid={`node-${n.id}-redwave`}
											className={`inline-flex rounded-full border px-2 py-0.5 text-[0.65rem] font-medium ${colorClass[rwToken] ?? colorClass.muted}`}
										>
											{n.redWaveState}
										</span>
									)}
								</div>
								<span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
									{labels.open} {n.route}
								</span>
							</Link>
						);
					})}
				</div>
			</section>

			{/* Edges — prior link/propagation truth (S17/S19), verbatim */}
			<section
				aria-label={labels.edgesHeading}
				data-testid="edges"
				className="mt-8 space-y-4"
			>
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.edgesHeading}
				</h2>
				<ul className="divide-y divide-border rounded-xl border border-border bg-card">
					{edges.map((e) => (
						<li
							key={`${e.from}-${e.relation}-${e.to}`}
							data-testid={`edge-${e.from}-${e.relation}-${e.to}`}
							className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm"
						>
							<span className="font-mono text-card-foreground">{e.from}</span>
							<span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
								{e.relation}
							</span>
							<span className="font-mono text-card-foreground">{e.to}</span>
						</li>
					))}
				</ul>
			</section>

			<p className="mt-6 text-xs text-muted-foreground">
				{labels.hashLabel}{" "}
				<code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem] text-foreground">
					{graphHash}
				</code>
			</p>
		</div>
	);
}
