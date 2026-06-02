"use client";

import { useState } from "react";
import {
	type BlockReason,
	checkSpikeWrite,
	type DraftTruthProposal,
	type GrillVerdict,
	harvest,
	routeVerdict,
} from "@/lib/exploration";
import {
	SPIKE_DISCOVERY,
	SPIKE_WRITES,
	SPIKING_IDEA,
} from "@/lib/exploration-data";
import type { Status } from "@/lib/ideas";

/**
 * ExplorationPanel — the action-capable /exploration "Grill & Spike Lab" (S28). The human RUNS the
 * three §75 gestures FROM THE SCREEN, calling the SAME pure deciders the Go engine computes
 * (back/runtime/exploration):
 *   - GRILL a draft on a verdict ⇒ routeVerdict (sharp→grilled, fuzzy→spiking, bad→rejected, traced);
 *   - SPIKE writes ⇒ checkSpikeWrite (a /spike write allowed; a /kernel write RED with
 *     SPIKE_WRITE_ESCAPES_ZONE + how_to_fix) — confinement made visible;
 *   - HARVEST a spiking idea ⇒ harvest, producing the DRAFT-Truth proposal card (no frozen version,
 *     no mirror; promotion needs /goal).
 *
 * READ-ONLY against truth (CLAUDE.md §7 ui-completeness, the wall): the gesture machine + verdicts
 * are RENDERED, never re-implemented as truth here; recording an Idea transition rides the
 * idea-intake MCP (ideas schema, above the wall), and a promotion of a DRAFT Truth writes the kernel
 * via /goal under the aidos writer role — never a write from this screen. Themed (ADR 0010),
 * bilingual (ADR 0011) — labels passed in.
 */

interface Labels {
	statusNames: Record<Status, string>;
	lifecycleHeading: string;
	grillHeading: string;
	grillSharp: string;
	grillFuzzy: string;
	grillBad: string;
	routedTo: string;
	ratchetBadge: string;
	spikeHeading: string;
	runSpikeWrites: string;
	writeAllowed: string;
	writeBlocked: string;
	howToFixLabel: string;
	harvestHeading: string;
	runHarvest: string;
	draftTruthHeading: string;
	draftTruthCaveat: string;
	proposesLabel: string;
	intentLabel: string;
	noVersionMarker: string;
	noMirrorMarker: string;
	provenanceLinkLabel: string;
}

const statusAccent: Record<Status, string> = {
	draft: "border-zinc-500/40 bg-zinc-500/10 text-zinc-500 dark:text-zinc-400",
	grilled: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400",
	spiking:
		"border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
	harvested:
		"border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	rejected: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
};

const TRACK: Status[] = ["draft", "grilled", "spiking", "harvested"];

