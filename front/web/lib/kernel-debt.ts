// Determinism-first twin of back/runtime/debt.Scan + back/runtime/debt/trim.SuggestTrim
// (KRD §S41). PURE functions of (snapshot) — no clock, no rng, no I/O — so
// /kernel-debt can re-run the scan + the trim suggestion on a selected scenario and
// render the EXACT debt ledger + trim plan the Go package computes. The three debt
// kinds, the three open_idea_* actions and the suggest-only/no-delete rule mirror
// the Go package; fast-check (lib/kernel-debt.test.ts) pins the twin's invariants.
//
// THE WALL (CLAUDE.md §2/§8): the twin DETECTS and SUGGESTS — it deletes nothing,
// writes no truth, opens no ChangeSet. Acting on a suggestion goes through the door
// `idea → mirror → /goal → human approval`. The recorded snapshot lives in
// fitness.kernel_debt_snapshot (SELECT-only to the agent); this twin renders it.

// The three DECLARED debt kinds — exactly these, never invented.
export type DebtKind = "orphan_mirror" | "stale_fixture" | "surviving_mutant";

export const DEBT_KINDS: readonly DebtKind[] = [
	"orphan_mirror",
	"stale_fixture",
	"surviving_mutant",
] as const;

export type Severity = "high" | "medium" | "low";

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export type MutationStatus = "survived" | "killed";

// The single door any trim suggestion requires — /trim never bypasses it.
export const THE_DOOR = "idea → mirror → /goal → human approval";

// The three DECLARED open_idea_* actions — every one opens an idea, never deletes.
export type TrimAction =
	| "open_idea_to_retire_mirror"
	| "open_idea_to_repin_fixture"
	| "open_idea_to_strengthen_mirror";

export const TRIM_ACTIONS: readonly TrimAction[] = [
	"open_idea_to_retire_mirror",
	"open_idea_to_repin_fixture",
	"open_idea_to_strengthen_mirror",
] as const;

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
	status: MutationStatus;
	file?: string;
	line?: number;
	operator?: string;
}

export interface Snapshot {
	truths: TruthRow[];
	mirrors: MirrorRow[];
	mutation: MutationRow[];
	kernelHead: string;
	mutationRunRef?: string | null;
}

export interface DebtItem {
	id: string;
	kind: DebtKind;
	targetRef: string;
	reason: string;
	severity: Severity;
}

export interface KernelDebt {
	items: DebtItem[];
	kernelHead: string;
	mutationRunRef?: string | null;
}

export interface TrimSuggestion {
	debtItemRef: string;
	proposedAction: TrimAction;
	rationale: string;
	requires: string;
}

export interface TrimPlan {
	suggestions: TrimSuggestion[];
}

// liveHeads indexes the live truths by id → live head version.
function liveHeads(s: Snapshot): Map<string, string> {
	const heads = new Map<string, string>();
	for (const t of s.truths) {
		if (t.live) heads.set(t.id, t.version);
	}
	return heads;
}

// A stable, deterministic id for a debt item. The Go package content-addresses with
// Hash(Canonicalize(body)); the twin uses a deterministic synthetic id (kind:target)
// — enough for the panel's keys + the suggest-only proof (the panel renders the
// recorded snapshot's real hashes when wired to fitness).
function itemId(kind: DebtKind, targetRef: string): string {
	return `${kind}:${targetRef}`;
}

function orphanMirrors(s: Snapshot): DebtItem[] {
	const heads = liveHeads(s);
	const liveRefs = new Set<string>();
	for (const t of s.truths) {
		if (t.live) liveRefs.add(`${t.id}@${t.version}`);
	}
	const out: DebtItem[] = [];
	for (const m of s.mirrors) {
		const ref = `${m.reflects.layerId}@${m.reflects.version}`;
		if (liveRefs.has(ref)) continue; // reflects a live head exactly → not orphan.
		if (heads.has(m.reflects.layerId)) continue; // id is live, only version moved → stale, not orphan.
		out.push({
			id: itemId("orphan_mirror", m.id),
			kind: "orphan_mirror",
			targetRef: m.id,
			reason: `miroir orphelin (no_orphan_mirror, S12) : ${m.id} reflète une cible disparue ${m.reflects.layerId}@${m.reflects.version} — aucune vérité vivante (monstre de la loi de complétude)`,
			severity: "high",
		});
	}
	return out;
}

