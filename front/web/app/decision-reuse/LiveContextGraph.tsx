import type { LiveContextGraphView } from "./liveActions";

/**
 * LiveContextGraph — the read-only "live ContextGraph view" section of the /decision-reuse
 * panel (S59 cutover, ADR 0092 kill-twins batch). It renders the ContextGraph view the reuse
 * gate judges against, read live through the gateway (context_graph_query): the load-bearing
 * layers, the red mirrors (the stop condition), the crossed PUBLIC contracts, and the scoped
 * memory — with a source badge ("live"/"demo") and the deterministic demo view as the fallback.
 * READ-ONLY (the wall): "le LLM ne vit pas dans le ContextGraph". Server Component — the view is
 * passed in already decoded. Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */

interface Labels {
	heading: string;
	intro: string;
	empty: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
	layersLabel: string;
	mirrorsLabel: string;
	contractsLabel: string;
	memoryLabel: string;
	loadBearing: string;
	redMirror: string;
	publicContract: string;
}

function chip(text: string, highlight: boolean) {
	return (
		<li
			key={text}
			className={
				highlight
					? "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 font-mono text-[0.7rem] font-semibold text-primary"
					: "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 font-mono text-[0.7rem] text-muted-foreground"
			}
		>
			{text}
		</li>
	);
}

export function LiveContextGraph({
	view,
	labels,
}: {
	view: LiveContextGraphView;
	labels: Labels;
}) {
	const isLive = view.source === "live";
	const empty =
		view.layers.length === 0 &&
		view.mirrors.length === 0 &&
		view.contracts.length === 0 &&
		view.memory.length === 0;

	return (
		<section
			aria-label={labels.heading}
			data-testid="live-context-graph"
			className="space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				<span
					data-testid="context-graph-source"
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

			{empty ? (
				<p className="text-sm text-muted-foreground">{labels.empty}</p>
			) : (
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{labels.layersLabel}
						</p>
						<ul className="flex flex-wrap gap-2">
							{view.layers.map((l) =>
								chip(
									`${l.id}${l.loadBearing ? ` · ${labels.loadBearing}` : ""}`,
									l.loadBearing,
								),
							)}
						</ul>
					</div>
					<div className="space-y-2">
						<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{labels.mirrorsLabel}
						</p>
						<ul className="flex flex-wrap gap-2">
							{view.mirrors.map((m) =>
								chip(`${m.id}${m.red ? ` · ${labels.redMirror}` : ""}`, m.red),
							)}
						</ul>
					</div>
					<div className="space-y-2">
						<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{labels.contractsLabel}
						</p>
						<ul className="flex flex-wrap gap-2">
							{view.contracts.map((c) =>
								chip(
									`${c.id}${c.public ? ` · ${labels.publicContract}` : ""}`,
									c.public,
								),
							)}
						</ul>
					</div>
					<div className="space-y-2">
						<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{labels.memoryLabel}
						</p>
						<ul className="flex flex-wrap gap-2">
							{view.memory.map((mem) =>
								chip(
									`${mem.id} · ${mem.confidence}`,
									mem.approved && !mem.stale,
								),
							)}
						</ul>
					</div>
				</div>
			)}
		</section>
	);
}
