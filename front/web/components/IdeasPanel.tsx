"use client";

import { useState } from "react";
import {
	type BlockReason,
	type Idea,
	lanes,
	type Promotion,
	promote,
	type Status,
} from "@/lib/ideas";
import { HARVESTED_IDEA, HARVESTED_MIRROR_REF, IDEAS } from "@/lib/ideas-data";

/**
 * IdeasPanel — the action-capable /ideas board (S27). It renders one card per idea (proposes /
 * intent / provenance / status), grouped into the five lifecycle lanes, each card carrying the
 * explicit "no mirror yet" marker (an idea has no mirror — that is what makes it an idea). The human
 * can RUN the promotion of the harvested idea two ways FROM THE SCREEN, calling the SAME pure
 * promote() gate the Go ideas.Promote computes:
 *   - promote WITHOUT a mirror ⇒ a RED row with NO_MIRROR_NO_KERNEL (code + how_to_fix), and the
 *     idea STAYS harvested (no kernel write) — THE done criterion made visible;
 *   - promote WITH a mirror ⇒ the Promoted → /goal → frozen-truth path with the provenance link
 *     back to the idea.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): the lifecycle + gate verdict are RENDERED, not
 * re-implemented as truth here; capture/advance rides the idea-intake MCP (ideas schema, above the
 * wall), and a promotion writes the kernel via the S20 ChangeSet path under the aidos writer role —
 * never a write from this screen. Themed (ADR 0010), bilingual (ADR 0011) — labels passed in.
 */

interface Labels {
	laneNames: Record<Status, string>;
	proposesLabel: string;
	intentLabel: string;
	provenanceLabel: string;
	noMirrorMarker: string;
	promoteHeading: string;
	promoteWithoutMirror: string;
	promoteWithMirror: string;
	blockedHeading: string;
	promotedHeading: string;
	howToFixLabel: string;
	provenanceLinkLabel: string;
	staysHarvestedNote: string;
	sourceNames: Record<string, string>;
}

const laneAccent: Record<Status, string> = {
	draft: "border-zinc-500/40 bg-zinc-500/10 text-zinc-500 dark:text-zinc-400",
	grilled: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400",
	spiking:
		"border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
	harvested:
		"border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	rejected: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
};