function staleFixtures(s: Snapshot): DebtItem[] {
	const heads = liveHeads(s);
	const out: DebtItem[] = [];
	for (const m of s.mirrors) {
		if (m.testKind !== "fixture") continue;
		const head = heads.get(m.reflects.layerId);
		if (head === undefined) continue; // orphan, not stale.
		if (head !== m.reflects.version) {
			out.push({
				id: itemId("stale_fixture", m.id),
				kind: "stale_fixture",
				targetRef: m.id,
				reason: `fixture périmée : ${m.id} est épinglée sur ${m.reflects.layerId}@${m.reflects.version} alors que la tête vivante est @${head} (l'épingle a bougé)`,
				severity: "low",
			});
		}
	}
	return out;
}

function survivingMutants(s: Snapshot): DebtItem[] {
	const heads = liveHeads(s);
	const covering = new Map<string, string[]>();
	for (const m of s.mirrors) {
		if (m.liveness !== "alive") continue;
		if (!heads.has(m.reflects.layerId)) continue;
		const list = covering.get(m.reflects.layerId) ?? [];
		list.push(m.id);
		covering.set(m.reflects.layerId, list);
	}
	const out: DebtItem[] = [];
	for (const mut of s.mutation) {
		if (mut.status !== "survived") continue;
		const mirrors = covering.get(mut.target);
		if (!mirrors) continue; // not covered by a living mirror → not THIS step's debt.
		mirrors.sort();
		const loc = mut.file ? ` [${mut.file}:${mut.line} ${mut.operator}]` : "";
		out.push({
			id: itemId("surviving_mutant", mut.target),
			kind: "surviving_mutant",
			targetRef: mut.target,
			reason: `mutant survivant : une mutation contre ${mut.target} a survécu — le(s) miroir(s) ${JSON.stringify(mirrors)} aurai(en)t dû le tuer${loc}`,
			severity: "medium",
		});
	}
	return out;
}

// scan is the pure twin of debt.Scan: it diagnoses the snapshot and returns the
// ranked KernelDebt. Deterministic; never mutates the input; the three detectors'
// union, ranked, is the report.
export function scan(s: Snapshot): KernelDebt {
	const items = [
		...orphanMirrors(s),
		...staleFixtures(s),
		...survivingMutants(s),
	];
	items.sort((a, b) => {
		if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
			return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
		}
		if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
		if (a.targetRef !== b.targetRef) return a.targetRef < b.targetRef ? -1 : 1;
		return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	});
	return { items, kernelHead: s.kernelHead, mutationRunRef: s.mutationRunRef };
}

const ACTION_FOR: Record<DebtKind, TrimAction> = {
	orphan_mirror: "open_idea_to_retire_mirror",
	stale_fixture: "open_idea_to_repin_fixture",
	surviving_mutant: "open_idea_to_strengthen_mirror",
};

// suggestTrim is the pure twin of trim.SuggestTrim: every DebtItem maps to an
// open_idea_* action at THE_DOOR. It deletes nothing, opens no ChangeSet. An empty
// debt yields an empty plan.
export function suggestTrim(d: KernelDebt): TrimPlan {
	const suggestions: TrimSuggestion[] = d.items.map((item) => ({
		debtItemRef: item.id,
		proposedAction: ACTION_FOR[item.kind],
		rationale: `${item.reason} — proposition seulement : ouvrir une idée, jamais supprimer (${THE_DOOR})`,
		requires: THE_DOOR,
	}));
	return { suggestions };
}
