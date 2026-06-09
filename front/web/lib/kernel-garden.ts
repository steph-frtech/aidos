// Determinism-first twin of back/runtime/debt/garden.Tend + .SuggestGardenTrim +
// .AcceptProposal (KRD §82.4, step S112). PURE functions of (projectSnapshot) — no
// clock, no rng, no I/O — so /kernel-garden can re-run the per-project gardening + the
// trim suggestion on a selected scenario and render the EXACT debt ledger + trim plan
// the Go package computes. The FIVE debt kinds, the FIVE open_idea_* actions, the
// project scoping and the suggest-only/no-delete rule mirror the Go package;
// fast-check (lib/kernel-garden.test.ts) pins the twin's invariants.
//
// EXTENDS the S41 kernel-debt twin (lib/kernel-debt.ts): the three base kinds are
// CONSUMED from it (re-implemented here over the same snapshot for the panel's
// self-containedness), plus the two §82.4 adds — dead_liveness and
// low_value_constraint (the latter built on lib/economics.ts, the S51 twin).
//
// THE WALL (CLAUDE.md §2/§8): the twin DETECTS and SUGGESTS — it deletes nothing,
// writes no truth, opens no ChangeSet. Acting on a suggestion goes through the door
// `idea → mirror → /goal → human approval`. The recorded snapshot lives in
// fitness.kernel_debt_snapshot (SELECT-only to the agent); this twin renders it.

import { evaluate, type MeasuredCost, type ValueCase } from "./economics";

// The five DECLARED garden-debt kinds — exactly these, never invented.
export type GardenKind =
	| "orphan_mirror"
	| "stale_fixture"
	| "surviving_mutant"
	| "dead_liveness"
	| "low_value_constraint";

export const GARDEN_KINDS: readonly GardenKind[] = [
	"orphan_mirror",
	"stale_fixture",
	"surviving_mutant",
	"dead_liveness",
	"low_value_constraint",
] as const;

export type Severity = "high" | "medium" | "low";
const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

// The single door any trim suggestion requires — /trim never bypasses it.
export const THE_DOOR = "idea → mirror → /goal → human approval";

// The five DECLARED open_idea_* actions — every one opens an idea, never deletes.
export type GardenAction =
	| "open_idea_to_retire_mirror"
	| "open_idea_to_repin_fixture"
	| "open_idea_to_strengthen_mirror"
	| "open_idea_to_revive_or_retire_mirror"
	| "open_idea_to_justify_or_trim_constraint";

export const GARDEN_ACTIONS: readonly GardenAction[] = [
	"open_idea_to_retire_mirror",
	"open_idea_to_repin_fixture",
	"open_idea_to_strengthen_mirror",
	"open_idea_to_revive_or_retire_mirror",
	"open_idea_to_justify_or_trim_constraint",
] as const;

const ACTION_FOR: Record<GardenKind, GardenAction> = {
	orphan_mirror: "open_idea_to_retire_mirror",
	stale_fixture: "open_idea_to_repin_fixture",
	surviving_mutant: "open_idea_to_strengthen_mirror",
	dead_liveness: "open_idea_to_revive_or_retire_mirror",
	low_value_constraint: "open_idea_to_justify_or_trim_constraint",
};

export interface TruthRow {
	id: string;
	version: string;
	live: boolean;
}

export interface MirrorRow {
	id: string;
	reflects: { layerId: string; version: string };
	testKind: string;
	liveness: string;
}

export interface MutationRow {
	target: string;
	status: "survived" | "killed";
}

export interface CellBudget {
	cellRef: string;
	maxLlmTokensPerGoal: number;
	maxCiMinutes?: number;
	expectedRiskReduction?: "low" | "medium" | "high" | "critical";
	cost: { llmTokens: number; ciMinutes?: number };
	valueCase?: ValueCase | null;
}

export interface ProjectSnapshot {
	projectRef: string;
	kernelHead: string;
	truths: TruthRow[];
	mirrors: MirrorRow[];
	mutation: MutationRow[];
	budgets: CellBudget[];
}

export interface GardenItem {
	id: string;
	projectRef: string;
	kind: GardenKind;
	targetRef: string;
	reason: string;
	severity: Severity;
}

