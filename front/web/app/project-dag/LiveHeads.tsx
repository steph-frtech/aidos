import type { LiveHeadsView } from "./live";

/**
 * LiveHeads — the read-only "live current heads" section of the /project-dag panel (S59
 * cutover). It renders the version space's CURRENT head node ids read live through the
 * gateway (dag_heads), with a source badge ("live"/"demo") and a deterministic demo head
 * (the genesis baseline) as the fallback. READ-ONLY (the wall): dag_heads reads; the DAG
 * records ride the privileged dag writer (S24), never this screen. Server Component — the
 * view arrives already decoded. Themed on ADR 0010 tokens; bilingual via next-intl (ADR
 * 0011, labels passed in).
 */

interface Labels {
	heading: string;
	intro: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
	headsHeading: string;
	noHeads: string;
}

export function LiveHeads({
	view,
	labels,
}: {
	view: LiveHeadsView;
	labels: Labels;
}) {
	const isLive = view.source === "live";
	return (
		<section
			aria-label={labels.heading}
			data-testid="live-heads"
			className="mt-10 space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				<span
					data-testid="heads-source"
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

			<div className="space-y-2">
				<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{labels.headsHeading}
				</h3>
				{view.heads.length === 0 ? (
					<p className="text-sm text-muted-foreground">{labels.noHeads}</p>
				) : (
					<ul className="flex flex-wrap gap-2" data-testid="heads-list">
						{view.heads.map((h) => (
							<li
								key={h}
								className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-[0.7rem] text-primary"
							>
								<span
									aria-hidden="true"
									className="size-1.5 rounded-full bg-primary"
								/>
								{h}
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}
