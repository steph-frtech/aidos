"use client";

import { useMemo, useState } from "react";
import { allLevels, type Level, levels } from "@/lib/besoin-grammar";
import { levelToProposes } from "@/lib/besoin-proposes";
import {
	type BacklogItem,
	type BacklogNode,
	CycleError,
	type Edge,
	redBacklog,
} from "@/lib/red-backlog";

/**
 * RedBacklogPanel — the action-capable /red-backlog panel (EL17). The EL17 RedBacklog(graph) →
 * BacklogItem[] is the deterministic TOPOLOGICAL SORT of a BesoinGraph's emitted Ideas (the mapping
 * rungs) along the constrains/seeds edges → the architectural promotion order S64 opens its /goal in.
 * Its decision is the TWIN lib/red-backlog.ts (byte-equivalent to back/runtime/besoin/red_backlog.go +
 * the besoin_red_backlog MCP tool). The human EXECUTES it FROM THE SCREEN (ui-completeness, CLAUDE.md
 * §7 — no headless capability):
 *  - toggle each rung's status (empty/drafting/resolved) — the "already-decided graph";
 *  - "Trier le RedBacklog" runs redBacklog(nodes, edges) — the besoin_red_backlog tool: the topo-sorted
 *    list of items, each carrying its expected mirror FORM (annexed, never written), its anchors_above
 *    (NoEmit journey/view included), and its @version ref resolution;
 *  - "Injecter un cycle" adds a back-edge → the tool REFUSES with BESOIN_CYCLE (never an arbitrary order).
 *
 * Every verdict is COMPUTED by the deterministic twin, never an LLM. ABOVE the wall (CLAUDE.md §2): the
 * sort writes no truth — the mirror form is ANNEXED, never written; every Idea is a DRAFT with no
 * version and no mirror; promotion is /goal (hand-off S64). Themed (ADR 0010), bilingual (ADR 0011).
 */

