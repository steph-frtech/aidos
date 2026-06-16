import type { LivePactView } from "./liveActions";

/**
 * LivePact — the read-only "live contract verification" section of the /cell-federation panel
 * (S59 cutover). It renders the provider-verification verdict for a cell's PUBLIC contract,
 * read live through the gateway (pact_verify, a CHEAP in-process httptest check), with a source
 * badge ("live"/"demo") and a deterministic demo verdict as the fallback. READ-ONLY (the wall):
 * pact_verify stages no truth; the Context-Map persists via a ChangeSet, never here. Server
 * Component — the view is passed in already decoded. Themed on ADR 0010 tokens; bilingual via
 * next-intl (ADR 0011, labels passed in).
 */

interface Labels {
	heading: string;
	intro: string;
	pass: string;
	fail: string;
	operationLabel: string;
	routeLabel: string;
	interactionsHeading: string;
	noInteractions: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
}

export function LivePact({
	view,
	labels,
}: {
	view: LivePactView;
	labels: Labels;
}) {
	const isLive = view.source === "live";
	return (
		<section
			aria-label={labels.heading}
			data-testid="live-pact"
			className="mt-10 space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				<span
					data-testid="pact-source"
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
					data-testid="pact-verdict"
					data-pass={view.pass}
					className={
						view.pass
							? "inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
							: "inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive"
					}
				>
					{view.pass ? labels.pass : labels.fail}
				</span>
				<span className="font-mono text-[0.7rem] text-muted-foreground">
					{labels.operationLabel} {view.operation}
				</span>
				<span className="font-mono text-[0.7rem] text-muted-foreground">
					{labels.routeLabel} {view.method} {view.route}
				</span>
			</div>

			<p className="text-sm leading-relaxed text-muted-foreground">
				{view.reason}
			</p>

			{view.interactions.length === 0 ? (
				<p className="text-sm text-muted-foreground">{labels.noInteractions}</p>
			) : (
				<div className="space-y-2">
					<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						{labels.interactionsHeading}
					</h3>
					<ul className="space-y-1.5" data-testid="pact-interactions-list">
						{view.interactions.map((i) => (
							<li
								key={i}
								className="rounded-lg border border-border bg-muted px-3 py-1.5 font-mono text-[0.7rem] text-foreground"
							>
								{i}
							</li>
						))}
					</ul>
				</div>
			)}
		</section>
	);
}
