// Determinism-first twin of back/runtime/adoption.Plan + back/runtime/adoption/release
// .Assemble (KRD §S47). PURE functions — no clock read (now is passed), no rng, no I/O
// — so /adoption can re-run the ladder + the pack assembly on a selected scenario and
// render the EXACT AdoptionPlan + ReleasePack the Go package computes. The five tiers,
// the three load-bearing gating facts and the assemble-only/no-author rule mirror the
// Go package; fast-check (lib/adoption.test.ts) pins the twin's invariants.
//
// THE WALL (CLAUDE.md §2/§8): the twin COMPUTES a ladder + ASSEMBLES an inventory — it
// installs nothing, ships nothing, writes no truth, opens no ChangeSet. Turning on a
// capability goes through the door `idea → mirror → /goal → human approval`. The
// recorded pack lives in fitness.release_pack (SELECT-only to the agent); this twin
// renders it.

// The eleven DECLARED capabilities — CONSUMED facts (live or not), never built here.
export type Capability =
	| "tests"
	| "mutation"
	| "one_krd_cell"
	| "kernel"
	| "mirror"
	| "reality_mirror_live"
	| "context_graph"
	| "memory"
	| "evolution_sandbox"
	| "evolve"
	| "quality_diversity";

// The five DECLARED tiers — exactly these (KRD §82.5 stage0..stage5), never invented.
export type AdoptionStage = "T0" | "T1" | "T2" | "T3" | "T4";

export const STAGES: readonly AdoptionStage[] = [
	"T0",
	"T1",
	"T2",
	"T3",
	"T4",
] as const;

const STAGE_RANK: Record<AdoptionStage, number> = {
	T0: 0,
	T1: 1,
	T2: 2,
	T3: 3,
	T4: 4,
};

export function isStage(s: string): s is AdoptionStage {
	return s in STAGE_RANK;
}

// The single door any capability install requires — /release never bypasses it.
export const THE_DOOR = "idea → mirror → /goal → human approval";

interface TierSpec {
	requires: Capability[];
	grants: Capability[];
}

// The declared ladder — REUSED from KRD §82.5, mirrors the Go `specs`. T1.requires has
// NO quality_diversity (§82.6); T2.requires has reality_mirror_live (Livre XX);
// T4.requires has evolution_sandbox (§66.1).
const SPECS: Record<AdoptionStage, TierSpec> = {
	T0: { requires: [], grants: ["tests", "mutation"] },
	T1: {
		requires: ["tests", "mutation", "one_krd_cell"],
		grants: ["one_krd_cell"],
	},
	T2: {
		requires: ["kernel", "mirror", "reality_mirror_live"],
		grants: ["kernel", "mirror"],
	},
	T3: {
		requires: ["context_graph", "memory"],
		grants: ["context_graph", "memory"],
	},
	T4: {
		requires: ["evolution_sandbox", "evolve", "quality_diversity"],
		grants: ["evolve", "quality_diversity"],
	},
};

export function requires(s: AdoptionStage): Capability[] {
	return [...SPECS[s].requires];
}

export function grants(s: AdoptionStage): Capability[] {
	return [...SPECS[s].grants];
}

export interface Gap {
	stage: AdoptionStage;
	missing: Capability;
	reason: string;
}

export interface TierStatus {
	stage: AdoptionStage;
	requires: Capability[];
	grants: Capability[];
	satisfiable: boolean;
	gaps: Gap[];
}

export interface AdoptionPlan {
	tiers: TierStatus[];
	current: AdoptionStage | "";
	next: AdoptionStage | "";
	nextGaps: Gap[];
	allSatisfied: boolean;
}

function reasonFor(s: AdoptionStage, c: Capability): string {
	switch (c) {
		case "reality_mirror_live":
			return "bloqué jusqu'à ce qu'un RealityMirror soit vivant (le miroir du monde extérieur, KRD Livre XX — pas de palier catastrophique sans ancrage dans le réel)";
		case "evolution_sandbox":
			return "bloqué jusqu'à ce que l'EvolutionSandbox existe (la quarantaine de /evolve, KRD §66.1 — pas d'évolution avant son bac à sable)";
		default:
			return `${s} requiert la capacité « ${c} » : absente de la vue (CONSOMMÉE, jamais inventée)`;
	}
}

