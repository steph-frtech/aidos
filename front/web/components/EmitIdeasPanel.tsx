"use client";

import { useMemo, useState } from "react";
import { allLevels, type Level } from "@/lib/besoin-grammar";
import { levelToProposes } from "@/lib/besoin-proposes";
import {
	type EmitNode,
	type EmitNodeStatus,
	type EmittedIdea,
	emitCount,
	emitIdeas,
} from "@/lib/emit-ideas";

/**
 * EmitIdeasPanel — the action-capable /emit-ideas panel (EL16). The EL16 emitter EmitIdeas(graph) →
 * []Idea is the deterministic projection of a BesoinGraph into the backlog of draft Ideas, GOVERNED by
 * the closed table levelToProposes (EL05). Its decision is the TWIN lib/emit-ideas.ts (byte-identical
 * to back/runtime/besoin/emit_ideas.go + the besoin_emit_ideas MCP tool). The human EXECUTES the
 * emitter FROM THE SCREEN (ui-completeness, CLAUDE.md §7 — no headless capability):
 *  - toggle each rung's status (empty/drafting/resolved) — the "already-decided graph";
 *  - "Émettre les Ideas" runs emitIdeas(nodes) — the besoin_emit_ideas tool: one draft Idea per
 *    RESOLVED MAPPING rung, NoEmit rungs (journey/view/invariant) excluded (no silent cast).
 *
 * Every verdict is COMPUTED by the deterministic twin, never an LLM. ABOVE the wall (CLAUDE.md §2): the
 * emitter writes no truth — every emitted Idea is a DRAFT candidate with no version and no mirror
 * (HasMirror always false); promotion is the app-builder writing the mirror via /goal (hand-off S64).
 * Themed (ADR 0010), bilingual (ADR 0011) — labels passed in.
 */

interface Labels {
	intro: string;
	rungsHeading: string;
	statusEmpty: string;
	statusDrafting: string;
	statusResolved: string;
	mapsLabel: string;
	noEmitLabel: string;
	emitCta: string;
	resetCta: string;
	backlogHeading: string;
	countLabel: string;
	proposesLabel: string;
	intentLabel: string;
	provenanceLabel: string;
	statusLabel: string;
	emptyBacklog: string;
	wallNote: string;
	handoffNote: string;
}

// the default utterance per rung (verbatim provenance) — deterministic, no clock/rng.
const UTTERANCE: Record<Level, string> = {
	product: "je veux une boutique qui vende des livres",
	journey: "le parcours d'achat de bout en bout",
	view: "l'écran du panier",
	control: "le bouton « Payer »",
	action: "déclencher le paiement",
	operation: "débiter puis confirmer la commande",
	entity: "une commande avec un total",
	invariant: "pour tout achat, le total reste positif",
	policy: "seul un admin peut rembourser",
};

export function EmitIdeasPanel({ labels }: { labels: Labels }) {
	// the per-rung status — the "already-decided graph" the human shapes. product+entity resolved by
	// default so the screen lands action-capable (two mapping rungs → two draft Ideas).
	const [status, setStatus] = useState<Record<Level, EmitNodeStatus>>(() => {
		const init = {} as Record<Level, EmitNodeStatus>;
		for (const l of allLevels()) init[l] = "empty";
		init.product = "resolved";
		init.entity = "resolved";
		return init;
	});
	const [backlog, setBacklog] = useState<EmittedIdea[] | null>(null);

	const nodes: EmitNode[] = useMemo(
		() =>
			allLevels().map((level) => ({
				level,
				status: status[level],
				utterance: UTTERANCE[level],
			})),
		[status],
	);

	function onEmit() {
		setBacklog(emitIdeas(nodes));
	}
	function onReset() {
		const init = {} as Record<Level, EmitNodeStatus>;
		for (const l of allLevels()) init[l] = "empty";
		init.product = "resolved";
		init.entity = "resolved";
		setStatus(init);
		setBacklog(null);
	}

	const previewCount = emitCount(nodes);

	return (
		<div className="space-y-8">
			<p className="text-sm text-muted-foreground">{labels.intro}</p>

			{/* the per-rung status toggles — the already-decided graph */}
			<div className="space-y-3 rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold text-foreground">
					{labels.rungsHeading}
				</h2>
				<ul className="space-y-2">
					{allLevels().map((level) => {
						const m = levelToProposes(level);
						const maps = m.kind === "emit";
						return (
							<li
								key={level}
								className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
							>
								<span className="flex items-center gap-2 text-sm text-foreground">
									<span className="font-medium">{level}</span>
									<span
										className={
											maps
												? "rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
												: "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
										}
									>
										{maps
											? `${labels.mapsLabel} ${m.proposes}`
											: labels.noEmitLabel}
									</span>
								</span>
								<select
									data-testid={`status-${level}`}
									value={status[level]}
									onChange={(e) =>
										setStatus((s) => ({
											...s,
											[level]: e.target.value as EmitNodeStatus,
										}))
									}
									className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
								>
									<option value="empty">{labels.statusEmpty}</option>
									<option value="drafting">{labels.statusDrafting}</option>
									<option value="resolved">{labels.statusResolved}</option>
								</select>
							</li>
						);
					})}
				</ul>

				<div className="flex flex-wrap items-center gap-3 pt-2">
					<button
						type="button"
						data-testid="emit-cta"
						onClick={onEmit}
						className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
					>
						{labels.emitCta}
					</button>
					<button
						type="button"
						data-testid="reset-cta"
						onClick={onReset}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
					>
						{labels.resetCta}
					</button>
					<span
						data-testid="preview-count"
						className="text-xs text-muted-foreground"
					>
						{labels.countLabel} {previewCount}
					</span>
				</div>
			</div>

			{/* the emitted backlog */}
			<div className="space-y-3 rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold text-foreground">
					{labels.backlogHeading}
				</h2>
				{backlog === null ? (
					<p className="text-sm text-muted-foreground">{labels.emptyBacklog}</p>
				) : (
					<>
						<p
							data-testid="backlog-count"
							className="text-sm font-medium text-foreground"
						>
							{labels.countLabel} {backlog.length}
						</p>
						<ul className="space-y-2" data-testid="backlog-list">
							{backlog.map((idea) => (
								<li
									key={idea.fromLevel}
									data-testid={`idea-${idea.proposes}`}
									className="space-y-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
								>
									<div className="flex flex-wrap gap-x-4 gap-y-1">
										<span className="text-foreground">
											<span className="text-muted-foreground">
												{labels.proposesLabel}{" "}
											</span>
											{idea.proposes}
										</span>
										<span className="text-foreground">
											<span className="text-muted-foreground">
												{labels.statusLabel}{" "}
											</span>
											{idea.status}
										</span>
										<span className="text-foreground">
											<span className="text-muted-foreground">
												{labels.provenanceLabel}{" "}
											</span>
											{idea.provenance.source}
										</span>
									</div>
									<div className="text-muted-foreground">
										<span>{labels.intentLabel} </span>
										{idea.intent}
									</div>
								</li>
							))}
						</ul>
					</>
				)}
				<p className="pt-2 text-xs text-muted-foreground">{labels.wallNote}</p>
				<p className="text-xs text-muted-foreground">{labels.handoffNote}</p>
			</div>
		</div>
	);
}