function StatusBadge({
	status,
	label,
	testid,
}: {
	status: Status;
	label: string;
	testid?: string;
}) {
	return (
		<span
			data-testid={testid}
			data-status={status}
			className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusAccent[status]}`}
		>
			{label}
		</span>
	);
}

export function ExplorationPanel({ labels }: { labels: Labels }) {
	const [routed, setRouted] = useState<Status | null>(null);
	const [spikeResults, setSpikeResults] = useState<
		{ path: string; block: BlockReason | null }[] | null
	>(null);
	const [proposal, setProposal] = useState<DraftTruthProposal | null>(null);

	function runGrill(verdict: GrillVerdict) {
		// routeVerdict is pure on the verdict (the lab grills the example draft ideas
		// FUZZY_IDEA / SHARP_IDEA / BAD_IDEA into exactly this status).
		setRouted(routeVerdict(verdict));
	}

	function runSpikeWrites() {
		setSpikeResults(
			SPIKE_WRITES.map((w) => ({ path: w.path, block: checkSpikeWrite(w) })),
		);
	}

	function runHarvest() {
		const { proposal: p } = harvest(SPIKING_IDEA, SPIKE_DISCOVERY);
		setProposal(p);
	}

	return (
		<div className="space-y-10" data-testid="exploration-panel">
			{/* The lifecycle track. */}
			<section className="space-y-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.lifecycleHeading}
				</h2>
				<div
					className="flex flex-wrap items-center gap-2"
					data-testid="lifecycle-track"
				>
					{TRACK.map((s, i) => (
						<div key={s} className="flex items-center gap-2">
							<StatusBadge status={s} label={labels.statusNames[s]} />
							{i < TRACK.length - 1 ? (
								<span className="text-muted-foreground">→</span>
							) : null}
						</div>
					))}
					<span className="text-muted-foreground">·</span>
					<StatusBadge status="rejected" label={labels.statusNames.rejected} />
				</div>
			</section>

			{/* GRILL — run a verdict, see the routing. */}
			<section className="space-y-3">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.grillHeading}
				</h2>
				<div className="flex flex-wrap gap-3">
					<button
						type="button"
						data-testid="grill-sharp"
						onClick={() => runGrill("sharp")}
						className="inline-flex items-center rounded-md border border-blue-600/40 bg-blue-600/10 px-3 py-1.5 text-sm font-medium text-blue-700 transition hover:bg-blue-600/20 dark:text-blue-300"
					>
						{labels.grillSharp}
					</button>
					<button
						type="button"
						data-testid="grill-fuzzy"
						onClick={() => runGrill("fuzzy")}
						className="inline-flex items-center rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-700 transition hover:bg-amber-500/20 dark:text-amber-300"
					>
						{labels.grillFuzzy}
					</button>
					<button
						type="button"
						data-testid="grill-bad"
						onClick={() => runGrill("bad")}
						className="inline-flex items-center rounded-md border border-red-600/40 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-500/20 dark:text-red-300"
					>
						{labels.grillBad}
					</button>
				</div>
				{routed ? (
					<div
						data-testid="grill-routed"
						className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm"
					>
						<span className="text-muted-foreground">{labels.routedTo}</span>
						<StatusBadge
							status={routed}
							label={labels.statusNames[routed]}
							testid="routed-status"
						/>
						{routed === "spiking" ? (
							<span
								data-testid="ratchet-badge"
								className="inline-flex items-center rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
							>
								{labels.ratchetBadge}
							</span>
						) : null}
					</div>
				) : null}
			</section>

			{/* SPIKE — run the confined and escaping writes. */}
			<section className="space-y-3">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.spikeHeading}
				</h2>
				<button
					type="button"
					data-testid="run-spike-writes"
					onClick={runSpikeWrites}
					className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted"
				>
					{labels.runSpikeWrites}
				</button>
				{spikeResults ? (
					<ul className="space-y-2" data-testid="spike-writes">
						{spikeResults.map((r) => (
							<li
								key={r.path}
								data-testid={`spike-write-${r.block ? "blocked" : "allowed"}`}
								className={`space-y-2 rounded-xl border px-4 py-3 text-sm ${
									r.block
										? "border-red-500/50 bg-red-500/10"
										: "border-emerald-500/50 bg-emerald-500/10"
								}`}
							>
								<p className="flex flex-wrap items-center gap-2">
									<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
										{r.path}
									</code>
									{r.block ? (
										<>
											<span className="font-semibold text-red-700 dark:text-red-300">
												{labels.writeBlocked}
											</span>
											<code
												data-testid="block-code"
												className="rounded bg-red-500/20 px-1.5 py-0.5 font-mono text-xs"
											>
												{r.block.code}
											</code>
										</>
									) : (
										<span className="font-semibold text-emerald-700 dark:text-emerald-300">
											{labels.writeAllowed}
										</span>
									)}
								</p>
								{r.block ? (
									<div className="space-y-1">
										<p className="text-xs font-medium text-red-700 dark:text-red-300">
											{labels.howToFixLabel}
										</p>
										<ol className="list-decimal space-y-0.5 pl-5 text-xs text-red-700/90 dark:text-red-300/90">
											{r.block.howToFix.map((fix) => (
												<li key={fix} data-testid="how-to-fix-item">
													{fix}
												</li>
											))}
										</ol>
									</div>
								) : null}
							</li>
						))}
					</ul>
				) : null}
			</section>

			{/* HARVEST — produce the DRAFT-Truth proposal. */}
			<section className="space-y-3">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.harvestHeading}
				</h2>
				<button
					type="button"
					data-testid="run-harvest"
					onClick={runHarvest}
					className="inline-flex items-center rounded-md border border-emerald-600/40 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-300"
				>
					{labels.runHarvest}
				</button>
				{proposal ? (
					<div
						data-testid="draft-truth-proposal"
						className="space-y-2 rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-4 py-3"
					>
						<p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
							{labels.draftTruthHeading}
						</p>
						<p className="text-xs text-foreground">
							<span className="text-muted-foreground">
								{labels.proposesLabel}:{" "}
							</span>
							{proposal.proposes}
						</p>
						<p className="text-xs text-foreground">
							<span className="text-muted-foreground">
								{labels.intentLabel}:{" "}
							</span>
							{proposal.intent}
						</p>
						<div className="flex flex-wrap gap-2">
							<span
								data-testid="no-version-marker"
								className="inline-flex items-center rounded-md border border-dashed border-border px-2 py-0.5 text-xs font-medium text-muted-foreground"
							>
								{labels.noVersionMarker}
							</span>
							<span
								data-testid="no-mirror-marker"
								className="inline-flex items-center rounded-md border border-dashed border-border px-2 py-0.5 text-xs font-medium text-muted-foreground"
							>
								{labels.noMirrorMarker}
							</span>
						</div>
						<p
							data-testid="provenance-link"
							className="text-xs text-emerald-700/90 dark:text-emerald-300/90"
						>
							{labels.provenanceLinkLabel}:{" "}
							<code className="font-mono">{proposal.ideaId}</code>
						</p>
						<p
							data-testid="draft-truth-caveat"
							className="text-xs text-muted-foreground"
						>
							{labels.draftTruthCaveat}
						</p>
					</div>
				) : null}
			</section>
		</div>
	);
}
