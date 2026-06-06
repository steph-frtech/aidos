/**
 * lib/besoin-thresholds.ts — the TYPESCRIPT TWIN of EL06 (back/runtime/besoin/thresholds.go). Two
 * declared, above-the-line capabilities, both pure/total/deterministic (determinism-first, CLAUDE.md
 * §6/§8), writing NO truth (the wall, §2):
 *
 *   1. BesoinThresholds — ONE declared record of every gate threshold (the product's ≤N scenarios;
 *      the per-rung required fields are SOURCED from the grammar twin, never a second copy). EL07 and
 *      EL11 read the SAME record; the /compound-besoin-thresholds panel reads this twin so the screen
 *      is byte-identical to the Go authority.
 *
 *   2. OptionSpace(L, L+1) — the ENUMERABLE declared metric per adjacent SOURCE-rung pair: the CLOSED
 *      countable set of choices the lower rung admits. size() = len(choices), a positive integer;
 *      NEVER an LLM judgment. A non-enumerable pair is a DECLARED OpenQuestion (enumerable=false,
 *      openQuestion set, size()===-1) — never fabricated to 0.
 */

import { type Level, levels, nextLevel, specOf } from "./besoin-grammar";

export type { Level } from "./besoin-grammar";

// --- BesoinThresholds ---------------------------------------------------------------------------

export interface BesoinThresholds {
	// The product rung's declared upper bound on scenarios (ROADMAP "≤5 scénarios"). Single source.
	maxScenarios: number;
}

// defaultThresholds returns the canonical declared thresholds record. Pure, deterministic.
export function defaultThresholds(): BesoinThresholds {
	return { maxScenarios: 5 }; // ROADMAP EL06/EL07: a product is right-sized at ≤5 scenarios.
}

// requiredFieldsFor returns the declared required body fields a level must carry, SOURCED from the
// grammar twin (specOf) — never a second copy. null for an out-of-grammar level. The returned array
// is a fresh copy.
export function requiredFieldsFor(l: string): string[] | null {
	const s = specOf(l);
	if (!s) return null;
	return [...s.requiredFields];
}

/**
 * thresholdsHash is the content-address of the thresholds record — a SHA-256 over the SAME canonical
 * string the Go side hashes (max_scenarios + the per-rung required fields in allLevels() order), so
 * the TS hash equals the Go hash byte-for-byte. Uses Web Crypto (async). Pure, deterministic.
 */
export async function thresholdsHash(t: BesoinThresholds): Promise<string> {
	const lines: string[] = [`max_scenarios=${t.maxScenarios}\n`];
	// allLevels() order == grammar twin's: source rungs then transversal bands.
	for (const l of allLevelsCanonical()) {
		lines.push(`required[${l}]=${(requiredFieldsFor(l) ?? []).join(",")}\n`);
	}
	const data = new TextEncoder().encode(lines.join(""));
	const digest = await crypto.subtle.digest("SHA-256", data);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

// allLevelsCanonical mirrors Go AllLevels() ordering: the 7 source rungs then the 2 transversal bands.
function allLevelsCanonical(): Level[] {
	return [
		"product",
		"journey",
		"view",
		"control",
		"action",
		"operation",
		"entity",
		"invariant",
		"policy",
	];
}

// --- OptionSpace --------------------------------------------------------------------------------

export interface OptionSpace {
	from: Level;
	to: Level;
	enumerable: boolean;
	choices: string[];
	// The declared reason a pair is NOT enumerable (empty when enumerable).
	openQuestion: string;
}

// optionSpaceSize returns |OptionSpace|: len(choices) for an enumerable pair (positive), or the
// sentinel -1 for a non-enumerable pair (a declared OpenQuestion). NEVER 0 by default.
export function optionSpaceSize(o: OptionSpace): number {
	if (!o.enumerable) return -1;
	return o.choices.length;
}

// OPTION_SPACE_TABLE — the CLOSED declared map from an adjacent SOURCE-rung pair (keyed "from→to") to
// its OptionSpace. Byte-equivalent to the Go optionSpaceTable. Declared, never learned.
const OPTION_SPACE_TABLE: Record<string, OptionSpace> = {
	"product→journey": {
		from: "product",
		to: "journey",
		enumerable: true,
		choices: [
			"onboarding",
			"core-task",
			"recovery",
			"settings",
			"discovery",
			"checkout",
			"admin",
		],
		openQuestion: "",
	},
	"journey→view": {
		from: "journey",
		to: "view",
		enumerable: true,
		choices: [
			"list",
			"detail",
			"form",
			"dashboard",
			"wizard",
			"empty-state",
			"confirmation",
		],
		openQuestion: "",
	},
	"view→control": {
		from: "view",
		to: "control",
		enumerable: true,
		choices: [
			"submit",
			"cancel",
			"navigate",
			"toggle",
			"select",
			"delete",
			"create",
			"edit",
		],
		openQuestion: "",
	},
	"control→action": {
		from: "control",
		to: "action",
		enumerable: true,
		choices: ["command", "query", "navigation"],
		openQuestion: "",
	},
	"action→operation": {
		from: "action",
		to: "operation",
		enumerable: true,
		choices: ["create", "update", "delete", "read", "saga-step"],
		openQuestion: "",
	},
	"operation→entity": {
		from: "operation",
		to: "entity",
		enumerable: false,
		choices: [],
		openQuestion:
			"operation→entity OptionSpace is not enumerable v1: the set of entity aggregate boundaries an operation may mutate is the user's own (open) domain model, not a closed archetype set. Declared OpenQuestion for a later EL — never fabricated to 0.",
	},
};

function optionSpaceKey(from: Level, to: Level): string {
	return `${from}→${to}`;
}

// optionSpaceFor returns the declared OptionSpace for an adjacent SOURCE-rung pair. null for any pair
// that is NOT a consecutive descent pair (out of grammar, non-adjacent, reversed). Pure, total.
export function optionSpaceFor(from: string, to: string): OptionSpace | null {
	const o = OPTION_SPACE_TABLE[optionSpaceKey(from as Level, to as Level)];
	if (!o) return null;
	return { ...o, choices: [...o.choices] };
}

export interface OptionSpacePair {
	from: Level;
	to: Level;
}

// optionSpacePairs returns every declared OptionSpace pair, in canonical descent order. Exactly the
// consecutive SOURCE-rung pairs. Pure, total.
export function optionSpacePairs(): OptionSpacePair[] {
	const out: OptionSpacePair[] = [];
	for (const l of levels()) {
		const next = nextLevel(l);
		if (!next) continue;
		if (OPTION_SPACE_TABLE[optionSpaceKey(l, next)]) {
			out.push({ from: l, to: next });
		}
	}
	return out;
}

// enumerableOptionSpacePairs returns only the pairs whose OptionSpace is enumerable. Pure, total.
export function enumerableOptionSpacePairs(): OptionSpacePair[] {
	return optionSpacePairs().filter((p) => {
		const o = optionSpaceFor(p.from, p.to);
		return o?.enumerable === true;
	});
}

// openQuestionOptionSpacePairs returns the pairs declared NON-enumerable (each carrying its
// OpenQuestion reason) — the honest "not enumerable yet" set, never counted as 0. Pure, total.
export function openQuestionOptionSpacePairs(): OptionSpacePair[] {
	return optionSpacePairs().filter((p) => {
		const o = optionSpaceFor(p.from, p.to);
		return o?.enumerable === false;
	});
}
