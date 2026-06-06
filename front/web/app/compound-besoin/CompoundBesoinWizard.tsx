"use client";

import { useMemo, useState } from "react";
import {
	canDescend,
	type NodeInput,
	type Verdict,
} from "@/lib/besoin-candescend";
import { anchorsAbove, type CascadeNode } from "@/lib/besoin-cascade";
import {
	type BesoinLevelMirror,
	besoinCompleteness,
	levelMirrorForm,
	type MirrorForm,
} from "@/lib/besoin-completeness";
import { type Level, nextLevel, SOURCE_ORDER } from "@/lib/besoin-grammar";
import {
	type DocNode,
	emitRequirementsDoc,
	type RequirementsDoc,
} from "@/lib/besoin-requirements-doc";
import { optionSpaceFor } from "@/lib/besoin-thresholds";
import type { Edge } from "@/lib/red-backlog";

/**
 * CompoundBesoinWizard — the EL19 level-by-level FORCED tunnel (vertical staircase). The user
 * EXPLAINS their app rung by rung; step N+1 is LOCKED until canDescend(N).enough (the EL07 gate made
 * visible). It RÉUTILISE the /first-app wizard shell idiom (staircase + per-stage action), drives the
 * pure TS twins (the byte-equivalent authority of back/runtime/besoin), and at the bottom PROJECTS the
 * Ideas (EL16) and generates the requirements doc (EmitRequirementsDoc).
 *
 * ui-completeness (CLAUDE.md §7): no headless capability — every op has an executable control:
 *   - "Compléter ce niveau" → fills the rung's body + the four metadata → re-computes canDescend.enough.
 *   - "Rendre le scénario vide" (product) → a parsable-but-vacant body → stays not_enough (anti-gaming).
 *   - "Projeter vers idea-intake" → emitRequirementsDoc → the real draft Ideas surface (the wall:
 *     PROPOSE, never write the kernel; HasMirror false), in topological order.
 *   - "Ouvrir comme goals" → REFUSED when besoinCompleteness finds a monster (the EL09 gate).
 *
 * THE WALL (CLAUDE.md §2): the screen PROPOSES Ideas, never writes truth. The step lock READS the pure
 * canDescend verdict (the front never re-implements the gate). Determinism-first: the doc render is a
 * pure function, never an LLM. Themed (ADR 0010), bilingual (ADR 0011) — labels passed in.
 */

// The rungs the tunnel walks: the 7 SOURCE rungs + the 2 transversal bands (rendered as side panels).
const TUNNEL_RUNGS: Level[] = [...SOURCE_ORDER];

export interface WizardLabels {
	intentionLabel: string;
	intention: string;
	progress: string;
	completeStep: string;
	makeVacant: string;
	resetCta: string;
	lockedNote: string;
	enoughNote: string;
	notEnoughNote: string;
	missingHeading: string;
	openQuestionsHeading: string;
	blockReasonsHeading: string;
	anchorsHeading: string;
	noEmitAnchorNote: string;
	metadataHeading: string;
	metadataComplete: string;
	metadataIncomplete: string;
	compoundingHeading: string;
	shrinkLabel: string;
	reuseHeading: string;
	reuseOpenQuestion: string;
	projectCta: string;
	openGoalsCta: string;
	openGoalsRefused: string;
	openGoalsOk: string;
	ideasHeading: string;
	ideaCountLabel: string;
	docHeading: string;
	docLink: string;
	wallNote: string;
	rungNames: Record<string, string>;
}

// A pre-seeded VALID body per rung (the user "completes" the rung to it). selects ⊂ the declared
// OptionSpace choices → anti-vacuity satisfied (shrinkOptionSpace > 0). Declared, not invented.
const VALID_BODY: Record<Level, Record<string, unknown>> = {
	product: {
		intent: "Permettre à un client de passer commande",
		scenarios: ["panier → paiement → confirmation"],
		selects: ["checkout", "core-task"],
	},
	journey: {
		gherkin: "Given un panier When je paie Then la commande est confirmée",
		selects: ["core-task", "confirmation"],
	},
	view: {
		goal: "Récapituler et confirmer la commande",
		zones: ["récapitulatif", "actions"],
		data: ["lignes", "total"],
		selects: ["detail", "confirmation"],
	},
	control: {
		visible_when: true,
		enabled_when: true,
		triggers: "passerCommande",
		selects: ["submit", "create"],
	},
	action: {
		invoke: "placeOrder@v1",
		selects: ["command", "create"],
	},
	operation: {
		steps: ["valider", "débiter", "confirmer"],
		fixture: "checkout.fixture",
		selects: ["create"],
	},
	entity: {
		attributes: ["id", "total", "statut"],
	},
	invariant: { statement: "∀ commande : total ≥ 0" },
	policy: { rule: "seul le propriétaire peut annuler" },
};

