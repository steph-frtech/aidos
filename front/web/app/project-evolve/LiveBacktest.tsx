import type { LiveBacktestView } from "./liveActions";

/**
 * LiveBacktest — the read-only "live out-of-sample evaluation" section of the /project-evolve
 * panel (S59 cutover). It renders a variant's RECORDED out-of-sample score against the bar,
 * read live through the gateway (backtest_get, a CHEAP read of the recorded verdict), with a
 * source badge ("live"/"demo") and a deterministic demo evaluation as the fallback. READ-ONLY
 * (the wall): backtest_get stages no truth; the promotion is a PROPOSAL frozen at /goal. Server
 * Component — the view is passed in already decoded. Themed on ADR 0010 tokens; bilingual via
 * next-intl (ADR 0011, labels passed in).
 */

interface Labels {
	heading: string;
	intro: string;
	green: string;
	red: string;
	notEvaluated: string;
	variantLabel: string;
	scoreLabel: string;
	barLabel: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
}

export function LiveBacktest({
	view,
	labels,
}: {
	view: LiveBacktestView;
	labels: Labels;
}) {
	const isLive = view.source === "live";
	const evaluated = view.verdict !== "";
	const green = view.verdict === "green";
	const pct = Math.round(view.score * 100);
	const barPct = Math.round(view.bar * 100);
	return (
		<section
			aria-label={labels.heading}
			data-testid="live-backtest"
			className="mt-10 space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				<span
					data-testid="backtest-source"
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
					data-testid="backtest-verdict"
					data-verdict={view.verdict}
					className={
						!evaluated
							? "inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
							: green
								? "inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
								: "inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive"
					}
				>
					{!evaluated ? labels.notEvaluated : green ? labels.green : labels.red}
				</span>
				<span className="font-mono text-[0.7rem] text-muted-foreground">
					{labels.variantLabel} {view.variantId}
				</span>
			</div>

			{evaluated && (
				<dl className="grid grid-cols-2 gap-4 text-sm">
					<div className="space-y-0.5">
						<dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
							{labels.scoreLabel}
						</dt>
						<dd
							data-testid="backtest-score"
							className="font-mono tabular-nums text-foreground"
						>
							{pct}%
						</dd>
					</div>
					<div className="space-y-0.5">
						<dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
							{labels.barLabel}
						</dt>
						<dd className="font-mono tabular-nums text-muted-foreground">
							{barPct}%
						</dd>
					</div>
				</dl>
			)}
		</section>
	);
}