function IdeaCard({ idea, labels }: { idea: Idea; labels: Labels }) {
	return (
		<li
			data-testid={`idea-card-${idea.id}`}
			data-status={idea.status}
			className="space-y-2 rounded-xl border border-border bg-card px-4 py-3"
		>
			<div className="flex flex-wrap items-center gap-2">
				<span
					data-testid={`status-${idea.id}`}
					className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${laneAccent[idea.status]}`}
				>
					{labels.laneNames[idea.status]}
				</span>
				<span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
					{labels.proposesLabel}: {idea.proposes}
				</span>
				{/* The "no mirror yet" marker — an idea has no mirror, by definition. */}
				<span
					data-testid={`no-mirror-${idea.id}`}
					className="inline-flex items-center rounded-md border border-dashed border-border px-2 py-0.5 text-xs font-medium text-muted-foreground"
				>
					{labels.noMirrorMarker}
				</span>
			</div>
			<p className="text-sm text-foreground">
				<span className="text-muted-foreground">{labels.intentLabel}: </span>
				{idea.intent}
			</p>
			<p className="text-xs text-muted-foreground">
				{labels.provenanceLabel}:{" "}
				{labels.sourceNames[idea.provenance.source] ?? idea.provenance.source} —{" "}
				<span className="italic">{idea.provenance.detail}</span>
			</p>
			{idea.rejectReason ? (
				<p
					data-testid={`reject-reason-${idea.id}`}
					className="text-xs text-red-600 dark:text-red-400"
				>
					{idea.rejectReason}
				</p>
			) : null}
		</li>
	);
}

export function IdeasPanel({ labels }: { labels: Labels }) {
	const [block, setBlock] = useState<BlockReason | null>(null);
	const [promotion, setPromotion] = useState<Promotion | null>(null);
	// The harvested idea's status never changes when a mirror-less promotion is blocked.
	const harvested: Idea = HARVESTED_IDEA;

	function runPromoteNoMirror() {
		const r = promote(harvested, ""); // the wall: no mirror ⇒ blocked.
		setPromotion(null);
		setBlock(r.block ?? null);
	}
	function runPromoteWithMirror() {
		const r = promote(harvested, HARVESTED_MIRROR_REF);
		setBlock(null);
		setPromotion(r.promotion ?? null);
	}

	return (
		<div className="space-y-10" data-testid="ideas-panel">
			{/* The idea board — the five lifecycle lanes. */}
			<section className="space-y-4">
				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					{lanes().map((lane) => {
						const cards = IDEAS.filter((i) => i.status === lane);
						return (
							<div
								key={lane}
								data-testid={`lane-${lane}`}
								className="space-y-3"
							>
								<h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
									<span
										className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${laneAccent[lane]}`}
									>
										{labels.laneNames[lane]}
									</span>
								</h3>
								<ul className="space-y-3">
									{cards.map((idea) => (
										<IdeaCard key={idea.id} idea={idea} labels={labels} />
									))}
								</ul>
							</div>
						);
					})}
				</div>
			</section>

			{/* The promotion gate — run BOTH paths from the screen (the only door to the kernel). */}
			<section className="space-y-4">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{labels.promoteHeading}
				</h2>
				<div className="flex flex-wrap gap-3">
					<button
						type="button"
						data-testid="promote-no-mirror"
						onClick={runPromoteNoMirror}
						className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted"
					>
						{labels.promoteWithoutMirror}
					</button>
					<button
						type="button"
						data-testid="promote-with-mirror"
						onClick={runPromoteWithMirror}
						className="inline-flex items-center rounded-md border border-blue-600/40 bg-blue-600/10 px-3 py-1.5 text-sm font-medium text-blue-700 transition hover:bg-blue-600/20 dark:text-blue-300"
					>
						{labels.promoteWithMirror}
					</button>
				</div>

				{block ? (
					<div
						data-testid="promotion-blocked"
						className="space-y-2 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3"
					>
						<p className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
							{labels.blockedHeading}
							<code
								data-testid="block-code"
								className="rounded bg-red-500/20 px-1.5 py-0.5 font-mono text-xs"
							>
								{block.code}
							</code>
						</p>
						<p className="text-xs text-red-700/90 dark:text-red-300/90">
							{block.explanation}
						</p>
						<div className="space-y-1">
							<p className="text-xs font-medium text-red-700 dark:text-red-300">
								{labels.howToFixLabel}
							</p>
							<ol className="list-decimal space-y-0.5 pl-5 text-xs text-red-700/90 dark:text-red-300/90">
								{block.howToFix.map((fix) => (
									<li key={fix} data-testid="how-to-fix-item">
										{fix}
									</li>
								))}
							</ol>
						</div>
						{/* The idea STAYS harvested — no kernel write. */}
						<p
							data-testid="stays-harvested"
							className="text-xs text-muted-foreground"
						>
							{labels.staysHarvestedNote}
						</p>
					</div>
				) : null}

				{promotion ? (
					<div
						data-testid="promotion-promoted"
						className="space-y-2 rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-4 py-3"
					>
						<p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
							{labels.promotedHeading}
						</p>
						<p className="text-xs text-emerald-700/90 dark:text-emerald-300/90">
							<code className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono">
								{promotion.mirrorRef}
							</code>
						</p>
						{/* The provenance link: the frozen truth points BACK to the idea (KRD §119). */}
						<p
							data-testid="provenance-link"
							className="text-xs text-emerald-700/90 dark:text-emerald-300/90"
						>
							{labels.provenanceLinkLabel}:{" "}
							<code className="font-mono">{promotion.provenanceIdeaId}</code>
						</p>
					</div>
				) : null}
			</section>
		</div>
	);
}
