/**
 * lib/compound.ts — the TYPESCRIPT TWIN of the CE01 compound spike measurement
 * (spike/compound/model.go + measure.go). Pure, deterministic functions: same goals + same
 * capture → same numbers, so the on-screen verdict the /compound panel runs matches the Go probe
 * exactly. No LLM, no clock, no rng (determinism-first, CLAUDE.md §6/§8): the EXPANSION of a
 * captured motif is a pure function, NOT a learned model ("PAS d'apprentissage de la fitness").
 *
 * Spike-scoped: nothing here is truth. The /compound panel reads this twin to make the spike's
 * go/no-go payoff VISIBLE and EXECUTABLE from a screen (the wall is intact — no kernel/mirror/
 * fitness write). CE02+ rebuilds the real capitalisation loop via firewall.ViaIdea.
 */

export type Origin = "derived" | "reused_procedural" | "reused_behavior";

export interface Unit {
	name: string;
	tokens: number; // estimated tokens to DERIVE this unit from scratch
	shareable: boolean; // true => part of the reusable motif across similar goals
}

export interface Goal {
	id: string;
	units: Unit[];
}

export interface UnitCost {
	name: string;
	tokens: number;
	origin: Origin;
}

export interface Delta {
	pair: string;
	goal1Cost: number;
	goal2WithoutCap: number;
	goal2WithCap: number;
	savedTokens: number;
	reductionFrac: number; // in [0,1]
	reusedProcedural: number;
	reusedBehavior: number;
}

export interface Verdict {
	go: boolean;
	similar: Delta;
	dissimilar: Delta;
	reductionFloor: number;
	dissimilarCeil: number;
	reproducible: boolean;
	rationale: string;
}

// DECLARED constants (above the line, not learned — CLAUDE.md §8). Mirror the Go probe exactly.
export const REPLAY_COST = 20;
export const REDUCTION_FLOOR = 0.25;
export const DISSIMILAR_CEIL = 0.2;

// SPEC units (mirror/fixture/contract/behavior) are replayed by EXPANDING a behavior-macro
// (§24.6, a pure dry-run); every other shareable unit by RECALLING a procedural memory entry
// (KindProcedural, S31). Same split as captureMode() in model.go.
const BEHAVIOR_UNITS = new Set([
	"derive_mirror",
	"write_fixture",
	"cross_contract",
	"expand_behavior",
]);

function captureMode(unit: string): Origin {
	return BEHAVIOR_UNITS.has(unit) ? "reused_behavior" : "reused_procedural";
}

/** Capture extracts the reusable motif from a completed goal: shareable unit-name → replay mode. */
export function capture(g: Goal): Map<string, Origin> {
	const m = new Map<string, Origin>();
	for (const u of g.units) {
		if (u.shareable) m.set(u.name, captureMode(u.name));
	}
	return m;
}

/**
 * costOf computes a goal's token cost. `captured` maps shareable unit-name → replay mode (empty
 * for the baseline "no capture" run). A shareable+captured unit costs REPLAY_COST with its
 * recorded origin; otherwise its full derivation tokens, origin "derived". Pure.
 */
export function costOf(
	g: Goal,
	captured: Map<string, Origin>,
): { total: number; perUnit: UnitCost[] } {
	let total = 0;
	const perUnit: UnitCost[] = [];
	for (const u of g.units) {
		let tokens = u.tokens;
		let origin: Origin = "derived";
		if (u.shareable && captured.has(u.name)) {
			tokens = REPLAY_COST;
			origin = captured.get(u.name) ?? "reused_procedural";
		}
		total += tokens;
		perUnit.push({ name: u.name, tokens, origin });
	}
	return { total, perUnit };
}

