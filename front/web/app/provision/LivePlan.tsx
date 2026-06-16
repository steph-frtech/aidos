import type { LivePlanView } from "./liveActions";

/**
 * LivePlan — the read-only "live datastore plan" section of the /provision panel (S59
 * cutover). It renders the LIVE planner's plan over a fixed demo Spec, read live through the
 * gateway (plan, dispatched provision), with a source badge ("live"/"demo") and the
 * deterministic demo plan as the fallback. READ-ONLY (the wall): `plan` writes nothing (the
 * Plan is a record); the StackManifest truth-write is refused before dispatch. Server
 * Component — the view is passed in already decoded. Themed (ADR 0010), bilingual (ADR 0011).
 */

interface Labels {
	heading: string;
	intro: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
	targetLabel: string;
	imageLabel: string;
	databaseLabel: string;
	namespaceLabel: string;
	reasonsLabel: string;
	noTruthWrite: string;
}

export function LivePlan({
	view,
	labels,
}: {
	view: LivePlanView;
	labels: Labels;
}) {
	const isLive = view.source === "live";
	const p = view.plan;
	return (
		<section
			aria-label={labels.heading}
			data-testid="live-plan"
			className="mt-10 space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				<span
					data-testid="plan-source"
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

			<dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
				<div className="flex justify-between gap-4 border-b border-border/60 py-1">
					<dt className="text-muted-foreground">{labels.targetLabel}</dt>
					<dd className="font-mono text-[0.75rem] text-foreground">
						{p.target}
					</dd>
				</div>
				<div className="flex justify-between gap-4 border-b border-border/60 py-1">
					<dt className="text-muted-foreground">{labels.imageLabel}</dt>
					<dd className="font-mono text-[0.75rem] text-foreground">
						{p.image}
					</dd>
				</div>
				<div className="flex justify-between gap-4 border-b border-border/60 py-1">
					<dt className="text-muted-foreground">{labels.databaseLabel}</dt>
					<dd className="font-mono text-[0.75rem] text-foreground">
						{p.database}
					</dd>
				</div>
				<div className="flex justify-between gap-4 border-b border-border/60 py-1">
					<dt className="text-muted-foreground">{labels.namespaceLabel}</dt>
					<dd className="font-mono text-[0.75rem] text-foreground">
						{p.namespace}
					</dd>
				</div>
			</dl>

			{p.reasons.length > 0 ? (
				<div className="space-y-1">
					<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						{labels.reasonsLabel}
					</h3>
					<ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
						{p.reasons.map((r) => (
							<li key={r}>{r}</li>
						))}
					</ul>
				</div>
			) : null}

			<p className="text-xs text-muted-foreground">{labels.noTruthWrite}</p>
		</section>
	);
}