export interface Garden {
	projectRef: string;
	kernelHead: string;
	items: GardenItem[];
}

export interface GardenSuggestion {
	debtItemRef: string;
	projectRef: string;
	proposedAction: GardenAction;
	rationale: string;
	requires: string;
}

export interface GardenTrimPlan {
	projectRef: string;
	suggestions: GardenSuggestion[];
	deletesAnything: false;
}

export interface OpenIdea {
	opensIdea: true;
	deletes: false;
	door: string;
	fromAction: GardenAction;
	onDebtItem: string;
	projectRef: string;
	intentPrefix: string;
}

function liveHeads(s: ProjectSnapshot): Map<string, string> {
	const heads = new Map<string, string>();
	for (const t of s.truths) if (t.live) heads.set(t.id, t.version);
	return heads;
}

// A stable, deterministic synthetic id (project:kind:target) — enough for the panel's
// keys + the suggest-only proof (the panel renders the recorded snapshot's real hashes
// when wired to fitness).
function itemId(project: string, kind: GardenKind, targetRef: string): string {
	return `${project}:${kind}:${targetRef}`;
}

function orphanMirrors(s: ProjectSnapshot): GardenItem[] {
	const heads = liveHeads(s);
	const liveRefs = new Set<string>();
	for (const t of s.truths) if (t.live) liveRefs.add(`${t.id}@${t.version}`);
	const out: GardenItem[] = [];
	for (const m of s.mirrors) {
		const ref = `${m.reflects.layerId}@${m.reflects.version}`;
		if (liveRefs.has(ref)) continue;
		if (heads.has(m.reflects.layerId)) continue; // id live, version moved → stale.
		out.push({
			id: itemId(s.projectRef, "orphan_mirror", m.id),
			projectRef: s.projectRef,
			kind: "orphan_mirror",
			targetRef: m.id,
			reason: `miroir orphelin (no_orphan_mirror, S12) : ${m.id} reflète une cible disparue ${m.reflects.layerId}@${m.reflects.version} — aucune vérité vivante`,
			severity: "high",
		});
	}
	return out;
}

function staleFixtures(s: ProjectSnapshot): GardenItem[] {
	const heads = liveHeads(s);
	const out: GardenItem[] = [];
	for (const m of s.mirrors) {
		if (m.testKind !== "fixture") continue;
		const head = heads.get(m.reflects.layerId);
		if (head === undefined) continue;
		if (head !== m.reflects.version) {
			out.push({
				id: itemId(s.projectRef, "stale_fixture", m.id),
				projectRef: s.projectRef,
				kind: "stale_fixture",
				targetRef: m.id,
				reason: `fixture périmée : ${m.id} est épinglée sur ${m.reflects.layerId}@${m.reflects.version} alors que la tête vivante est @${head}`,
				severity: "low",
			});
		}
	}
	return out;
}

function survivingMutants(s: ProjectSnapshot): GardenItem[] {
	const heads = liveHeads(s);
	const covering = new Map<string, string[]>();
	for (const m of s.mirrors) {
		if (m.liveness !== "alive") continue;
		if (!heads.has(m.reflects.layerId)) continue;
		const list = covering.get(m.reflects.layerId) ?? [];
		list.push(m.id);
		covering.set(m.reflects.layerId, list);
	}
	const out: GardenItem[] = [];
	for (const mut of s.mutation) {
		if (mut.status !== "survived") continue;
		const mirrors = covering.get(mut.target);
		if (!mirrors) continue;
		mirrors.sort();
		out.push({
			id: itemId(s.projectRef, "surviving_mutant", mut.target),
			projectRef: s.projectRef,
			kind: "surviving_mutant",
			targetRef: mut.target,
			reason: `mutant survivant : une mutation contre ${mut.target} a survécu — le(s) miroir(s) ${JSON.stringify(mirrors)} aurai(en)t dû le tuer`,
			severity: "medium",
		});
	}
	return out;
}

