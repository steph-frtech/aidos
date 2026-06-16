import type { LiveRatchetView } from "./liveActions";

/**
 * LiveRatchet — the read-only "live ratchet verdict" section of the /mirrors panel (S59
 * cutover). It renders the cliquet's CURRENT merge verdict (ALLOWED / REJECTED) read live
 * through the gateway (ratchet_check, a CHEAP baseline-comparison read), with a source badge
 * ("live"/"demo") and a deterministic demo verdict as the fallback. READ-ONLY (the wall):
 * ratchet_check writes only the append-only run-log; truth is never written here. Server
 * Component — the view is passed in already decoded. Themed on ADR 0010 tokens; bilingual via
 * next-intl (ADR 0011, labels passed in).
 */

interface Labels {
	heading: string;
	intro: string;
	allowed: string;
	rejected: string;
	regressedHeading: string;
	noRegression: string;
	runIdLabel: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
}

export function LiveRatchet({
	view,
	labels,
}: {
	view: LiveRatchetView;
	labels: Labels;
}) {
	const isLive = view.source === "live";
	const allowed = view.verdict === "ALLOWED";
	return (
		<section
			aria-label={labels.heading}
			data-testid="live-ratchet"
			className="mt-10 space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				<span
					data-testid="ratchet-source"
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

			<div className="flex flex-wrap items-center gap-3">
				<span
					data-testid="ratchet-verdict"
					data-verdict={view.verdict}
					className={
						allowed
							? "inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
							: "inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive"
					}
				>
					{allowed ? labels.allowed : labels.rejected}
				</span>
				<span className="font-mono text-[0.7rem] text-muted-foreground">
					{labels.runIdLabel} {view.runId}
				</span>
			</div>

			{view.regressed.length === 0 ? (
				<p className="text-sm text-muted-foreground">{labels.noRegression}</p>
			) : (
				<div className="space-y-2">
					<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						{labels.regressedHeading}
					</h3>
					<ul
						className="flex flex-wrap gap-2"
						data-testid="ratchet-regressed-list"
					>
						{view.regressed.map((m) => (
							<li
								key={m}
								className="inline-flex items-center rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1 font-mono text-[0.7rem] text-destructive"
							>
								{m}
							</li>
						))}
					</ul>
				</div>
			)}
		</section>
	);
}
