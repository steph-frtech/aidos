import type { LiveReplayView } from "@/lib/mirror-replay-live";

/**
 * LiveMirrorReplay — the SHARED read-only "live mirror replay" section (S59 cutover), used by
 * both /mirror-health and /mirror-watch. It renders the mirror-runner's REPLAY verdict read
 * live through the gateway (mirror_replay): per living mirror, its last recorded status
 * (green/red) and regressed flag, plus the cliquet's overall verdict. A source badge
 * ("live"/"demo") and a deterministic demo replay (the green baseline) as the fallback.
 * READ-ONLY (the wall): mirror_replay writes only the append-only run-log; truth is never
 * written here. Server Component — the view arrives already decoded. Themed on ADR 0010
 * tokens; bilingual via next-intl (ADR 0011, labels passed in).
 */

interface Labels {
	heading: string;
	intro: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
	verdictLabel: string;
	verdictAllowed: string;
	verdictRejected: string;
	runIdLabel: string;
	resultsHeading: string;
	noResults: string;
	green: string;
	red: string;
}

export function LiveMirrorReplay({
	view,
	labels,
}: {
	view: LiveReplayView;
	labels: Labels;
}) {
	const isLive = view.source === "live";
	const allowed = view.verdict === "ALLOWED";
	return (
		<section
			aria-label={labels.heading}
			data-testid="live-replay"
			className="mt-10 space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				<span
					data-testid="replay-source"
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
					data-testid="replay-verdict"
					data-verdict={view.verdict}
					className={
						allowed
							? "inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
							: "inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive"
					}
				>
					{allowed ? labels.verdictAllowed : labels.verdictRejected}
				</span>
				<span className="font-mono text-[0.7rem] text-muted-foreground">
					{labels.runIdLabel} {view.runId}
				</span>
			</div>

			<div className="space-y-2">
				<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{labels.resultsHeading}
				</h3>
				{view.results.length === 0 ? (
					<p className="text-sm text-muted-foreground">{labels.noResults}</p>
				) : (
					<ul className="flex flex-wrap gap-2" data-testid="replay-results">
						{view.results.map((r) => {
							const ok = r.status === "green";
							return (
								<li
									key={r.mirrorId}
									data-status={r.status}
									data-regressed={r.regressed}
									className={
										ok
											? "inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 font-mono text-[0.7rem] text-emerald-600 dark:text-emerald-400"
											: "inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1 font-mono text-[0.7rem] text-destructive"
									}
								>
									<span
										aria-hidden="true"
										className={
											ok
												? "size-1.5 rounded-full bg-emerald-500"
												: "size-1.5 rounded-full bg-destructive"
										}
									/>
									{r.mirrorId}
									<span className="opacity-70">
										· {ok ? labels.green : labels.red}
									</span>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</section>
	);
}
