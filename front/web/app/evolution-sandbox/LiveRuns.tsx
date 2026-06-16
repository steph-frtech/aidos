import type { LiveRunsView } from "./actions";

/**
 * LiveRuns — the read-only "recorded EvolutionRuns" section of the /evolution-sandbox panel
 * (S59 cutover). It renders the active project's recorded EvolutionRun ids read live through
 * the gateway (evolve_run_list, dispatched evolve), with a source badge ("live"/"demo") and
 * the deterministic demo fixture as the fallback. READ-ONLY (the wall): /evolve runs only in
 * quarantine and writes only branches/reports/ideas — a promotion is a PROPOSAL the human
 * /goal freezes, never a truth-write from here. Server Component — the view is passed in
 * already decoded. Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */

interface Labels {
	heading: string;
	intro: string;
	empty: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
	runIdLabel: string;
}

export function LiveRuns({
	view,
	labels,
}: {
	view: LiveRunsView;
	labels: Labels;
}) {
	const isLive = view.source === "live";
	return (
		<section
			aria-label={labels.heading}
			data-testid="live-runs"
			className="mt-10 space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				<span
					data-testid="runs-source"
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

			{view.runIds.length === 0 ? (
				<p className="text-sm text-muted-foreground">{labels.empty}</p>
			) : (
				<ul className="space-y-2">
					{view.runIds.map((id) => (
						<li
							key={id}
							data-testid="live-run"
							className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2"
						>
							<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
								{labels.runIdLabel}
							</span>
							<span className="font-mono text-xs text-foreground">{id}</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