// plan computes the AdoptionPlan from the live capability view (the smallest ratchet
// that clicks next). Pure; never installs; never mutates the input. The monotone-ladder
// rule: current = the contiguous satisfied floor, next = the first unsatisfied tier.
export function plan(capabilities: Capability[]): AdoptionPlan {
	const have = new Set(capabilities);
	const tiers: TierStatus[] = STAGES.map((s) => {
		const spec = SPECS[s];
		const gaps: Gap[] = [];
		for (const c of spec.requires) {
			if (!have.has(c)) {
				gaps.push({ stage: s, missing: c, reason: reasonFor(s, c) });
			}
		}
		return {
			stage: s,
			requires: [...spec.requires],
			grants: [...spec.grants],
			satisfiable: gaps.length === 0,
			gaps,
		};
	});

	let current: AdoptionStage | "" = "";
	let next: AdoptionStage | "" = "";
	let nextGaps: Gap[] = [];
	let allSatisfied = true;
	let nextSet = false;
	for (const ts of tiers) {
		if (ts.satisfiable) {
			if (!nextSet) current = ts.stage;
			continue;
		}
		allSatisfied = false;
		if (!nextSet) {
			next = ts.stage;
			nextGaps = [...ts.gaps];
			nextSet = true;
		}
	}
	return { tiers, current, next, nextGaps, allSatisfied };
}

// ─── release.Assemble twin ───────────────────────────────────────────────────

export interface CLICommand {
	name: string;
	summary?: string;
}
export interface Route {
	path: string;
	title?: string;
}
export interface DemoRef {
	ref?: string;
	title?: string;
}
export interface DocRef {
	slug: string;
	title?: string;
}
export interface MirrorRef {
	id: string;
	reflects?: string;
	testKind?: string;
}
export interface ChangeEntry {
	ref: string;
	summary?: string;
}
export interface Limit {
	ref: string;
	description?: string;
}

export interface View {
	cliCommands: CLICommand[];
	workbenchRoutes: Route[];
	demo: DemoRef;
	docs: DocRef[];
	mirrors: MirrorRef[];
	changesets: ChangeEntry[];
	declaredLimits: Limit[];
	kernelHead: string;
}

export interface ReleasePack {
	id: string;
	cliSurface: CLICommand[];
	workbenchRoutes: Route[];
	demoCell: DemoRef;
	docsIndex: DocRef[];
	testInventory: MirrorRef[];
	changelog: ChangeEntry[];
	knownLimits: Limit[];
	adoptionPlan: AdoptionPlan;
	assembledAt: number;
	kernelHead: string;
}

// A stable, deterministic synthetic id for a pack (the Go package content-addresses
// with Hash(Canonicalize(body))). The twin uses a length-fingerprint synthetic id —
// enough for the panel's keys + the assemble-only proof (the panel renders the recorded
// pack's real hash when wired to fitness.release_pack).
function syntheticId(p: Omit<ReleasePack, "id" | "assembledAt">): string {
	return `pack:${p.cliSurface.length}c-${p.workbenchRoutes.length}r-${p.testInventory.length}m-${p.changelog.length}cl-${p.knownLimits.length}kl-${p.kernelHead}`;
}

// assemble inventories the live View into a ReleasePack paired with the adoption ladder.
// Pure; AUTHORS NOTHING (every field is the View's content); installs/ships nothing;
// never mutates the input. An empty View yields an empty-but-valid pack.
export function assemble(
	view: View,
	capabilities: Capability[],
	now: number,
): ReleasePack {
	const cli = [...view.cliCommands].sort((a, b) =>
		a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
	);
	const routes = [...view.workbenchRoutes].sort((a, b) =>
		a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
	);
	const docs = [...view.docs].sort((a, b) =>
		a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0,
	);
	const mirrors = [...view.mirrors].sort((a, b) =>
		a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
	);
	const changelog = [...view.changesets].sort((a, b) =>
		a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0,
	);
	const limits = [...view.declaredLimits].sort((a, b) =>
		a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0,
	);
	const adoptionPlan = plan(capabilities);

	const partial = {
		cliSurface: cli,
		workbenchRoutes: routes,
		demoCell: view.demo,
		docsIndex: docs,
		testInventory: mirrors,
		changelog,
		knownLimits: limits,
		adoptionPlan,
		kernelHead: view.kernelHead,
	};
	return { ...partial, id: syntheticId(partial), assembledAt: now };
}
