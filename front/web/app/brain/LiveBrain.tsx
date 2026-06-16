import type { MemoryItem } from "@/lib/workbench-graph-data";
import type { LiveBrainView } from "./actions";

/**
 * LiveBrain — the read-only "live memory" section of the /brain cockpit (S59 cutover). It
 * renders the active project's brain MemoryItems read live through the gateway
 * (memory_recall), with a source badge ("live"/"demo") and the deterministic demo memory as
 * the fallback. READ-ONLY (the wall): a memory WRITE never originates here — the memory
 * firewall rides ViaIdea, never ToKernel. Server Component — the view arrives already
 * decoded. Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011, labels passed in).
 */

interface Labels {
	heading: string;
	intro: string;
	empty: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
	kindNames: Record<MemoryItem["kind"], string>;
}

export function LiveBrain({
	view,
	labels,
}: {
	view: LiveBrainView;
	labels: Labels;
}) {
	const isLive = view.source === "live";
	return (
		<section
			aria-label={labels.heading}
			data-testid="live-brain"
			className="mt-10 space-y-4"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				<span
					data-testid="brain-source"
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

			{view.memory.length === 0 ? (
				<p className="text-sm text-muted-foreground">{labels.empty}</p>
			) : (
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{view.memory.map((m) => (
						<div
							key={m.id}
							data-testid={`live-memory-${m.id}`}
							className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
						>
							<div className="flex items-center justify-between gap-2">
								<span className="font-mono text-xs font-semibold text-card-foreground">
									{m.id}
								</span>
								<span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
									{labels.kindNames[m.kind]}
								</span>
							</div>
							<p className="text-sm leading-relaxed text-muted-foreground">
								{m.summary}
							</p>
							<span className="mt-1 inline-flex w-fit rounded-full border border-border bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
								{m.taint}
							</span>
						</div>
					))}
				</div>
			)}
		</section>
	);
}
