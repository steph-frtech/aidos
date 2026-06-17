import type { LiveGardenView } from "./liveGardenActions";

/**
 * LiveGarden — the read-only "live per-project garden" section of the /kernel-debt panel (ADR
 * 0092 batch-2 kernel-garden flip). It renders the S112/§82.4 per-project KernelDebt the engine
 * actually computes, read live through the gateway (garden_tend_project + garden_suggest_trim):
 * the FIVE-rot ranked debt ledger and the open_idea_* trim plan. Source badge ("live"/"demo"),
 * deterministic demo garden/plan as the fallback. READ-ONLY (the wall): /trim PROPOSES, it never
 * deletes (deletesAnything is ALWAYS false); the only door is idea → mirror → /goal → human
 * approval. Server Component — the view is passed in already decoded. Themed on ADR 0010 tokens;
 * bilingual via next-intl (ADR 0011).
 */

interface Labels {
	heading: string;
	intro: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
	ledgerTitle: string;
	planTitle: string;
	emptyGarden: string;
	emptyPlan: string;
	targetLabel: string;
	severityLabel: string;
	requiresLabel: string;
	proposalBadge: string;
	noDeleteNote: string;
	countLabel: string;
}

function severityClass(sev: string): string {
	switch (sev) {
		case "high":
			return "bg-destructive/15 text-destructive border-destructive/30";
		case "medium":
			return "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400";
		default:
			return "bg-muted text-muted-foreground border-border";
	}
}

function SourceBadge({
	source,
	live,
	demo,
	liveTitle,
	demoTitle,
	testid,
}: {
	source: "live" | "demo";
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
	testid: string;
}) {
	const isLive = source === "live";
	return (
		<span
			data-testid={testid}
			data-source={source}
			className={
				isLive
					? "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
					: "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
			}
			title={isLive ? liveTitle : demoTitle}
		>
			<span
				aria-hidden="true"
				className={
					isLive
						? "size-1.5 rounded-full bg-primary"
						: "size-1.5 rounded-full bg-muted-foreground"
				}
			/>
			{isLive ? live : demo}
		</span>
	);
}

export function LiveGarden({
	view,
	labels,
}: {
	view: LiveGardenView;
	labels: Labels;
}) {
	const { garden, plan } = view;
	return (
		<section
			aria-label={labels.heading}
			data-testid="live-garden"
			className="mt-10 space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				<SourceBadge
					source={view.gardenSource}
					live={labels.live}
					demo={labels.demo}
					liveTitle={labels.liveTitle}
					demoTitle={labels.demoTitle}
					testid="garden-source"
				/>
			</div>
			<p className="text-sm leading-relaxed text-muted-foreground">
				{labels.intro}
			</p>

			<div className="grid gap-8 lg:grid-cols-2">
				{/* Garden ledger — the FIVE-rot ranked debt */}
				<div data-testid="garden-ledger">
					<h3 className="text-lg font-semibold text-foreground">
						{labels.ledgerTitle}{" "}
						<span className="text-sm font-normal text-muted-foreground">
							({labels.countLabel}: {garden.count})
						</span>
					</h3>
					{garden.items.length === 0 ? (
						<p
							data-testid="garden-empty"
							className="mt-4 rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground"
						>
							{labels.emptyGarden}
						</p>
					) : (
						<ul className="mt-4 space-y-2">
							{garden.items.map((it) => (
								<li
									key={it.id}
									data-testid="garden-item"
									data-kind={it.kind}
									className="rounded-lg border border-border bg-background p-3"
								>
									<div className="flex items-center justify-between gap-2">
										<code className="text-sm font-medium text-foreground">
											{labels.targetLabel}: {it.targetRef}
										</code>
										<span
											className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${severityClass(it.severity)}`}
										>
											{it.severity}
										</span>
									</div>
									<p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
										{it.kind}
									</p>
									<p className="mt-1 text-sm text-muted-foreground">
										{it.reason}
									</p>
								</li>
							))}
						</ul>
					)}
				</div>

				{/* Trim plan — proposals only, no delete affordance */}
				<div data-testid="garden-plan">
					<div className="flex flex-wrap items-center gap-3">
						<h3 className="text-lg font-semibold text-foreground">
							{labels.planTitle}
						</h3>
						<SourceBadge
							source={view.planSource}
							live={labels.live}
							demo={labels.demo}
							liveTitle={labels.liveTitle}
							demoTitle={labels.demoTitle}
							testid="garden-plan-source"
						/>
					</div>
					{plan.suggestions.length === 0 ? (
						<p
							data-testid="garden-plan-empty"
							className="mt-4 rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground"
						>
							{labels.emptyPlan}
						</p>
					) : (
						<ul className="mt-4 space-y-3">
							{plan.suggestions.map((s) => (
								<li
									key={s.debtItemRef}
									data-testid="garden-suggestion"
									className="rounded-lg border border-border bg-background p-4"
								>
									<div className="flex items-center justify-between gap-2">
										<code className="text-sm font-semibold text-blue-600 dark:text-blue-400">
											{s.proposedAction}
										</code>
										<span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
											{labels.proposalBadge}
										</span>
									</div>
									<p className="mt-2 text-sm text-muted-foreground">
										{s.rationale}
									</p>
									<p
										data-testid="garden-requires-door"
										className="mt-2 text-xs font-medium text-foreground"
									>
										{labels.requiresLabel}:{" "}
										<span className="text-blue-600 dark:text-blue-400">
											{s.requires}
										</span>
									</p>
								</li>
							))}
						</ul>
					)}
					<p className="mt-4 text-xs text-muted-foreground">
						{labels.noDeleteNote}
					</p>
				</div>
			</div>
		</section>
	);
}
