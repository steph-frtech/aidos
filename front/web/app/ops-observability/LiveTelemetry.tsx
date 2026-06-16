import type { LiveTelemetryView } from "./liveActions";

/**
 * LiveTelemetry — the read-only "live OpenTelemetry" section of the /ops-observability panel
 * (S59 cutover). It renders the active project's OTel spans + metrics landed in Postgres,
 * read live through the gateway (telemetry_query, dispatched telemetry-reader, SELECT-only),
 * with a source badge ("live"/"demo") and the deterministic demo fixture as the fallback.
 * READ-ONLY (the wall): the ops layer is RENDER, never a kernel on-ramp (the RealityMirror /
 * E12 is the single on-ramp). Server Component — the view is passed in already decoded.
 * Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */

interface Labels {
	heading: string;
	intro: string;
	empty: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
	spansHeading: string;
	metricsHeading: string;
	nameLabel: string;
	statusLabel: string;
	traceLabel: string;
	valueLabel: string;
}

export function LiveTelemetry({
	view,
	labels,
}: {
	view: LiveTelemetryView;
	labels: Labels;
}) {
	const isLive = view.source === "live";
	const empty = view.spans.length === 0 && view.metrics.length === 0;
	return (
		<section
			aria-label={labels.heading}
			data-testid="live-telemetry"
			className="mt-10 space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.heading}
				</h2>
				<span
					data-testid="telemetry-source"
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

			{empty ? (
				<p className="text-sm text-muted-foreground">{labels.empty}</p>
			) : (
				<div className="grid gap-6 sm:grid-cols-2">
					{/* Spans */}
					<div className="space-y-2">
						<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							{labels.spansHeading}
						</h3>
						<table className="w-full border-collapse text-left text-sm">
							<thead>
								<tr className="border-b border-border text-xs font-medium text-muted-foreground uppercase">
									<th className="py-2 pr-4">{labels.nameLabel}</th>
									<th className="py-2 pr-4">{labels.statusLabel}</th>
									<th className="py-2">{labels.traceLabel}</th>
								</tr>
							</thead>
							<tbody>
								{view.spans.map((s) => (
									<tr
										key={`${s.traceId}:${s.spanId}`}
										data-testid="live-span"
										className="border-b border-border/60"
									>
										<td className="py-2 pr-4 text-foreground">{s.name}</td>
										<td className="py-2 pr-4">
											<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
												{s.status}
											</span>
										</td>
										<td className="py-2 font-mono text-[0.7rem] text-muted-foreground">
											{s.traceId}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{/* Metrics */}
					<div className="space-y-2">
						<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							{labels.metricsHeading}
						</h3>
						<table className="w-full border-collapse text-left text-sm">
							<thead>
								<tr className="border-b border-border text-xs font-medium text-muted-foreground uppercase">
									<th className="py-2 pr-4">{labels.nameLabel}</th>
									<th className="py-2">{labels.valueLabel}</th>
								</tr>
							</thead>
							<tbody>
								{view.metrics.map((m) => (
									<tr
										key={m.name}
										data-testid="live-metric"
										className="border-b border-border/60"
									>
										<td className="py-2 pr-4 font-mono text-[0.7rem] text-foreground">
											{m.name}
										</td>
										<td className="py-2 text-foreground">{m.value}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</section>
	);
}
