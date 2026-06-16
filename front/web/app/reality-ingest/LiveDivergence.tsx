import type { LiveDivergenceView } from "./liveActions";

/**
 * LiveDivergence — the read-only "live divergence detector" section of the /reality-ingest
 * panel (S59 cutover). It renders the LIVE deterministic detector's verdict over the canonical
 * out-of-stock report + the mirror promise, read live through the gateway (detect_divergence,
 * dispatched reality-ingest), with a source badge ("live"/"demo") and the deterministic demo
 * record as the fallback. READ-ONLY (the wall): detect_divergence returns a VALUE
 * (WroteKernel always false); the direct Reality→Kernel edge is always refused. Server
 * Component — the view is passed in already decoded. Themed (ADR 0010), bilingual (ADR 0011).
 */

interface Labels {
	heading: string;
	intro: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
	divergedYes: string;
	divergedNo: string;
	operationLabel: string;
	kindLabel: string;
	mirrorRefLabel: string;
	observedLabel: string;
	expectedLabel: string;
	callsLabel: string;
	noKernelWrite: string;
}

export function LiveDivergence({
	view,
	labels,
}: {
	view: LiveDivergenceView;
	labels: Labels;
}) {
	const isLive = view.source === "live";
	const d = view.divergence;
	return (
		<section
			aria-label={labels.heading}
			data-testid="live-divergence"
			className="mt-10 space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				<span
					data-testid="divergence-source"
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
				<span
					data-testid="diverged-verdict"
					className={
						view.diverged
							? "inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive"
							: "inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
					}
				>
					{view.diverged ? labels.divergedYes : labels.divergedNo}
				</span>
			</div>
			<p className="text-sm leading-relaxed text-muted-foreground">
				{labels.intro}
			</p>

			{d ? (
				<dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
					<div className="flex justify-between gap-4 border-b border-border/60 py-1">
						<dt className="text-muted-foreground">{labels.operationLabel}</dt>
						<dd className="font-mono text-[0.75rem] text-foreground">
							{d.operation}
						</dd>
					</div>
					<div className="flex justify-between gap-4 border-b border-border/60 py-1">
						<dt className="text-muted-foreground">{labels.kindLabel}</dt>
						<dd className="font-mono text-[0.75rem] text-foreground">
							{d.kind}
						</dd>
					</div>
					<div className="flex justify-between gap-4 border-b border-border/60 py-1">
						<dt className="text-muted-foreground">{labels.mirrorRefLabel}</dt>
						<dd className="font-mono text-[0.75rem] text-foreground">
							{d.mirrorRef}
						</dd>
					</div>
					<div className="flex justify-between gap-4 border-b border-border/60 py-1">
						<dt className="text-muted-foreground">{labels.callsLabel}</dt>
						<dd className="font-mono text-[0.75rem] text-foreground">
							{d.calls}
						</dd>
					</div>
					<div className="flex justify-between gap-4 border-b border-border/60 py-1">
						<dt className="text-muted-foreground">{labels.observedLabel}</dt>
						<dd className="font-mono text-[0.75rem] text-foreground">
							{d.observed}
						</dd>
					</div>
					<div className="flex justify-between gap-4 border-b border-border/60 py-1">
						<dt className="text-muted-foreground">{labels.expectedLabel}</dt>
						<dd className="font-mono text-[0.75rem] text-foreground">
							{d.expected}
						</dd>
					</div>
				</dl>
			) : null}

			<p className="text-xs text-muted-foreground">{labels.noKernelWrite}</p>
		</section>
	);
}
