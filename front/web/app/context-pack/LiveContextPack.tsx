import type { LiveContextPackView } from "./actions";

/**
 * LiveContextPack — the read-only "live compiled pack" section of the /context-pack panel
 * (S59 cutover). It renders the active project's compiled ContextPack summary read live
 * through the gateway (context_pack_get) — goal, branch, affected layers, the wall boundaries,
 * the stop condition and the content-address hash — with a source badge ("live"/"demo") and
 * the deterministic demo pack (the pure twin compile()) as the fallback. READ-ONLY (the
 * wall): the pack ALWAYS forbids /kernel/** /mirror/**; a truth-write never originates here.
 * Server Component — the view arrives already decoded. Themed on ADR 0010 tokens; bilingual
 * via next-intl (ADR 0011, labels passed in).
 */

interface Labels {
	heading: string;
	intro: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
	goalLabel: string;
	branchLabel: string;
	affectedLayers: string;
	allowedPaths: string;
	forbiddenPaths: string;
	stopCondition: string;
	packHash: string;
}

export function LiveContextPack({
	view,
	labels,
}: {
	view: LiveContextPackView;
	labels: Labels;
}) {
	const isLive = view.source === "live";
	return (
		<section
			aria-label={labels.heading}
			data-testid="live-context-pack"
			className="space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				<span
					data-testid="context-pack-source"
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

			<dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
				<div className="space-y-1">
					<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{labels.goalLabel}
					</dt>
					<dd className="font-mono text-[0.75rem] text-foreground">
						{view.goal}
					</dd>
				</div>
				<div className="space-y-1">
					<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{labels.branchLabel}
					</dt>
					<dd className="font-mono text-[0.75rem] text-foreground">
						{view.branch}
					</dd>
				</div>
				<div className="space-y-1 sm:col-span-2">
					<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{labels.affectedLayers}
					</dt>
					<dd className="flex flex-wrap gap-1.5">
						{view.affectedLayers.map((l) => (
							<span
								key={l}
								className="inline-flex rounded-full bg-muted px-2 py-0.5 font-mono text-[0.7rem] text-muted-foreground"
							>
								{l}
							</span>
						))}
					</dd>
				</div>
				<div className="space-y-1">
					<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{labels.allowedPaths}
					</dt>
					<dd className="flex flex-wrap gap-1.5">
						{view.allowedPaths.map((p) => (
							<span
								key={p}
								className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[0.7rem] text-emerald-600 dark:text-emerald-400"
							>
								{p}
							</span>
						))}
					</dd>
				</div>
				<div className="space-y-1">
					<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{labels.forbiddenPaths}
					</dt>
					<dd className="flex flex-wrap gap-1.5">
						{view.forbiddenPaths.map((p) => (
							<span
								key={p}
								className="inline-flex rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 font-mono text-[0.7rem] text-destructive"
							>
								{p}
							</span>
						))}
					</dd>
				</div>
				<div className="space-y-1 sm:col-span-2">
					<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{labels.stopCondition}
					</dt>
					<dd className="font-mono text-[0.7rem] text-muted-foreground">
						{view.stopCondition}
					</dd>
				</div>
				<div className="space-y-1 sm:col-span-2">
					<dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{labels.packHash}
					</dt>
					<dd
						data-testid="context-pack-hash"
						className="font-mono text-[0.7rem] text-foreground"
					>
						{view.hash}
					</dd>
				</div>
			</dl>
		</section>
	);
}
