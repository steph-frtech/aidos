"use client";

import { useState } from "react";

/**
 * ProofLevelsExplorer — a simple, interactive N0→N5 ladder. Click a level and see its
 * proof language: what it proves, the proof FORM (the mirror / cert_language), and WHO
 * certifies (human-anchored above the waterline, AI self-certified below). A waterline
 * divider sits between N2 and N3. It teaches by trying choices; it writes no truth.
 *
 * Client component (selection only); strings arrive translated from the server (next-intl,
 * ADR 0011), design tokens only (ADR 0010).
 */
export type Level = {
	key: string;
	level: string;
	name: string;
	proves: string;
	form: string;
	cert: string;
	verdict: string;
	pos: "above" | "below";
};

export type ProofLabels = {
	pick: string;
	waterline: string;
	fProves: string;
	fForm: string;
	fCert: string;
	fVerdict: string;
	above: string;
	below: string;
	proseNote: string;
};

export function ProofLevelsExplorer({
	levels,
	labels,
}: {
	levels: Level[];
	labels: ProofLabels;
}) {
	const [selected, setSelected] = useState<string>(levels[0]?.key ?? "n0");

	function Card({ lv }: { lv: Level }) {
		const active = selected === lv.key;
		const above = lv.pos === "above";
		return (
			<button
				type="button"
				data-testid={`level-card-${lv.key}`}
				aria-expanded={active}
				onClick={() => setSelected(lv.key)}
				className={
					active
						? "w-full rounded-xl border-2 border-primary/50 bg-card p-4 text-left shadow-sm transition-colors"
						: "w-full rounded-xl border border-border bg-card/60 p-4 text-left transition-colors hover:bg-card hover:border-primary/30"
				}
			>
				<div className="flex flex-wrap items-center gap-2">
					<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary tabular-nums">
						{lv.level}
					</span>
					<span className="font-semibold text-card-foreground">{lv.name}</span>
					<span
						className={
							above
								? "ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-primary"
								: "ml-auto rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground"
						}
					>
						{above ? labels.above : labels.below}
					</span>
				</div>

				{active ? (
					<dl
						data-testid={`level-detail-${lv.key}`}
						className="mt-3 space-y-2 border-t border-border pt-3 text-sm"
					>
						<div>
							<dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
								{labels.fProves}
							</dt>
							<dd className="text-card-foreground">{lv.proves}</dd>
						</div>
						<div>
							<dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
								{labels.fForm}
							</dt>
							<dd className="text-card-foreground">{lv.form}</dd>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
								{labels.fCert}
							</dt>
							<dd>
								<code
									data-testid={`level-cert-${lv.key}`}
									className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-primary"
								>
									{lv.cert}
								</code>
							</dd>
						</div>
						<div>
							<dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
								{labels.fVerdict}
							</dt>
							<dd className="text-muted-foreground">{lv.verdict}</dd>
						</div>
					</dl>
				) : (
					<p className="mt-1 truncate text-xs text-muted-foreground">
						{lv.proves}
					</p>
				)}
			</button>
		);
	}

	const above = levels.filter((l) => l.pos === "above");
	const below = levels.filter((l) => l.pos === "below");

	return (
		<section data-testid="proof-levels-explorer" className="space-y-3">
			<p className="text-sm text-muted-foreground">{labels.pick}</p>

			{above.map((lv) => (
				<Card key={lv.key} lv={lv} />
			))}

			{/* Waterline divider between N2 and N3 */}
			<div
				data-testid="waterline"
				className="my-2 flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-[0.7rem] font-semibold text-primary-foreground"
			>
				{labels.waterline}
			</div>

			{below.map((lv) => (
				<Card key={lv.key} lv={lv} />
			))}

			<p className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
				{labels.proseNote}
			</p>
		</section>
	);
}
