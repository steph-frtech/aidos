"use client";

import { useState } from "react";
import { isStable, type LinkStatus, linkViews } from "@/lib/phase-stable";
import { CUT_CASES, type CutCase } from "@/lib/phase-stable-data";

/**
 * PhaseStablePanel — the action-capable /phase-stable panel (S23). It lets the human PICK one of
 * the canonical §43 cuts (empty / all-green / one-red-sensor / one-stale-link) and EVALUATE its
 * stability (the "is this a stable phase?" action, executable from the screen — not a static
 * display): it calls the same pure `isStable` the Go phases.IsStable / `aidos stable` compute, then
 * renders the cut — the constraint→version selection, each link coloured by its resolved status
 * (green = resolves, red = stale/absent), each sensor green/red — with a top-level STABLE/UNSTABLE
 * badge and the reasons list when unstable.
 *
 * THE DONE CRITERIA, visible & executable: the EMPTY cut shows STABLE (the base case); a cut with
 * one red sensor shows UNSTABLE and names the offending mirror; a stale link shows UNSTABLE and
 * names the offending link.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): the action computes + projects the verdict; it
 * NEVER writes truth and records no node (recording a phase node goes via the `aidos` writer role
 * inside a ChangeSet). The verdict is RENDERED, never re-implemented in the front-end. Themed on ADR
 * 0010 tokens; bilingual via next-intl (ADR 0011) — strings are passed in as labels.
 */

interface Labels {
	pickLabel: string;
	evaluateLabel: string;
	awaiting: string;
	stableBadge: string;
	unstableBadge: string;
	cutHeading: string;
	linksHeading: string;
	sensorsHeading: string;
	reasonsHeading: string;
	noConstraints: string;
	noLinks: string;
	noSensors: string;
	statusGreen: string;
	statusStale: string;
	statusAbsent: string;
	sensorGreen: string;
	sensorRed: string;
	cutNames: Record<string, string>;
}

const linkStatusBadge: Record<LinkStatus, string> = {
	green:
		"border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
	stale: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
	absent: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
};

export function PhaseStablePanel({ labels }: { labels: Labels }) {
	const [selectedId, setSelectedId] = useState<string>("");

	const cutCase: CutCase | null =
		CUT_CASES.find((c) => c.id === selectedId) ?? null;
	const phase = cutCase
		? isStable(cutCase.cut, cutCase.heads, cutCase.links, cutCase.sensors)
		: null;
	const links = cutCase ? linkViews(cutCase.links, cutCase.heads) : [];

	const linkStatusLabel = (s: LinkStatus): string =>
		s === "green"
			? labels.statusGreen
			: s === "stale"
				? labels.statusStale
				: labels.statusAbsent;

	return (
		<div className="space-y-6">
			{/* The action: pick a cut, evaluate stability */}
			<div className="flex flex-wrap items-end gap-3">
				<label className="flex flex-col gap-1.5 text-sm">
					<span className="font-medium text-foreground">
						{labels.pickLabel}
					</span>
					<select
						aria-label={labels.pickLabel}
						value={selectedId}
						onChange={(ev) => setSelectedId(ev.target.value)}
						className="min-w-64 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
					>
						<option value="">{labels.awaiting}</option>
						{CUT_CASES.map((c) => (
							<option key={c.id} value={c.id}>
								{labels.cutNames[c.labelKey] ?? c.id}
							</option>
						))}
					</select>
				</label>
				<span className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">
					{labels.evaluateLabel}
				</span>
			</div>

			{cutCase && phase ? (
				<section
					aria-label="phase-stable"
					data-testid="phase-stable"
					className="space-y-5 rounded-lg border border-border bg-card p-5"
				>
					{/* The top-level STABLE / UNSTABLE verdict badge */}
					{phase.stable ? (
						<span
							data-testid="verdict-badge"
							data-stable="true"
							className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400"
						>
							{labels.stableBadge}
						</span>
					) : (
						<span
							data-testid="verdict-badge"
							data-stable="false"
							className="inline-flex items-center rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-sm font-semibold text-red-600 dark:text-red-400"
						>
							{labels.unstableBadge}
						</span>
					)}

					{/* The cut: constraint → version selection */}
					<div className="space-y-2">
						<h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							{labels.cutHeading}
						</h3>
						{Object.keys(cutCase.cut).length === 0 ? (
							<p className="text-sm text-muted-foreground">
								{labels.noConstraints}
							</p>
						) : (
							<ul className="flex flex-wrap gap-2">
								{Object.entries(cutCase.cut).map(([constraint, version]) => (
									<li
										key={constraint}
										data-testid={`constraint-${constraint}`}
										className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 text-xs"
									>
										<span className="font-medium text-foreground">
											{constraint}
										</span>
										<code className="rounded bg-background px-1 text-muted-foreground">
											{version}
										</code>
									</li>
								))}
							</ul>
						)}
					</div>

					{/* The links: each coloured by its resolved status */}
					<div className="space-y-2">
						<h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							{labels.linksHeading}
						</h3>
						{links.length === 0 ? (
							<p className="text-sm text-muted-foreground">{labels.noLinks}</p>
						) : (
							<ul className="space-y-2">
								{links.map((lv) => {
									const ref = `${lv.link.from.id}@${lv.link.from.version}->${lv.link.to.id}@${lv.link.to.version}`;
									return (
										<li
											key={ref}
											data-testid={`link-${lv.link.from.id}-${lv.link.to.id}`}
											data-status={lv.status}
											className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2"
										>
											<span className="font-mono text-xs text-foreground">
												{ref}
											</span>
											<span
												className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${linkStatusBadge[lv.status]}`}
											>
												{linkStatusLabel(lv.status)}
											</span>
										</li>
									);
								})}
							</ul>
						)}
					</div>

					{/* The sensors: each green / red */}
					<div className="space-y-2">
						<h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							{labels.sensorsHeading}
						</h3>
						{cutCase.sensors.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								{labels.noSensors}
							</p>
						) : (
							<ul className="space-y-2">
								{cutCase.sensors.map((s) => (
									<li
										key={s.id}
										data-testid={`sensor-${s.id}`}
										data-pass={s.pass}
										className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2"
									>
										<span className="font-mono text-xs text-foreground">
											{s.id}
										</span>
										<span
											className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
												s.pass
													? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
													: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
											}`}
										>
											{s.pass ? labels.sensorGreen : labels.sensorRed}
										</span>
									</li>
								))}
							</ul>
						)}
					</div>

					{/* The reasons (when unstable): each offending link / sensor id */}
					{!phase.stable ? (
						<div className="space-y-2">
							<h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
								{labels.reasonsHeading}
							</h3>
							<ul data-testid="reasons" className="space-y-1.5">
								{phase.reasons.map((r) => (
									<li
										key={r}
										data-testid={`reason-${r}`}
										className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-1.5 font-mono text-xs text-red-600 dark:text-red-400"
									>
										{r}
									</li>
								))}
							</ul>
						</div>
					) : null}
				</section>
			) : null}
		</div>
	);
}
