import type { LiveIncidentsView } from "./actions";

/**
 * LiveIncidents — the read-only "live incidents board" section of the /incidents-to-ideas
 * panel (S59 cutover). It renders the active project's incidents read live through the
 * gateway (incident_list, dispatched telemetry-reader), with a source badge ("live"/"demo")
 * and the deterministic demo fixture as the fallback. READ-ONLY (the wall): an incident is
 * reality, never a truth — no version, no mirror; the only outward edge (/learn → a DRAFT
 * idea) never originates here. Server Component — the view is passed in already decoded.
 * Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011, labels passed in).
 */

interface Labels {
	heading: string;
	intro: string;
	empty: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
	refLabel: string;
	operationLabel: string;
	errorLabel: string;
	recurrenceLabel: string;
	causeSketchLabel: string;
	taintLabel: string;
	ideaLabel: string;
	notTruthMarker: string;
}

export function LiveIncidents({
	view,
	labels,
}: {
	view: LiveIncidentsView;
	labels: Labels;
}) {
	const isLive = view.source === "live";
	return (
		<section
			aria-label={labels.heading}
			data-testid="live-incidents"
			className="space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				<span
					data-testid="incidents-source"
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
				<span className="inline-flex items-center rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
					{labels.notTruthMarker}
				</span>
			</div>
			<p className="text-sm leading-relaxed text-muted-foreground">
				{labels.intro}
			</p>

			{view.incidents.length === 0 ? (
				<p className="text-sm text-muted-foreground">{labels.empty}</p>
			) : (
				<ul className="space-y-3">
					{view.incidents.map((inc) => (
						<li
							key={inc.id}
							data-testid="live-incident"
							className="space-y-2 rounded-lg border border-border/70 bg-background p-4"
						>
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-mono text-xs text-foreground">
									{inc.ref}
								</span>
								<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
									{labels.operationLabel}: {inc.operation || "—"}
								</span>
								<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
									{labels.recurrenceLabel}: {inc.recurrence}
								</span>
							</div>
							<p className="text-sm text-foreground">
								<span className="font-medium text-muted-foreground">
									{labels.errorLabel}:{" "}
								</span>
								{inc.error}
							</p>
							<p className="text-sm text-muted-foreground">
								<span className="font-medium">{labels.causeSketchLabel}: </span>
								{inc.causeSketch}
							</p>
							<div className="flex flex-wrap items-center gap-2">
								{inc.taint.map((tg) => (
									<span
										key={tg}
										className="inline-flex items-center rounded-full border border-border px-2 py-0.5 font-mono text-[0.7rem] text-muted-foreground"
									>
										{labels.taintLabel}: {tg}
									</span>
								))}
								{inc.ideaId ? (
									<span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
										{labels.ideaLabel}: {inc.ideaId}
									</span>
								) : null}
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
