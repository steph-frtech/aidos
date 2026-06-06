/**
 * lib/besoin-grammar.ts — the TYPESCRIPT TWIN of the EL02 CLOSED grammar
 * (back/runtime/besoin/grammar.go + spec.go). Pure, total, deterministic functions: same input →
 * same output, no clock/rng/IO/LLM (determinism-first, CLAUDE.md §6/§8). The /compound-besoin-grammar
 * panel reads this twin so the grammar shown on screen is byte-identical to what the Go authority
 * computes. EL02 fixes ONLY the grammar (the closed enumeration + order + bands + per-level shape);
 * it writes NO truth (the wall) — there is no kernel/mirrors/fitness path here.
 *
 * SCOPE v1 (declared, not omitted): the 7 SOURCE rungs of KRD §23 + the 2 transversal bands
 * (invariant, policy). The kernel layers saga/temporal/globalinvariant are DELIBERATELY
 * out-of-grammar-v1 (a declared OpenQuestion) — named in OUT_OF_SCOPE_LEVELS and refused hard, never
 * aliased.
 */

export type Level =
	| "product"
	| "journey"
	| "view"
	| "control"
	| "action"
	| "operation"
	| "entity"
	| "invariant"
	| "policy";

// The TOTAL, CLOSED top-down order of the 7 SOURCE rungs (KRD §23). Mirrors sourceOrder in
// grammar.go exactly. The transversal bands are NOT in this list (NextLevel never traverses them).
export const SOURCE_ORDER: Level[] = [
	"product",
	"journey",
	"view",
	"control",
	"action",
	"operation",
	"entity",
];

// The closed set of transversal bands. invariant attaches to every SOURCE rung; policy attaches to
// operation/entity only (EL02 decision: policy is a band, not a vertical rung).
export const TRANSVERSAL_BANDS: Level[] = ["invariant", "policy"];

// The named, declared out-of-grammar-v1 kernel layers. NOT Levels — refused hard (a declared
// OpenQuestion for a later EL), never aliased to a real rung.
export const OUT_OF_SCOPE_LEVELS: string[] = [
	"saga",
	"temporal",
	"globalinvariant",
];

// The per-level required body fields + the single outgoing reference (control→action, action→
// operation, operation→entity — the constrains edges of the verticale). Mirrors levelSpecs in
// spec.go exactly.
export interface LevelSpec {
	level: Level;
	requiredFields: string[];
	refTo?: Level;
	refField?: string;
	transversal: boolean;
	attachableTo?: Level[];
}

const SPECS: Record<Level, LevelSpec> = {
	product: {
		level: "product",
		requiredFields: ["intent", "scenarios"],
		refTo: "journey",
		refField: "journeys",
		transversal: false,
	},
	journey: {
		level: "journey",
		requiredFields: ["gherkin"],
		refTo: "view",
		refField: "views",
		transversal: false,
	},
	view: {
		level: "view",
		requiredFields: ["goal", "zones", "data"],
		refTo: "control",
		refField: "controls",
		transversal: false,
	},
	control: {
		level: "control",
		requiredFields: ["visible_when", "enabled_when", "triggers"],
		refTo: "action",
		refField: "triggers",
		transversal: false,
	},
	action: {
		level: "action",
		requiredFields: ["invoke"],
		refTo: "operation",
		refField: "invoke",
		transversal: false,
	},
	operation: {
		level: "operation",
		requiredFields: ["steps", "fixture"],
		refTo: "entity",
		refField: "mutate",
		transversal: false,
	},
	entity: {
		level: "entity",
		requiredFields: ["attributes"],
		transversal: false,
	},
	invariant: {
		level: "invariant",
		requiredFields: ["statement"],
		transversal: true,
		attachableTo: [
			"product",
			"journey",
			"view",
			"control",
			"action",
			"operation",
			"entity",
		],
	},
	policy: {
		level: "policy",
		requiredFields: ["rule"],
		transversal: true,
		attachableTo: ["operation", "entity"],
	},
};

// levels returns the 7 SOURCE rungs in canonical order (a copy).
export function levels(): Level[] {
	return [...SOURCE_ORDER];
}

// transversalBands returns the closed band set (a copy).
export function transversalBands(): Level[] {
	return [...TRANSVERSAL_BANDS];
}

// outOfScopeLevels returns the declared out-of-grammar-v1 layers (a copy).
export function outOfScopeLevels(): string[] {
	return [...OUT_OF_SCOPE_LEVELS];
}

// allLevels returns every valid Level — the 7 SOURCE rungs then the 2 bands.
export function allLevels(): Level[] {
	return [...SOURCE_ORDER, ...TRANSVERSAL_BANDS];
}

export function isSourceRung(l: string): boolean {
	return (SOURCE_ORDER as string[]).includes(l);
}

export function isTransversalBand(l: string): boolean {
	return (TRANSVERSAL_BANDS as string[]).includes(l);
}

export function isOutOfScope(l: string): boolean {
	return OUT_OF_SCOPE_LEVELS.includes(l);
}

// isLevel reports whether l is a valid Level (a SOURCE rung OR a transversal band). Out-of-scope and
// unknown strings are false (hard refusal, no alias).
export function isLevel(l: string): l is Level {
	return isSourceRung(l) || isTransversalBand(l);
}

export type ParseError = "unknown" | "out_of_scope";
export type ParseResult =
	| { ok: true; level: Level }
	| { ok: false; error: ParseError };

// parseLevel resolves a raw string to a Level, refusing anything out of grammar HARD. A named
// out-of-scope layer returns error "out_of_scope" (explains itself); any other unknown returns
// "unknown".
export function parseLevel(s: string): ParseResult {
	if (isLevel(s)) return { ok: true, level: s };
	if (isOutOfScope(s)) return { ok: false, error: "out_of_scope" };
	return { ok: false, error: "unknown" };
}

function sourceIndex(l: Level): number {
	return SOURCE_ORDER.indexOf(l);
}

// nextLevel returns the SOURCE rung immediately below current, or null at the leaf (entity) or when
// current is not a SOURCE rung (bands are never traversed).
export function nextLevel(current: Level): Level | null {
	const i = sourceIndex(current);
	if (i < 0 || i + 1 >= SOURCE_ORDER.length) return null;
	return SOURCE_ORDER[i + 1];
}

// prevLevel returns the SOURCE rung immediately above current, or null at the top (product) or for a
// non-SOURCE rung.
export function prevLevel(current: Level): Level | null {
	const i = sourceIndex(current);
	if (i <= 0) return null;
	return SOURCE_ORDER[i - 1];
}

// specOf returns the grammar spec of a Level, or null for a non-Level.
export function specOf(l: string): LevelSpec | null {
	if (!isLevel(l)) return null;
	return SPECS[l];
}

// outgoingRef returns the deeper rung + field a level resolves toward, or null for the entity leaf,
// the transversal bands, and non-levels.
export function outgoingRef(
	l: Level,
): { refTo: Level; refField: string } | null {
	const s = SPECS[l];
	if (!s || !s.refTo || !s.refField) return null;
	return { refTo: s.refTo, refField: s.refField };
}

// attachableTo reports whether a transversal band may attach to a SOURCE rung. null when band is not
// a transversal band.
export function attachableTo(band: Level, rung: Level): boolean | null {
	const s = SPECS[band];
	if (!s || !s.transversal || !s.attachableTo) return null;
	return s.attachableTo.includes(rung);
}