const VACANT_BODY: Record<string, unknown> = {
	intent: "x",
	scenarios: [], // parses as an array but empty → not right-sized → not_enough.
	selects: [],
};

const UTTERANCE: Record<Level, string> = {
	product: "Permettre à un client de passer commande",
	journey: "Le parcours de paiement, du panier à la confirmation",
	view: "L'écran de récapitulatif et confirmation de commande",
	control: "Le bouton « Passer commande »",
	action: "L'action placeOrder déclenchée par le bouton",
	operation: "L'opération de validation et débit de la commande",
	entity: "L'entité Commande",
	invariant: "∀ commande : le total est positif",
	policy: "Seul le propriétaire peut annuler la commande",
};

interface RungState {
	level: Level;
	completed: boolean;
	vacant: boolean;
	metaComplete: boolean;
}

function initialRungs(): RungState[] {
	return TUNNEL_RUNGS.map((level) => ({
		level,
		completed: false,
		vacant: false,
		metaComplete: false,
	}));
}

// nodeInputOf builds the EL07 NodeInput for a rung from its wizard state. A completed (non-vacant) rung
// carries the VALID body + its resolved outgoing ref; a vacant rung carries the parsable-but-empty body.
function nodeInputOf(rs: RungState): NodeInput {
	const ref = nextLevel(rs.level);
	return {
		level: rs.level,
		body: rs.vacant ? VACANT_BODY : VALID_BODY[rs.level],
		refsTo: rs.completed && !rs.vacant && ref ? [ref] : [],
		present: rs.completed || rs.vacant,
	};
}

function shrinkFor(rs: RungState): number {
	const ref = nextLevel(rs.level);
	if (!ref) return 1; // entity leaf — vacuously satisfied.
	const os = optionSpaceFor(rs.level, ref);
	if (!os?.enumerable) return 1; // declared OpenQuestion (operation→entity).
	const body = rs.vacant ? VACANT_BODY : VALID_BODY[rs.level];
	const selects = Array.isArray(body.selects) ? (body.selects as string[]) : [];
	const full = new Set(os.choices);
	let kept = 0;
	for (const c of selects) if (full.has(c)) kept++;
	if (kept === 0) return 0;
	const shrink = os.choices.length - kept;
	return shrink < 0 ? 0 : shrink;
}