/** measureDelta: capture `first`, then cost `second` with and without that capture. Pure. */
export function measureDelta(pair: string, first: Goal, second: Goal): Delta {
	const pattern = capture(first);
	const g1 = costOf(first, new Map());
	const g2without = costOf(second, new Map());
	const g2with = costOf(second, pattern);

	const savedTokens = g2without.total - g2with.total;
	const reductionFrac = g2without.total > 0 ? savedTokens / g2without.total : 0;
	let reusedProcedural = 0;
	let reusedBehavior = 0;
	for (const uc of g2with.perUnit) {
		if (uc.origin === "reused_procedural") reusedProcedural++;
		else if (uc.origin === "reused_behavior") reusedBehavior++;
	}
	return {
		pair,
		goal1Cost: g1.total,
		goal2WithoutCap: g2without.total,
		goal2WithCap: g2with.total,
		savedTokens,
		reductionFrac,
		reusedProcedural,
		reusedBehavior,
	};
}

// The two similar AIDOS goals + the dissimilar control — same fixture as spike/compound/fixture.go.
export const GOAL1: Goal = {
	id: "goal-order-archive",
	units: [
		{ name: "load_context_pack", tokens: 1200, shareable: true },
		{ name: "derive_mirror", tokens: 900, shareable: true },
		{ name: "write_fixture", tokens: 1100, shareable: true },
		{ name: "scaffold_package", tokens: 700, shareable: true },
		{ name: "write_operation", tokens: 1800, shareable: false }, // INTRINSIC
		{ name: "project_go_ts", tokens: 800, shareable: true },
		{ name: "wire_ui_control", tokens: 1000, shareable: true },
		{ name: "run_sensors", tokens: 300, shareable: true },
	],
};

export const GOAL2: Goal = {
	id: "goal-invoice-archive",
	units: [
		{ name: "load_context_pack", tokens: 1200, shareable: true },
		{ name: "derive_mirror", tokens: 900, shareable: true },
		{ name: "write_fixture", tokens: 1100, shareable: true },
		{ name: "scaffold_package", tokens: 700, shareable: true },
		{ name: "write_operation", tokens: 1800, shareable: false }, // INTRINSIC: Invoice differs
		{ name: "project_go_ts", tokens: 800, shareable: true },
		{ name: "wire_ui_control", tokens: 1000, shareable: true },
		{ name: "run_sensors", tokens: 300, shareable: true },
	],
};

export const DISSIMILAR_GOAL: Goal = {
	id: "goal-unrelated-migration",
	units: [
		{ name: "load_context_pack", tokens: 1200, shareable: true }, // the only overlap
		{ name: "design_migration", tokens: 2000, shareable: false },
		{ name: "expand_contract_ddl", tokens: 1500, shareable: false },
		{ name: "backfill_data", tokens: 1800, shareable: false },
		{ name: "verify_atlas", tokens: 600, shareable: false },
	],
};

/**
 * decide computes the spike's go/no-go verdict (the twin of measure.go's Decide). GO iff the
 * similar pair clears the floor AND the dissimilar control stays under the ceiling AND the
 * measurement is reproducible. Otherwise NO-GO (roadmap spike-gate: the COMPOUND subject stops).
 */
