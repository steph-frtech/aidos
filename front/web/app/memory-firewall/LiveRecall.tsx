import type { LiveRecallView } from "./liveActions";

/**
 * LiveRecall — the read-only "live recalled memories" section of the /memory-firewall panel
 * (S59 cutover, ADR 0092 kill-twins batch). It renders the memories the firewall governs, read
 * live through the gateway (memory_recall): per hit the kind, the content, the provenance, the
 * taint markers and the score — the carburant the firewall lets PROPOSE but NEVER declare truth.
 * Source badge ("live"/"demo"), deterministic demo hits as the fallback. READ-ONLY (the wall):
 * "la mémoire propose ; le noyau déclare le vrai". Server Component — the view is passed in
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
	kindLabel: string;
	provenanceLabel: string;
	taintLabel: string;
	scoreLabel: string;
	noTaint: string;
}

export function LiveRecall({
	view,
	labels,
}: {
	view: LiveRecallView;
	labels: Labels;
}) {
	const isLive = view.source === "live";
	return (
		<section
			aria-label={labels.heading}
			data-testid="live-recall"
			className="space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				<span
					data-testid="recall-source"
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

			{view.hits.length === 0 ? (
				<p className="text-sm text-muted-foreground">{labels.empty}</p>
			) : (
				<ul className="space-y-3" data-testid="live-recall-list">
					{view.hits.map((h) => (
						<li
							key={h.id}
							className="space-y-1.5 rounded-lg border border-border/60 bg-muted/40 p-3"
						>
							<div className="flex flex-wrap items-center gap-2">
								<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
									{labels.kindLabel}: {h.kind}
								</span>
								<span className="font-mono text-[0.7rem] text-muted-foreground">
									{labels.scoreLabel}: {h.score.toFixed(2)}
								</span>
							</div>
							<p className="text-sm text-foreground">{h.content}</p>
							<p className="text-xs text-muted-foreground">
								{labels.provenanceLabel}: {h.provenance}
							</p>
							<div className="flex flex-wrap items-center gap-1.5">
								<span className="text-xs text-muted-foreground">
									{labels.taintLabel}:
								</span>
								{h.taint.length === 0 ? (
									<span className="text-xs text-muted-foreground">
										{labels.noTaint}
									</span>
								) : (
									h.taint.map((t) => (
										<span
											key={t}
											className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 font-mono text-[0.65rem] font-medium text-destructive"
										>
											{t}
										</span>
									))
								)}
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
