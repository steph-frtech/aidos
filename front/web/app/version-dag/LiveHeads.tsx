import type { LiveHeadsView } from "./actions";

/**
 * LiveHeads — the read-only "live DAG heads" section of the /version-dag panel (S59 cutover).
 * It renders the active project's current version-DAG heads read live through the gateway
 * (dag_heads), with a source badge ("live"/"demo") and a deterministic demo head set as the
 * fallback. READ-ONLY (the wall): recording a DAG node/edge never originates here. Server
 * Component — the view is passed in already decoded. Themed on ADR 0010 tokens; bilingual
 * via next-intl (ADR 0011, labels passed in).
 */

interface Labels {
	heading: string;
	intro: string;
	empty: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
}

export function LiveHeads({
	view,
	labels,
}: {
	view: LiveHeadsView;
	labels: Labels;
}) {
	const isLive = view.source === "live";
	return (
		<section
			aria-label={labels.heading}
			data-testid="live-heads"
			className="space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				<span
					data-testid="dag-source"
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

			{view.heads.length === 0 ? (
				<p className="text-sm text-muted-foreground">{labels.empty}</p>
			) : (
				<ul className="flex flex-wrap gap-2" data-testid="live-heads-list">
					{view.heads.map((h) => (
						<li
							key={h}
							className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 font-mono text-[0.7rem] text-foreground"
						>
							{h}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
