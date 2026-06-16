import type { LiveEnvelopesView } from "./actions";

/**
 * LiveEnvelopes — the read-only "live ChangeSet journal" section of the /changeset panel
 * (S59 cutover). It renders the active project's envelope list read live through the
 * gateway (changeset_list), with a source badge ("live"/"demo") and the deterministic demo
 * fixture as the fallback. READ-ONLY (the wall): a real apply/revert never originates here.
 * Server Component — the view is passed in already decoded. Themed on ADR 0010 tokens;
 * bilingual via next-intl (ADR 0011, labels passed in).
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
	labelLabel: string;
	statusLabel: string;
	parentPhaseLabel: string;
	revertsLabel: string;
}

export function LiveEnvelopes({
	view,
	labels,
}: {
	view: LiveEnvelopesView;
	labels: Labels;
}) {
	const isLive = view.source === "live";
	return (
		<section
			aria-label={labels.heading}
			data-testid="live-envelopes"
			className="space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				<span
					data-testid="changeset-source"
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

			{view.envelopes.length === 0 ? (
				<p className="text-sm text-muted-foreground">{labels.empty}</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full border-collapse text-left text-sm">
						<thead>
							<tr className="border-b border-border text-xs font-medium text-muted-foreground uppercase">
								<th className="py-2 pr-4">{labels.idLabel}</th>
								<th className="py-2 pr-4">{labels.labelLabel}</th>
								<th className="py-2 pr-4">{labels.statusLabel}</th>
								<th className="py-2 pr-4">{labels.parentPhaseLabel}</th>
								<th className="py-2">{labels.revertsLabel}</th>
							</tr>
						</thead>
						<tbody>
							{view.envelopes.map((e) => (
								<tr key={e.id} className="border-b border-border/60">
									<td className="py-2 pr-4 font-mono text-[0.7rem] text-foreground">
										{e.id}
									</td>
									<td className="py-2 pr-4 text-foreground">{e.label}</td>
									<td className="py-2 pr-4">
										<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
											{e.status}
										</span>
									</td>
									<td className="py-2 pr-4 font-mono text-[0.7rem] text-muted-foreground">
										{e.parentPhase}
									</td>
									<td className="py-2 font-mono text-[0.7rem] text-muted-foreground">
										{e.reverts ?? "—"}
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
