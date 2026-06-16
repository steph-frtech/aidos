import type { LiveGraphView } from "./actions";

/**
 * LiveGraph — the read-only "live DAG (whole graph)" section of the /version-dag panel
 * (S59 cutover, ADR 0092 kill-twins batch). It renders the active project's WHOLE version-DAG
 * read live through the gateway (dag_get): the nodes split by waterline stratum (above =
 * human truth / below = evolutionary, §124), the heads HIGHLIGHTED, and the ChangeSet edges —
 * with a source badge ("live"/"demo") and the deterministic demo graph as the fallback.
 * READ-ONLY (the wall): recording a node/edge never originates here. Server Component — the
 * view is passed in already decoded. Themed on ADR 0010 tokens; bilingual via next-intl
 * (ADR 0011, labels passed in).
 */

interface Labels {
	heading: string;
	intro: string;
	empty: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
	aboveBand: string;
	belowBand: string;
	headBadge: string;
	edgesHeading: string;
}

export function LiveGraph({
	view,
	labels,
}: {
	view: LiveGraphView;
	labels: Labels;
}) {
	const isLive = view.source === "live";
	const headSet = new Set(view.heads);
	const above = view.nodes.filter((n) => n.stratum === "above");
	const below = view.nodes.filter((n) => n.stratum !== "above");

	const band = (title: string, nodes: typeof view.nodes, key: string) =>
		nodes.length === 0 ? null : (
			<div className="space-y-2" data-testid={`live-band-${key}`}>
				<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{title}
				</p>
				<ul className="flex flex-wrap gap-2">
					{nodes.map((n) => {
						const isHead = headSet.has(n.id);
						return (
							<li
								key={n.id}
								data-head={isHead ? "true" : "false"}
								className={
									isHead
										? "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 font-mono text-[0.7rem] font-semibold text-primary"
										: "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 font-mono text-[0.7rem] text-muted-foreground"
								}
							>
								{n.id}
								{n.label ? (
									<span className="not-italic opacity-70">· {n.label}</span>
								) : null}
								{isHead ? (
									<span className="rounded-full bg-primary/20 px-1.5 text-[0.6rem] not-italic">
										{labels.headBadge}
									</span>
								) : null}
							</li>
						);
					})}
				</ul>
			</div>
		);

	return (
		<section
			aria-label={labels.heading}
			data-testid="live-graph"
			className="space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				<span
					data-testid="dag-graph-source"
					data-source={view.source}
					className={
						isLive
							? "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
							: "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
					}
					title={isLive ? labels.liveTitle : labels.demoTitle}
				>
					<span
						aria-hidden="true"
						className={
							isLive
								? "size-1.5 rounded-full bg-primary"
								: "size-1.5 rounded-full bg-muted-foreground"
						}
					/>
					{isLive ? labels.live : labels.demo}
				</span>
			</div>
			<p className="text-sm leading-relaxed text-muted-foreground">
				{labels.intro}
			</p>

			{view.nodes.length === 0 ? (
				<p className="text-sm text-muted-foreground">{labels.empty}</p>
			) : (
				<div className="space-y-4">
					{band(labels.aboveBand, above, "above")}
					{band(labels.belowBand, below, "below")}

					{view.edges.length > 0 ? (
						<div className="space-y-2">
							<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
								{labels.edgesHeading}
							</p>
							<ul className="space-y-1" data-testid="live-graph-edges">
								{view.edges.map((e) => (
									<li
										key={`${e.from}->${e.to}`}
										className="font-mono text-[0.7rem] text-muted-foreground"
									>
										{e.from} → {e.to}{" "}
										<span className="opacity-70">({e.changeset})</span>
									</li>
								))}
							</ul>
						</div>
					) : null}
				</div>
			)}
		</section>
	);
}