interface Labels {
	intro: string;
	rungsHeading: string;
	statusEmpty: string;
	statusDrafting: string;
	statusResolved: string;
	mapsLabel: string;
	noEmitLabel: string;
	sortCta: string;
	cycleCta: string;
	resetCta: string;
	backlogHeading: string;
	countLabel: string;
	orderLabel: string;
	mirrorFormLabel: string;
	anchorsLabel: string;
	refsLabel: string;
	openQuestionsLabel: string;
	emptyBacklog: string;
	cycleRefused: string;
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

// the canonical outgoing ref per SOURCE rung (control→action, etc.).
const REF: Partial<Record<Level, { field: string; to: Level }>> = {
	product: { field: "journeys", to: "journey" },
	journey: { field: "views", to: "view" },
	view: { field: "controls", to: "control" },
	control: { field: "triggers", to: "action" },
	action: { field: "invoke", to: "operation" },
	operation: { field: "mutate", to: "entity" },
};

type NodeStatus = "empty" | "drafting" | "resolved";

function freshStatus(): Record<Level, NodeStatus> {
	const init = {} as Record<Level, NodeStatus>;
	for (const l of allLevels()) init[l] = "empty";
	init.product = "resolved";
	init.entity = "resolved";
	return init;
}

export function RedBacklogPanel({ labels }: { labels: Labels }) {
	const [status, setStatus] = useState<Record<Level, NodeStatus>>(freshStatus);
	const [backlog, setBacklog] = useState<BacklogItem[] | null>(null);
	const [cycle, setCycle] = useState(false);

	const nodes: BacklogNode[] = useMemo(
		() =>
			allLevels().map((level) => ({
				level,
				status: status[level],
				utterance: UTTERANCE[level],
				refs: REF[level] ? [REF[level] as { field: string; to: Level }] : [],
				body: { marker: level },
			})),
		[status],
	);

	// the canonical constrains edges between consecutive present SOURCE rungs (the descent), plus an
	// optional injected back-edge to prove the BESOIN_CYCLE refusal.
	const edges: Edge[] = useMemo(() => {
		const present = new Set(
			allLevels().filter((l) => status[l] === "resolved"),
		);
		const src = levels();
		const out: Edge[] = [];
		for (let i = 0; i + 1 < src.length; i++) {
			if (present.has(src[i]) && present.has(src[i + 1])) {
				out.push({ from: src[i], to: src[i + 1], kind: "constrains" });
			}
		}
		if (cycle) {
			// a back-edge entity→product over the two default mapping rungs closes a loop.
			out.push({ from: "entity", to: "product", kind: "seeds" });
			out.push({ from: "product", to: "entity", kind: "seeds" });
		}
		return out;
	}, [status, cycle]);

	function onSort() {
		try {
			setBacklog(redBacklog(nodes, edges));
		} catch (e) {
			if (e instanceof CycleError) {
				setBacklog([]); // a cycle = empty backlog + the refusal banner.
				return;
			}
			throw e;
		}
	}
	function onInjectCycle() {
		setCycle(true);
		setBacklog(null);
	}
	function onReset() {
		setStatus(freshStatus());
		setBacklog(null);
		setCycle(false);
	}

	const refused = cycle && backlog !== null && backlog.length === 0;

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
											[level]: e.target.value as NodeStatus,
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
						data-testid="sort-cta"
						onClick={onSort}
						className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
					>
						{labels.sortCta}
					</button>
					<button
						type="button"
						data-testid="cycle-cta"
						onClick={onInjectCycle}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
					>
						{labels.cycleCta}
					</button>
					<button
						type="button"
						data-testid="reset-cta"
						onClick={onReset}
						className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
					>
						{labels.resetCta}
					</button>
				</div>
			</div>

			{/* the topo-sorted backlog */}
			<div className="space-y-3 rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold text-foreground">
					{labels.backlogHeading}
				</h2>
				{backlog === null ? (
					<p className="text-sm text-muted-foreground">{labels.emptyBacklog}</p>
				) : refused ? (
					<p
						data-testid="cycle-refused"
						className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
					>
						{labels.cycleRefused}
					</p>
				) : (
					<>
						<p
							data-testid="backlog-count"
							className="text-sm font-medium text-foreground"
						>
							{labels.countLabel} {backlog.length}
						</p>
						<ol className="space-y-2" data-testid="backlog-list">
							{backlog.map((item, i) => (
								<li
									key={item.fromLevel}
									data-testid={`item-${item.fromLevel}`}
									className="space-y-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
								>
									<div className="flex flex-wrap gap-x-4 gap-y-1">
										<span className="text-foreground">
											<span className="text-muted-foreground">
												{labels.orderLabel}{" "}
											</span>
											{i + 1}. {item.fromLevel} → {item.proposes}
										</span>
										<span className="text-foreground">
											<span className="text-muted-foreground">
												{labels.mirrorFormLabel}{" "}
											</span>
											<span data-testid={`form-${item.fromLevel}`}>
												{item.mirrorForm}
											</span>
										</span>
									</div>
									<div className="text-muted-foreground">
										{labels.anchorsLabel}{" "}
										<span data-testid={`anchors-${item.fromLevel}`}>
											{item.anchorsAbove.length === 0
												? "—"
												: item.anchorsAbove.map((a) => a.level).join(", ")}
										</span>
									</div>
									<div className="text-muted-foreground">
										{labels.refsLabel}{" "}
										{[
											...item.resolvedRefs.map((r) => `${r.field}→${r.to} ✓`),
											...item.unresolvedRefs.map((r) => `${r.field}→${r.to} ?`),
										].join(", ") || "—"}
									</div>
									{item.openQuestions.length > 0 && (
										<div className="text-muted-foreground">
											{labels.openQuestionsLabel}{" "}
											{item.openQuestions.join(" · ")}
										</div>
									)}
								</li>
							))}
						</ol>
					</>
				)}
				<p className="pt-2 text-xs text-muted-foreground">{labels.wallNote}</p>
				<p className="text-xs text-muted-foreground">{labels.handoffNote}</p>
			</div>
		</div>
	);
}