// S112 add: a mirror declared DEAD that still pins a LIVE truth (a dead proof, §34).
// Distinct from an orphan (which reflects nothing live).
function deadLiveness(s: ProjectSnapshot): GardenItem[] {
	const heads = liveHeads(s);
	const out: GardenItem[] = [];
	for (const m of s.mirrors) {
		if (m.liveness !== "dead") continue;
		if (!heads.has(m.reflects.layerId)) continue; // reflects nothing live → orphan.
		out.push({
			id: itemId(s.projectRef, "dead_liveness", m.id),
			projectRef: s.projectRef,
			kind: "dead_liveness",
			targetRef: m.id,
			reason: `liveness morte (KRD §34) : le miroir ${m.id} reflète une vérité vivante ${m.reflects.layerId}@${m.reflects.version} mais sa liveness est \`dead\` — une preuve morte qui ne tourne jamais`,
			severity: "high",
		});
	}
	return out;
}

// S112 add: a cell over its HarnessCostBudget without a justified ValueCase (§66.3).
// CONSUMES the S51 economics twin (evaluate) — never re-derives the verdict.
function lowValueConstraints(s: ProjectSnapshot): GardenItem[] {
	const out: GardenItem[] = [];
	for (const cb of s.budgets) {
		const cost: MeasuredCost = {
			ciMinutes: cb.cost.ciMinutes ?? 0,
			llmTokens: cb.cost.llmTokens,
			mutationRuntimeSeconds: 0,
			humanReviewMinutes: 0,
		};
		const dec = evaluate(
			{
				cellRef: cb.cellRef,
				maxCiMinutes: cb.maxCiMinutes ?? 0,
				maxLlmTokensPerGoal: cb.maxLlmTokensPerGoal,
				maxMutationRuntimeSeconds: 0,
				maxHumanReviewMinutes: 0,
				expectedRiskReduction: cb.expectedRiskReduction ?? "low",
			},
			cost,
			cb.valueCase ?? null,
		);
		if (dec.verdict !== "over_budget_flagged") continue;
		out.push({
			id: itemId(s.projectRef, "low_value_constraint", cb.cellRef),
			projectRef: s.projectRef,
			kind: "low_value_constraint",
			targetRef: cb.cellRef,
			reason: `contrainte à faible valeur (KRD §66.3) : la cellule ${cb.cellRef} dépasse son HarnessCostBudget sur ${JSON.stringify(dec.overAxes ?? [])} sans ValueCase \`justified\``,
			severity: "medium",
		});
	}
	return out;
}

// tend is the pure twin of garden.Tend: it gardens ONE project's snapshot and returns
// the ranked, project-scoped Garden. Deterministic; never mutates the input.
export function tend(s: ProjectSnapshot): Garden {
	const items = [
		...orphanMirrors(s),
		...staleFixtures(s),
		...survivingMutants(s),
		...deadLiveness(s),
		...lowValueConstraints(s),
	];
	items.sort((a, b) => {
		if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
			return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
		}
		if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
		if (a.targetRef !== b.targetRef) return a.targetRef < b.targetRef ? -1 : 1;
		return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	});
	return { projectRef: s.projectRef, kernelHead: s.kernelHead, items };
}

// suggestGardenTrim is the pure twin of garden.SuggestGardenTrim: every GardenItem maps
// to an open_idea_* action at THE_DOOR. It deletes nothing. An empty garden → empty plan.
export function suggestGardenTrim(g: Garden): GardenTrimPlan {
	const suggestions: GardenSuggestion[] = g.items.map((item) => ({
		debtItemRef: item.id,
		projectRef: item.projectRef,
		proposedAction: ACTION_FOR[item.kind],
		rationale: `${item.reason} — proposition seulement : ouvrir une idée, jamais supprimer (${THE_DOOR})`,
		requires: THE_DOOR,
	}));
	return { projectRef: g.projectRef, suggestions, deletesAnything: false };
}

// acceptProposal is the pure twin of garden.AcceptProposal: accepting a suggestion
// ALWAYS opens an idea and NEVER deletes — the door's first step (idea capture) is the
// legal write, never a removal from here.
export function acceptProposal(s: GardenSuggestion): OpenIdea {
	return {
		opensIdea: true,
		deletes: false,
		door: THE_DOOR,
		fromAction: s.proposedAction,
		onDebtItem: s.debtItemRef,
		projectRef: s.projectRef,
		intentPrefix: `trim/${s.proposedAction} sur ${s.debtItemRef}`,
	};
}
