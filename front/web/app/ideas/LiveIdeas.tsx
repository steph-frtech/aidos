import type { Status } from "@/lib/ideas";
import type { LiveIdeasView } from "./actions";

/**
 * LiveIdeas — the read-only "live idea board" section of the /ideas panel (S59 cutover). It
 * renders the active project's candidate-truth Ideas read live through the gateway
 * (idea_list), with a source badge ("live"/"demo") and the deterministic demo board as the
 * fallback. READ-ONLY (the wall): a capture/advance/promotion never originates here — the
 * idea-intake MCP (above the freeze) and the ChangeSet path (kernel) own the writes.
 * Server Component — the view arrives already decoded. Themed on ADR 0010 tokens; bilingual
 * via next-intl (ADR 0011, labels passed in).
 */

interface Labels {
	heading: string;
	intro: string;
	empty: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
	idLabel: string;
	statusLabel: string;
	proposesLabel: string;
	intentLabel: string;
	provenanceLabel: string;
	laneNames: Record<Status, string>;
	sourceNames: { human: string; incident: string };
}

export function LiveIdeas({
	view,
	labels,
}: {
	view: LiveIdeasView;
	labels: Labels;
}) {
	const isLive = view.source === "live";
	return (
		<section
			aria-label={labels.heading}
			data-testid="live-ideas"
			className="space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				<span
					data-testid="ideas-source"
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

			{view.ideas.length === 0 ? (
				<p className="text-sm text-muted-foreground">{labels.empty}</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full border-collapse text-left text-sm">
						<thead>
							<tr className="border-b border-border text-xs font-medium text-muted-foreground uppercase">
								<th className="py-2 pr-4">{labels.idLabel}</th>
								<th className="py-2 pr-4">{labels.statusLabel}</th>
								<th className="py-2 pr-4">{labels.proposesLabel}</th>
								<th className="py-2 pr-4">{labels.intentLabel}</th>
								<th className="py-2">{labels.provenanceLabel}</th>
							</tr>
						</thead>
						<tbody>
							{view.ideas.map((idea) => (
								<tr
									key={idea.id}
									data-testid={`live-idea-${idea.id}`}
									data-status={idea.status}
									className="border-b border-border/60"
								>
									<td className="py-2 pr-4 font-mono text-[0.7rem] text-foreground">
										{idea.id}
									</td>
									<td className="py-2 pr-4">
										<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
											{labels.laneNames[idea.status]}
										</span>
									</td>
									<td className="py-2 pr-4 font-mono text-[0.7rem] text-muted-foreground">
										{idea.proposes}
									</td>
									<td className="py-2 pr-4 text-foreground">{idea.intent}</td>
									<td className="py-2 text-[0.7rem] text-muted-foreground">
										{labels.sourceNames[idea.provenance.source] ??
											idea.provenance.source}{" "}
										— <span className="italic">{idea.provenance.detail}</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}