export function decide(): Verdict {
	const similar = measureDelta("order→invoice (similar)", GOAL1, GOAL2);
	const dissimilar = measureDelta(
		"order→migration (dissimilar control)",
		GOAL1,
		DISSIMILAR_GOAL,
	);
	const again = measureDelta("order→invoice (similar)", GOAL1, GOAL2);
	const reproducible = again.reductionFrac === similar.reductionFrac;

	const clearsFloor = similar.reductionFrac >= REDUCTION_FLOOR;
	const noFalsePositive = dissimilar.reductionFrac <= DISSIMILAR_CEIL;
	const go = clearsFloor && noFalsePositive && reproducible;

	const pctS = (similar.reductionFrac * 100).toFixed(1);
	const pctD = (dissimilar.reductionFrac * 100).toFixed(1);
	let rationale: string;
	if (go) {
		rationale = `GO : capturer le motif du 1er goal (entrée procédurale KindProcedural pour les gestes + behavior-macro candidate pour les unités-spec) laisse le 2ᵉ goal SIMILAIRE REJOUER ses unités partagées au lieu de les re-dériver — réduction mesurée de ${pctS}% sur goal-2 (${similar.goal2WithoutCap}→${similar.goal2WithCap} tokens), au-dessus du plancher de ${(REDUCTION_FLOOR * 100).toFixed(0)}%. Le contrôle DISSIMILAIRE ne réduit que ${pctD}% (≤ plafond ${(DISSIMILAR_CEIL * 100).toFixed(0)}%), donc la capture ne fabrique pas de réutilisation. Reproductible (fonction pure, sans LLM). On poursuit vers CE02 — la capitalisation passe par le mur (firewall.ViaIdea → idée → miroir → /goal), jamais la fitness.`;
	} else if (!reproducible) {
		rationale =
			"NO-GO : mesure non reproductible — écart de déterminisme. Le sujet COMPOUND s'arrête (spike-gate).";
	} else if (!noFalsePositive) {
		rationale = `NO-GO : la capture fabrique une économie sur un goal DISSIMILAIRE (${pctD}% > plafond ${(DISSIMILAR_CEIL * 100).toFixed(0)}%). Le sujet COMPOUND s'arrête (spike-gate).`;
	} else {
		rationale = `NO-GO : sur la paire SIMILAIRE la réduction (${pctS}%) est sous le plancher de ${(REDUCTION_FLOOR * 100).toFixed(0)}%. Le sujet COMPOUND s'arrête (spike-gate).`;
	}

	return {
		go,
		similar,
		dissimilar,
		reductionFloor: REDUCTION_FLOOR,
		dissimilarCeil: DISSIMILAR_CEIL,
		reproducible,
		rationale,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// CE02 — the CAPITALISATION-BOUNDARY twin of back/runtime/compound/capitalisation.go.
// Pure, deterministic projection of the SAME authoritative decision table: what the
// compound loop CAPITALISES (procedural recall + behavior-macro, both via the wall) and the
// FRONTIER it never crosses (capitalisation ≠ apprentissage de critères ; tout via /goal ; the
// fitness is never touched). The /compound panel runs this to render the boundary on screen,
// and the numbers (2 capitalise / 3 forbidden) match the Go probe exactly. No LLM, no clock.
// ─────────────────────────────────────────────────────────────────────────────

export type Channel = "procedural_memory" | "behavior_macro" | "";
export type Disposition = "capitalise" | "forbidden";

export interface BoundaryRow {
	subject: string;
	disposition: Disposition;
	channel: Channel;
	viaWall: boolean;
	touchesFitness: boolean;
	rationale: string;
}

export interface Boundary {
	rows: BoundaryRow[];
	capitalise: number;
	forbidden: number;
	allCapitaliseViaWall: boolean;
	noCapitaliseTouchesFitness: boolean;
	line: string;
}

// The CE02 decision table, in canonical order — the exact mirror of capitalisationTable.
const BOUNDARY_ROWS: BoundaryRow[] = [
	{
		subject: "gesture_pattern",
		disposition: "capitalise",
		channel: "procedural_memory",
		viaWall: true,
		touchesFitness: false,
		rationale:
			"Le motif de GESTES devient un recall PROCÉDURAL (KindProcedural, S31) — fuel /brain sous la ligne, rejoué par le router pour abaisser l'effort du goal suivant. La mémoire propose ; le noyau déclare le vrai.",
	},
	{
		subject: "spec_pattern",
		disposition: "capitalise",
		channel: "behavior_macro",
		viaWall: true,
		touchesFitness: false,
		rationale:
			"Le motif de SPEC devient une behavior-macro candidate (§24.6) via firewall.ViaIdea → idée → miroir → /goal. Son expansion (CE04) est une fonction pure idempotente, pas un apprentissage.",
	},
	{
		subject: "intrinsic_substance",
		disposition: "forbidden",
		channel: "",
		viaWall: false,
		touchesFitness: false,
		rationale:
			"La substance propre d'un goal n'est jamais réutilisée — on capitalise le MOTIF partagé, pas le contenu intrinsèque. Fabriquer une réutilisation sans motif est le faux positif plafonné par le contrôle dissimilaire (16.6% ≤ 20%).",
	},
	{
		subject: "fitness_weights_criteria",
		disposition: "forbidden",
		channel: "",
		viaWall: false,
		touchesFitness: true,
		rationale:
			"La fitness (poids, seuils, waterline, grammaire NIVEAU 3) n'est jamais touchée. CAPITALISATION ≠ APPRENTISSAGE DE CRITÈRES : les poids sont déclarés, jamais appris. C'est la frontière porteuse de CE02.",
	},
	{
		subject: "direct_kernel_write",
		disposition: "forbidden",
		channel: "",
		viaWall: false,
		touchesFitness: false,
		rationale:
			"Écrire une vérité directement depuis la capture est interdit : TOUT passe par /goal. La seule porte est firewall.ViaIdea. Aucun raccourci mémoire → kernel.",
	},
];

/**
 * boundary computes the CE02 capitalisation frontier (the twin of Compute() + ADRSummary()).
 * Pure: same table → same rows, counts and invariants. The two load-bearing invariants are
 * derived, never hardcoded: every capitalise row crosses the wall AND none touches the fitness.
 */
export function boundary(): Boundary {
	let capitalise = 0;
	let forbidden = 0;
	let allCapitaliseViaWall = true;
	let noCapitaliseTouchesFitness = true;
	for (const r of BOUNDARY_ROWS) {
		if (r.disposition === "capitalise") {
			capitalise++;
			if (!r.viaWall) allCapitaliseViaWall = false;
			if (r.touchesFitness) noCapitaliseTouchesFitness = false;
		} else {
			forbidden++;
		}
	}
	return {
		rows: BOUNDARY_ROWS,
		capitalise,
		forbidden,
		allCapitaliseViaWall,
		noCapitaliseTouchesFitness,
		line: "Boucle de capitalisation : on CAPITALISE 2 motifs durables (recall procédural + behavior-macro), tous deux VIA LE MUR (firewall.ViaIdea → idée → miroir → /goal) et SANS toucher la fitness ; 3 FRONTIÈRES interdites. CAPITALISATION ≠ APPRENTISSAGE DE CRITÈRES — tout passe par /goal.",
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// CE03 — the /compound GESTURE twin of back/runtime/compound/compound.go. At a goal's CLOSE, the
// durable motif is CAPITALISED via the wall: the GESTURE pattern → ONE KindProcedural memory
// write-input ; the SPEC pattern → ONE DRAFT behavior-candidate idea proposed via firewall.ViaIdea
// (Status=draft, the "proposed" candidate, WroteKernel=false). A non-green goal capitalises
// NOTHING. Pure & deterministic: same goal → same events (no LLM, no clock, no rng). The
// /compound panel runs THIS so the gesture is executable from a screen, and the events match the
// Go gesture exactly. The wall is intact — nothing here writes truth.
// ─────────────────────────────────────────────────────────────────────────────

export interface GoalClose {
	goalId: string;
	branch: string;
	green: boolean;
	gesturePattern: string[];
	specPattern: string[];
}

export interface ProceduralWrite {
	kind: "procedural";
	content: string;
	provenance: string;
	branch: string;
}

export interface BehaviorCandidate {
	status: "draft";
	intent: string;
	provenance: string;
	wroteKernel: false;
}

export interface Capture {
	proceduralWrites: ProceduralWrite[];
	behaviorCandidates: BehaviorCandidate[];
	wroteKernel: boolean; // ALWAYS false — the wall guarantee, made explicit & testable.
}

// The canonical CE03 closed goal — the same motif the spike measured (gesture units / spec units).
export const GOAL_CLOSE: GoalClose = {
	goalId: "goal-order-archive",
	branch: "main",
	green: true,
	gesturePattern: [
		"load_context_pack",
		"scaffold_package",
		"project_go_ts",
		"wire_ui_control",
		"run_sensors",
	],
	specPattern: ["derive_mirror", "write_fixture", "cross_contract"],
};

/**
 * compound runs the /compound gesture over a closed goal (the twin of compound.Compound). Pure:
 * a non-green goal capitalises nothing; a green goal emits ≤1 procedural write (gesture pattern)
 * + ≤1 draft behavior candidate (spec pattern, via the wall). Never writes truth (wroteKernel is
 * always false). Same input → same events.
 */
export function compound(g: GoalClose): Capture {
	const out: Capture = {
		proceduralWrites: [],
		behaviorCandidates: [],
		wroteKernel: false,
	};
	if (!g.green) return out;

	const provenance = `compound:${g.goalId}`;

	if (g.gesturePattern.length > 0) {
		out.proceduralWrites.push({
			kind: "procedural",
			content: `Motif de gestes capitalisé du goal « ${g.goalId} » (KindProcedural) : ${g.gesturePattern.join(" · ")}. Rejoué pour abaisser l'effort du goal suivant similaire ; la mémoire propose, le noyau déclare le vrai.`,
			provenance,
			branch: g.branch,
		});
	}

	if (g.specPattern.length > 0) {
		out.behaviorCandidates.push({
			status: "draft",
			intent: `Behavior-macro candidate (§24.6) capitalisée du goal « ${g.goalId} » : ${g.specPattern.join(" · ")}. À expanser (CE04, fonction pure idempotente) puis figer via /goal — aucune écriture kernel hors du mur.`,
			provenance,
			wroteKernel: false,
		});
	}

	return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// CE04 — the behavior-macro EXPANSION twin of back/kernel/behavior/behavior.go (§24.6). A behavior
// ATTACHED to an entity EXPANDS (pure, dry-run, idempotent) into the attributes / relations /
// operations / policies / fixtures it implies — "ne réécris pas le boilerplate owner-scoping pour
// la 50ᵉ fois". Same attachment → byte-identical expansion (no LLM, no clock, no rng); WroteKernel
// is ALWAYS false — freezing the expanded source goes via /goal (the wall). The /compound panel
// runs THIS so the expansion is executable from a screen, and the pieces match the Go expander.
// ─────────────────────────────────────────────────────────────────────────────

export type BehaviorKind = "ownable" | "soft-deletable" | "auditable";

export interface ExpAttribute {
	name: string;
	type: string;
	required: boolean;
}
export interface ExpRelation {
	name: string;
	target: string;
	cardinality: string;
}
export interface ExpOperation {
	name: string;
}
export interface ExpPolicy {
	name: string;
	scope: string;
	operation: string;
	effect: string;
}
export interface ExpFixture {
	name: string;
}

export interface ExpShape {
	attributes?: string[];
	relations?: string[];
	operations?: string[];
	policies?: string[];
	fixtures?: string[];
}

export interface Attachment {
	behavior: BehaviorKind;
	entity: string;
	existing?: ExpShape;
}

export interface Expansion {
	behavior: BehaviorKind;
	entity: string;
	attributes: ExpAttribute[];
	relations: ExpRelation[];
	operations: ExpOperation[];
	policies: ExpPolicy[];
	fixtures: ExpFixture[];
	pieceCount: number;
	wroteKernel: false; // ALWAYS false — the wall; freeze via /goal.
}

// The DECLARED §24.6 catalogue (the exact mirror of catalogueExpansion in behavior.go).
interface BaseExpansion {
	attributes: ExpAttribute[];
	relations: ExpRelation[];
	operations: ExpOperation[];
	policies: ExpPolicy[];
	fixtures: ExpFixture[];
}

const CATALOGUE: Record<BehaviorKind, BaseExpansion> = {
	ownable: {
		attributes: [{ name: "owner_id", type: "string", required: true }],
		relations: [{ name: "owner", target: "User", cardinality: "many-to-one" }],
		operations: [{ name: "transferOwnership" }],
		policies: [
			{
				name: "owner-scoping",
				scope: "OPERATION",
				operation: "mutate",
				effect: "DENY",
			},
		],
		fixtures: [
			{ name: "owner-only-mutation-allowed" },
			{ name: "non-owner-mutation-denied" },
		],
	},
	"soft-deletable": {
		attributes: [{ name: "deleted_at", type: "timestamptz", required: false }],
		relations: [],
		operations: [{ name: "archive" }, { name: "restore" }],
		policies: [
			{
				name: "hide-archived",
				scope: "OPERATION",
				operation: "read",
				effect: "DENY",
			},
		],
		fixtures: [
			{ name: "archived-row-hidden-by-default" },
			{ name: "restore-unhides-row" },
		],
	},
	auditable: {
		attributes: [
			{ name: "created_at", type: "timestamptz", required: true },
			{ name: "updated_at", type: "timestamptz", required: true },
		],
		relations: [],
		operations: [{ name: "audit" }],
		policies: [],
		fixtures: [{ name: "mutation-records-provenance" }],
	},
};

export const BEHAVIOR_CATALOGUE: BehaviorKind[] = [
	"ownable",
	"soft-deletable",
	"auditable",
];

function notIn<T extends { name: string }>(
	items: T[],
	present?: string[],
): T[] {
	const set = new Set(present ?? []);
	return items.filter((x) => !set.has(x.name));
}

/**
 * expand runs the §24.6 behavior-macro expansion (the twin of behavior.Expand). PURE, DRY-RUN,
 * IDEMPOTENT: a piece is emitted only when its name is absent from `existing`; re-expanding an
 * already-expanded entity yields nothing new. Writes no truth (wroteKernel always false). Same
 * attachment → same expansion.
 */
export function expand(a: Attachment): Expansion {
	const base = CATALOGUE[a.behavior];
	const e: Expansion = {
		behavior: a.behavior,
		entity: a.entity,
		attributes: notIn(base.attributes, a.existing?.attributes),
		relations: notIn(base.relations, a.existing?.relations),
		operations: notIn(base.operations, a.existing?.operations),
		policies: notIn(base.policies, a.existing?.policies),
		fixtures: notIn(base.fixtures, a.existing?.fixtures),
		pieceCount: 0,
		wroteKernel: false,
	};
	e.pieceCount =
		e.attributes.length +
		e.relations.length +
		e.operations.length +
		e.policies.length +
		e.fixtures.length;
	return e;
}

// The canonical CE04 attachment — ownable on Order, the §24.6 owner-scoping boilerplate.
export const ATTACHMENT: Attachment = { behavior: "ownable", entity: "Order" };

// ─── CE05 — the REUSE ROUTER (the TS twin of back/runtime/compound/reuse.go) ──────────────────
//
// Determinism-first: the reuse router is a NAME-MATCH ALGORITHM over a declared corpus, never an
// LLM. Same (corpus, next goal) → same plan. The /agents « Compounding » panel runs THIS twin so
// the on-screen effort delta matches the Go router exactly. THE WALL: routing reads + recalls; it
// writes no truth (wroteKernel always false). A behavior reuse recalls the macro's shape but
// freezing still goes idée → miroir → /goal (viaWall=true).

export type ReuseOrigin =
	| "reused_procedural"
	| "reused_behavior"
	| "derived_fresh";

// DECLARED token costs (above the line, never learned — mirror reuse.go's DeriveCost/ReplayCost).
export const DERIVE_COST = 80;
export const REUSE_REPLAY_COST = 20;

export interface CapturedUnit {
	name: string;
	channel: Channel;
}

export interface Corpus {
	procedural: CapturedUnit[];
	behavior: CapturedUnit[];
	sourceGoal: string;
}

export interface NextGoal {
	goalId: string;
	required: string[];
}

export interface ReuseRoute {
	name: string;
	origin: ReuseOrigin;
	tokens: number;
	viaWall: boolean;
}

export interface ReusePlan {
	goal: string;
	sourceGoal: string;
	routes: ReuseRoute[];
	effortBefore: number;
	effortAfter: number;
	savedTokens: number;
	reductionFrac: number;
	reusedProcedural: number;
	reusedBehavior: number;
	derivedFresh: number;
	wroteKernel: false;
}

export class EmptyGoalError extends Error {
	constructor() {
		super("compound: next goal has no id and no required units");
		this.name = "EmptyGoalError";
	}
}

/**
 * reuse routes a NEXT goal's required units against the capitalisation corpus. PURE, TOTAL — the
 * twin of compound.Reuse. A unit reuses iff its name matches a captured procedural (recall, below
 * the line) or behavior (expansion, viaWall) unit; otherwise it derives fresh (paid full). A
 * SIMILAR goal → effortAfter < effortBefore; a DISSIMILAR goal → they are equal (no false
 * positive). wroteKernel is always false (the wall).
 */
export function reuse(corpus: Corpus, next: NextGoal): ReusePlan {
	if (next.goalId === "" && next.required.length === 0) {
		throw new EmptyGoalError();
	}
	const proc = new Set(corpus.procedural.map((u) => u.name));
	const beh = new Set(corpus.behavior.map((u) => u.name));

	const routes: ReuseRoute[] = [];
	let reusedProcedural = 0;
	let reusedBehavior = 0;
	let derivedFresh = 0;
	let effortAfter = 0;

	for (const name of next.required) {
		if (proc.has(name)) {
			routes.push({
				name,
				origin: "reused_procedural",
				tokens: REUSE_REPLAY_COST,
				viaWall: false,
			});
			reusedProcedural++;
			effortAfter += REUSE_REPLAY_COST;
		} else if (beh.has(name)) {
			routes.push({
				name,
				origin: "reused_behavior",
				tokens: REUSE_REPLAY_COST,
				viaWall: true,
			});
			reusedBehavior++;
			effortAfter += REUSE_REPLAY_COST;
		} else {
			routes.push({
				name,
				origin: "derived_fresh",
				tokens: DERIVE_COST,
				viaWall: false,
			});
			derivedFresh++;
			effortAfter += DERIVE_COST;
		}
	}

	const effortBefore = DERIVE_COST * next.required.length;
	const savedTokens = effortBefore - effortAfter;
	return {
		goal: next.goalId,
		sourceGoal: corpus.sourceGoal,
		routes,
		effortBefore,
		effortAfter,
		savedTokens,
		reductionFrac: effortBefore > 0 ? savedTokens / effortBefore : 0,
		reusedProcedural,
		reusedBehavior,
		derivedFresh,
		wroteKernel: false,
	};
}

// The canonical CE05 corpus — what goal-order-archive (CE03) capitalised: its gesture motif as
// procedural recalls, its spec motif as behavior-macro candidates.
export const COMPOUND_CORPUS: Corpus = {
	procedural: [
		{ name: "load_context_pack", channel: "procedural_memory" },
		{ name: "scaffold_package", channel: "procedural_memory" },
		{ name: "project_go_ts", channel: "procedural_memory" },
		{ name: "wire_ui_control", channel: "procedural_memory" },
		{ name: "run_sensors", channel: "procedural_memory" },
	],
	behavior: [
		{ name: "derive_mirror", channel: "behavior_macro" },
		{ name: "write_fixture", channel: "behavior_macro" },
		{ name: "cross_contract", channel: "behavior_macro" },
	],
	sourceGoal: "goal-order-archive",
};

// The canonical SIMILAR next goal — invoice-archive reuses every captured unit + 1 intrinsic.
export const SIMILAR_NEXT_GOAL: NextGoal = {
	goalId: "goal-invoice-archive",
	required: [
		"load_context_pack",
		"scaffold_package",
		"project_go_ts",
		"wire_ui_control",
		"run_sensors",
		"derive_mirror",
		"write_fixture",
		"cross_contract",
		"invoice_specific_rule",
	],
};

// The DISSIMILAR control next goal — shares no unit, reuses nothing (anti-false-positive).
export const DISSIMILAR_NEXT_GOAL: NextGoal = {
	goalId: "goal-pricing-engine",
	required: ["compute_tax", "apply_discount", "round_currency"],
};
