import type { LiveThresholdView } from "./live";

/**
 * LiveThreshold — the read-only "live declared bar" section of the /mutation-score panel
 * (S59 cutover). It renders the DECLARED mutation-score threshold read live through the
 * gateway (read_threshold, a SELECT-only read of `fitness`), with a source badge
 * ("live"/"demo") and a deterministic demo bar (0.80) as the fallback. READ-ONLY (the
 * wall): the agent is GRADED by this bar, never authors it; the screen writes nothing.
 * When the live bar is NOT declared (declared:false) the gate would block with
 * MISSING_THRESHOLD — surfaced honestly. Server Component — the view arrives already
 * decoded. Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011, labels passed in).
 */

interface Labels {
	heading: string;
	intro: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
	scopeLabel: string;
	thresholdLabel: string;
	declaredYes: string;
	declaredNo: string;
}

export function LiveThreshold({
	view,
	labels,
}: {
	view: LiveThresholdView;
	labels: Labels;
}) {
	const isLive = view.source === "live";
	const pct = `${Math.round(view.threshold * 100)} %`;
	return (
		<section
			aria-label={labels.heading}
			data-testid="live-threshold"
			className="mt-6 space-y-4 rounded-lg border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				<span
					data-testid="threshold-source"
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

			<dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
				<div className="space-y-1">
					<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{labels.scopeLabel}
					</dt>
					<dd className="font-mono text-[0.75rem] text-foreground">
						{view.scope}
					</dd>
				</div>
				<div className="space-y-1">
					<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{labels.thresholdLabel}
					</dt>
					<dd
						data-testid="threshold-value"
						className="font-mono text-base font-semibold text-foreground"
					>
						{pct}
					</dd>
				</div>
				<div className="space-y-1">
					<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{labels.declaredYes.split(" ")[0]}
					</dt>
					<dd>
						<span
							data-testid="threshold-declared"
							data-declared={view.declared}
							className={
								view.declared
									? "inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
									: "inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive"
							}
						>
							{view.declared ? labels.declaredYes : labels.declaredNo}
						</span>
					</dd>
				</div>
			</dl>
		</section>
	);
}
