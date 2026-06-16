import type { LiveMutationView } from "./liveActions";

/**
 * LiveMutation — the read-only "live mutation verdict" section of the /kernel-debt panel
 * (S59 cutover, ADR 0092 kill-twins batch). It renders the engine's §40 densimètre run read live
 * through the gateway (run_mutation): the verdict, the score vs the declared threshold, and the
 * surviving mutants (the third debt category, from the engine). Source badge ("live"/"demo"),
 * deterministic demo verdict as the fallback. READ-ONLY (the wall): /trim PROPOSES, it never
 * deletes; the agent is graded by the bar, never authors it. Server Component — the view is
 * passed in already decoded. Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */

interface Labels {
	heading: string;
	intro: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
	verdictLabel: string;
	scoreLabel: string;
	thresholdLabel: string;
	survivorsLabel: string;
	noSurvivors: string;
	blockLabel: string;
}

export function LiveMutation({
	view,
	labels,
}: {
	view: LiveMutationView;
	labels: Labels;
}) {
	const isLive = view.source === "live";
	const passed = view.verdict.toLowerCase() === "passed";
	return (
		<section
			aria-label={labels.heading}
			data-testid="live-mutation"
			className="mt-10 space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				<span
					data-testid="mutation-source"
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

			<div className="flex flex-wrap items-center gap-2">
				<span
					data-testid="mutation-verdict"
					className={
						passed
							? "inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
							: "inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive"
					}
				>
					{labels.verdictLabel}: {view.verdict}
				</span>
				<span className="font-mono text-[0.7rem] text-muted-foreground">
					{labels.scoreLabel}: {view.score.toFixed(2)}
				</span>
				<span className="font-mono text-[0.7rem] text-muted-foreground">
					{labels.thresholdLabel}: {view.threshold.toFixed(2)}
				</span>
				{view.blockCode ? (
					<span className="font-mono text-[0.7rem] text-destructive">
						{labels.blockLabel}: {view.blockCode}
					</span>
				) : null}
			</div>

			<div className="space-y-2">
				<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{labels.survivorsLabel}
				</p>
				{view.survivingMutants.length === 0 ? (
					<p className="text-sm text-muted-foreground">{labels.noSurvivors}</p>
				) : (
					<ul className="space-y-1" data-testid="mutation-survivors">
						{view.survivingMutants.map((m) => (
							<li
								key={`${m.file}:${m.line}:${m.operator}`}
								className="font-mono text-[0.7rem] text-muted-foreground"
							>
								{m.file}:{m.line} · {m.operator}
								{m.gap ? <span className="opacity-70"> — {m.gap}</span> : null}
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}