export function CompoundBesoinWizard({ labels }: { labels: WizardLabels }) {
	const [rungs, setRungs] = useState<RungState[]>(initialRungs);
	const [doc, setDoc] = useState<RequirementsDoc | null>(null);
	const [goalsVerdict, setGoalsVerdict] = useState<null | {
		ok: boolean;
		monsters: string[];
	}>(null);

	// The verdict per rung — the PURE canDescend (the front never re-implements the gate).
	const verdicts = useMemo<Record<Level, Verdict>>(() => {
		const out = {} as Record<Level, Verdict>;
		for (const rs of rungs) {
			out[rs.level] = canDescend(nodeInputOf(rs), rs.level, rs.metaComplete);
		}
		return out;
	}, [rungs]);

	// A step is UNLOCKED iff it is the first rung OR the previous rung is enough (the staircase gate).
	function unlocked(idx: number): boolean {
		if (idx === 0) return true;
		const prev = rungs[idx - 1];
		return verdicts[prev.level].enough;
	}

	// A rung is a frozen ANCHOR iff its pure verdict is enough (the cascade reads the gate, not a flag).
	const cascadeNodes: CascadeNode[] = rungs.map((rs) => ({
		level: rs.level,
		body: nodeInputOf(rs).body,
		status: verdicts[rs.level].enough
			? "resolved"
			: rs.vacant || rs.completed
				? "drafting"
				: "empty",
		refsTo: nodeInputOf(rs).refsTo,
	}));

	const completedCount = rungs.filter((r) => verdicts[r.level].enough).length;

	function update(level: Level, patch: Partial<RungState>) {
		setRungs((prev) =>
			prev.map((r) => (r.level === level ? { ...r, ...patch } : r)),
		);
		setDoc(null);
		setGoalsVerdict(null);
	}

	function reset() {
		setRungs(initialRungs());
		setDoc(null);
		setGoalsVerdict(null);
	}

	// docNodes builds the DocNode set + edges from the wizard state (only resolved rungs project).
	function buildDocInputs(): { nodes: DocNode[]; edges: Edge[] } {
		const nodes: DocNode[] = [];
		const edges: Edge[] = [];
		for (const rs of rungs) {
			const resolved = verdicts[rs.level].enough;
			const ref = nextLevel(rs.level);
			nodes.push({
				level: rs.level,
				status: resolved ? "resolved" : rs.vacant ? "drafting" : "empty",
				utterance: UTTERANCE[rs.level],
				body: nodeInputOf(rs).body,
				metaComplete: rs.metaComplete,
				refs: resolved && ref ? [{ field: "ref", to: ref }] : [],
			});
			if (resolved && ref) {
				edges.push({ from: rs.level, to: ref, kind: "constrains" });
			}
		}
		return { nodes, edges };
	}

	// Projeter — emitRequirementsDoc (EL19 deterministic projector). The wall: PROPOSE, never write.
	function project() {
		const { nodes, edges } = buildDocInputs();
		try {
			const graphHash = `g${completedCount}x${rungs.filter((r) => r.vacant).length}`;
			setDoc(emitRequirementsDoc(nodes, edges, graphHash));
		} catch {
			setDoc(null);
		}
	}

	// Ouvrir comme goals — REFUSED when besoinCompleteness finds a monster (EL09 gate). A resolved rung
	// without its level-mirror is a monster; the screen surfaces the refusal, never writes truth.
	function openGoals() {
		const { nodes } = buildDocInputs();
		const resolvedLevels = nodes.filter((n) => n.status === "resolved");
		// The user has not yet authored the level-mirrors (they belong to /goal) → at least one
		// resolved rung is a NEED_LEVEL_WITHOUT_MIRROR monster ⇒ "Ouvrir comme goals" is refused for an
		// incomplete graph. A complete graph (every resolved rung carries its mirror) opens.
		const mirrors: BesoinLevelMirror[] = resolvedLevels.map((n) => ({
			reflects: n.level,
			// only when every SOURCE rung is enough do we treat the graph as complete (mirror present).
			form: levelMirrorForm(n.level) ?? ("fixture" as MirrorForm),
		}));
		const everySourceEnough = rungs.every((r) => verdicts[r.level].enough);
		const meta: Record<string, boolean> = {};
		for (const n of nodes) meta[n.level] = n.metaComplete;
		const report = besoinCompleteness(
			nodes.map((n) => ({ level: n.level, status: n.status })),
			everySourceEnough ? mirrors : [],
			meta,
		);
		setGoalsVerdict({
			ok: report.complete && everySourceEnough,
			monsters: report.monsters.map((m) => `${m.code} (${m.level})`),
		});
	}

	return (
		<section data-testid="compound-besoin-wizard" className="space-y-6">
			{/* Intention + progress */}
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
				<div>
					<p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
						{labels.intentionLabel}
					</p>
					<p className="mt-0.5 text-sm font-medium text-card-foreground">
						« {labels.intention} »
					</p>
				</div>
				<div className="flex items-center gap-3">
					<span
						data-testid="wizard-progress"
						className="text-sm font-semibold tabular-nums text-primary"
					>
						{completedCount} / {TUNNEL_RUNGS.length}
					</span>
					<button
						type="button"
						data-testid="wizard-reset"
						onClick={reset}
						className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						{labels.resetCta}
					</button>
				</div>
			</div>

			{/* The vertical staircase tunnel */}
			<ol className="space-y-3">
				{rungs.map((rs, idx) => {
					const v = verdicts[rs.level];
					const isUnlocked = unlocked(idx);
					const isEnough = v.enough;
					const anchors = anchorsAbove(cascadeNodes, rs.level);
					const shrink = shrinkFor(rs);
					return (
						<li
							key={rs.level}
							data-testid={`wizard-step-${rs.level}`}
							data-unlocked={isUnlocked ? "true" : "false"}
							data-enough={isEnough ? "true" : "false"}
							className={
								!isUnlocked
									? "rounded-xl border border-border bg-card/40 p-4 opacity-60"
									: isEnough
										? "rounded-xl border border-primary/40 bg-primary/5 p-4"
										: "rounded-xl border-2 border-primary/50 bg-card p-5 shadow-sm"
							}
						>
							<div className="flex items-start gap-4">
								<span
									className={
										isEnough
											? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground tabular-nums"
											: "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-border text-sm font-semibold text-muted-foreground tabular-nums"
									}
								>
									{isEnough ? "✓" : idx + 1}
								</span>
								<div className="min-w-0 flex-1 space-y-3">
									<div className="flex flex-wrap items-center gap-2">
										<h3 className="text-base font-semibold text-card-foreground">
											{labels.rungNames[rs.level] ?? rs.level}
										</h3>
										<span
											data-testid={`wizard-verdict-${rs.level}`}
											className={
												isEnough
													? "rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"
													: "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
											}
										>
											{isEnough ? labels.enoughNote : labels.notEnoughNote}
										</span>
									</div>

									{!isUnlocked ? (
										<p
											data-testid={`wizard-locked-${rs.level}`}
											className="text-sm text-muted-foreground"
										>
											🔒 {labels.lockedNote}
										</p>
									) : (
										<>
											{/* Actions: complete / make vacant (product) */}
											<div className="flex flex-wrap items-center gap-2">
												<button
													type="button"
													data-testid={`wizard-complete-${rs.level}`}
													onClick={() =>
														update(rs.level, {
															completed: true,
															vacant: false,
															metaComplete: true,
														})
													}
													className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/80"
												>
													{labels.completeStep}
												</button>
												<button
													type="button"
													data-testid={`wizard-vacant-${rs.level}`}
													onClick={() =>
														update(rs.level, {
															completed: false,
															vacant: true,
															metaComplete: true,
														})
													}
													className="rounded-lg border border-amber-500/50 px-3 py-1.5 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-500/10 dark:text-amber-400"
												>
													{labels.makeVacant}
												</button>
											</div>

											{/* Metadata panel (the four per-truth metadata, EL04) */}
											<div
												data-testid={`wizard-metadata-${rs.level}`}
												data-complete={rs.metaComplete ? "true" : "false"}
												className="rounded-lg border border-border bg-muted/40 p-3 text-xs"
											>
												<p className="font-semibold text-foreground">
													{labels.metadataHeading}
												</p>
												<p className="mt-1 text-muted-foreground">
													{rs.metaComplete
														? labels.metadataComplete
														: labels.metadataIncomplete}
												</p>
											</div>

											{/* Anchors above (read-only; NoEmit rungs included) */}
											{anchors.length > 0 ? (
												<div
													data-testid={`wizard-anchors-${rs.level}`}
													className="rounded-lg border border-border bg-card p-3 text-xs"
												>
													<p className="font-semibold text-foreground">
														{labels.anchorsHeading}
													</p>
													<ul className="mt-1 space-y-0.5 text-muted-foreground">
														{anchors.map((a) => (
															<li key={a.level}>
																{labels.rungNames[a.level] ?? a.level}
																{a.level === "journey" || a.level === "view"
																	? ` — ${labels.noEmitAnchorNote}`
																	: ""}
															</li>
														))}
													</ul>
												</div>
											) : null}

											{/* Compounding panel — the ShrinkOptionSpace integer (EL08) */}
											<div
												data-testid={`wizard-compounding-${rs.level}`}
												className="rounded-lg border border-border bg-muted/40 p-3 text-xs"
											>
												<p className="font-semibold text-foreground">
													{labels.compoundingHeading}
												</p>
												<p className="mt-1 text-muted-foreground">
													{labels.shrinkLabel} :{" "}
													<span
														data-testid={`wizard-shrink-${rs.level}`}
														className="font-semibold tabular-nums text-primary"
													>
														{shrink}
													</span>
												</p>
											</div>

											{/* The gate explanation when not enough */}
											{!isEnough ? (
												<div
													data-testid={`wizard-block-${rs.level}`}
													className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"
												>
													{v.missing.length > 0 ? (
														<p>
															{labels.missingHeading} : {v.missing.join(", ")}
														</p>
													) : null}
													{v.blockReasons.map((b) => (
														<p key={b.code}>
															{b.code} — {b.explanation}
														</p>
													))}
												</div>
											) : null}

											{/* Carried OpenQuestions (non-blocking, bootstrap §6) */}
											{v.openQuestions.length > 0 ? (
												<div
													data-testid={`wizard-oq-${rs.level}`}
													className="rounded-lg border border-blue-500/40 bg-blue-500/10 p-3 text-xs text-blue-700 dark:text-blue-300"
												>
													<p className="font-semibold">
														{labels.openQuestionsHeading}
													</p>
													<ul className="mt-1 space-y-0.5">
														{v.openQuestions.map((q) => (
															<li key={q}>{q}</li>
														))}
													</ul>
												</div>
											) : null}
										</>
									)}
								</div>
							</div>
						</li>
					);
				})}
			</ol>

			{/* The cross-app reuse history (EL18) — OpenQuestion when normalisation not live */}
			<div
				data-testid="wizard-reuse"
				className="rounded-xl border border-blue-500/40 bg-blue-500/5 p-4 text-xs text-blue-700 dark:text-blue-300"
			>
				<p className="font-semibold">{labels.reuseHeading}</p>
				<p className="mt-1">{labels.reuseOpenQuestion}</p>
			</div>

			{/* The two executable hand-off controls */}
			<div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
				<button
					type="button"
					data-testid="wizard-project"
					onClick={project}
					className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/80"
				>
					{labels.projectCta}
				</button>
				<button
					type="button"
					data-testid="wizard-open-goals"
					onClick={openGoals}
					className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
				>
					{labels.openGoalsCta}
				</button>
				<a
					href="/compound-besoin/doc"
					data-testid="wizard-doc-link"
					className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
				>
					{labels.docLink}
				</a>
			</div>

			<p
				data-testid="wizard-wall-note"
				className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
			>
				{labels.wallNote}
			</p>

			{/* The "Ouvrir comme goals" verdict (EL09 gate made visible) */}
			{goalsVerdict ? (
				<div
					data-testid="wizard-goals-verdict"
					data-ok={goalsVerdict.ok ? "true" : "false"}
					className={
						goalsVerdict.ok
							? "rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm text-primary"
							: "rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400"
					}
				>
					{goalsVerdict.ok ? (
						<p>{labels.openGoalsOk}</p>
					) : (
						<>
							<p className="font-semibold">{labels.openGoalsRefused}</p>
							<ul className="mt-1 space-y-0.5 text-xs">
								{goalsVerdict.monsters.map((m) => (
									<li key={m}>{m}</li>
								))}
							</ul>
						</>
					)}
				</div>
			) : null}

			{/* The projected Ideas — the "live" backlog the wall PROPOSES (HasMirror false) */}
			{doc ? (
				<div
					data-testid="wizard-ideas"
					className="space-y-3 rounded-xl border border-primary/40 bg-card p-4"
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h3 className="text-sm font-semibold text-card-foreground">
							{labels.ideasHeading}
						</h3>
						<span
							data-testid="wizard-idea-count"
							className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-primary"
						>
							{labels.ideaCountLabel} : {doc.ideaCount}
						</span>
					</div>
					<ol className="space-y-2">
						{doc.backlog.map((item, i) => (
							<li
								key={item.fromLevel}
								data-testid={`wizard-idea-${item.fromLevel}`}
								className="rounded-lg border border-border bg-muted/40 p-3 text-xs"
							>
								<p className="font-medium text-foreground">
									<span className="tabular-nums text-muted-foreground">
										{i + 1}.
									</span>{" "}
									proposes=
									<span className="font-semibold">{item.proposes}</span> —{" "}
									{labels.rungNames[item.fromLevel] ?? item.fromLevel}
								</p>
								<p className="mt-0.5 text-muted-foreground">
									« {item.intent} » — provenance : {item.provenance.source} —
									miroir : {item.mirrorForm}
								</p>
							</li>
						))}
					</ol>
					<a
						href="/ideas"
						data-testid="wizard-ideas-link"
						className="inline-block rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
					>
						/ideas →
					</a>
				</div>
			) : null}
		</section>
	);
}
