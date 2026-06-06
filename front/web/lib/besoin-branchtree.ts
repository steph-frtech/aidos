/**
 * lib/besoin-branchtree.ts — the TYPESCRIPT TWIN of EL12 (back/runtime/besoin/branchtree.go). The
 * deterministic, code-authoritative per-level DECISION TREE (the Example-Mapping built above the
 * wall) + the altitude classification by SCHEMA-MISMATCH. THREE pure, total functions, the LLM
 * excluded (CLAUDE.md §6/§8 determinism-first):
 *
 *   - branchTree(level, body) → OpenBranch[]: for a level, the CLOSED set of branches that must be
 *     closed for `resolved`. One branch per declared required field (the EL06 single source), plus
 *     the per-rung parse rule, plus the anti-vacuity branch (EL07.e). Each branch records whether the
 *     body CLOSES it. Sorted by (kind, field) → order-independent.
 *   - isResolved(branches, antiVacuity?) → boolean: all branches closed.
 *   - classifyAltitude(body) / matchesSchema / isOffAltitude: route a body to the level whose declared
 *     besoin_level_schema (required fields) it BEST satisfies. An entity `attributes` body submitted
 *     at `product` FAILS the product schema — a declared field-set MISMATCH, never an LLM opinion.
 *
 * Byte-equivalent to the Go authority; reuses the grammar + thresholds twins (single source). Writes
 * NO truth — BranchTree feeds Idea.Intent / the /grill triage, never a kernel write (the wall, §2).
 */

import {
	allLevels,
	isLevel,
	isSourceRung,
	type Level,
	nextLevel,
} from "./besoin-grammar";
import {
	defaultThresholds,
	optionSpaceFor,
	requiredFieldsFor,
} from "./besoin-thresholds";

export type BranchKind = "required_field" | "parse_rule" | "anti_vacuity";

export interface OpenBranch {
	level: Level;
	kind: BranchKind;
	field: string;
	closed: boolean;
	question: string;
	howToFix: string[];
}

export type LevelBody = Record<string, unknown>;

const FORWARD_DEP_SHRINK = 1;

// branchTree returns the CLOSED set of decision-tree branches for `level`, each annotated with
// whether `body` closes it. Empty (= no tree) for a non-grammar level (fail-closed). Sorted by
// (kind, field) so the tree is order-independent.
export function branchTree(level: string, body: LevelBody): OpenBranch[] {
	if (!isLevel(level)) return [];
	const b = body ?? {};
	const branches: OpenBranch[] = [];

	for (const f of requiredFieldsFor(level) ?? []) {
		const closed = !isEmptyField(b[f]);
		branches.push({
			level,
			kind: "required_field",
			field: f,
			closed,
			question: `Le champ requis « ${f} » du niveau ${level} est-il déclaré et non-vide ?`,
			howToFix: closed ? [] : [`declare_field:${f}`],
		});
	}

	const parse = parseRuleBranch(level, b);
	if (parse) branches.push(parse);

	if (isSourceRung(level)) branches.push(antiVacuityBranch(level, b));

	branches.sort((x, y) =>
		x.kind !== y.kind
			? x.kind < y.kind
				? -1
				: 1
			: x.field < y.field
				? -1
				: x.field > y.field
					? 1
					: 0,
	);
	return branches;
}

function parseRuleBranch(level: Level, body: LevelBody): OpenBranch | null {
	switch (level) {
		case "product": {
			const th = defaultThresholds();
			const scn = body.scenarios;
			const closed =
				Array.isArray(scn) && scn.length >= 1 && scn.length <= th.maxScenarios;
			return {
				level,
				kind: "parse_rule",
				field: "scenarios:bound",
				closed,
				question: `Le product déclare-t-il entre 1 et ${th.maxScenarios} scénarios (seuil EL06) ?`,
				howToFix: closed ? [] : ["right_size_scenarios"],
			};
		}
		case "journey": {
			const closed = isParsableGherkin(asString(body.gherkin));
			return {
				level,
				kind: "parse_rule",
				field: "gherkin:parsable",
				closed,
				question:
					"Le journey contient-il un scénario Gherkin parsable (Given/When/Then) ?",
				howToFix: closed ? [] : ["write_parsable_gherkin"],
			};
		}
		case "view": {
			const closed =
				!isEmptyField(body.goal) &&
				!isEmptyField(body.zones) &&
				!isEmptyField(body.data);
			return {
				level,
				kind: "parse_rule",
				field: "view:schema",
				closed,
				question:
					"La vue déclare-t-elle un but, ≥1 zone nommée et ≥1 donnée nommée ?",
				howToFix: closed ? [] : ["name_zones_and_data"],
			};
		}
		case "control": {
			const closed =
				typeof body.visible_when === "boolean" &&
				typeof body.enabled_when === "boolean";
			return {
				level,
				kind: "parse_rule",
				field: "conditions:bool",
				closed,
				question:
					"visible_when et enabled_when sont-ils typés booléens (Expr bool, EL02) ?",
				howToFix: closed ? [] : ["type_conditions_bool"],
			};
		}
		default:
			return null;
	}
}

function antiVacuityBranch(level: Level, body: LevelBody): OpenBranch {
	const shrink = shrinkOptionSpaceForBody(level, body);
	const closed = shrink > 0;
	return {
		level,
		kind: "anti_vacuity",
		field: "option_space",
		closed,
		question: `Le niveau ${level} rétrécit-il l'espace d'options du rung inférieur (anti-vacuité EL07.e) ?`,
		howToFix: closed ? [] : ["narrow_option_space"],
	};
}

// shrinkOptionSpaceForBody mirrors the Go twin: same declared OptionSpace + same forward-dep sentinel.
export function shrinkOptionSpaceForBody(
	level: Level,
	body: LevelBody,
): number {
	const refTo = nextLevel(level);
	if (!refTo) return FORWARD_DEP_SHRINK; // entity leaf — vacuously satisfied.
	const os = optionSpaceFor(level, refTo);
	if (!os?.enumerable) return FORWARD_DEP_SHRINK; // declared OpenQuestion (operation→entity).
	const selected = stringSet(body.selects);
	if (selected.size === 0) return 0;
	const full = new Set(os.choices);
	let kept = 0;
	for (const c of selected) if (full.has(c)) kept++;
	if (kept === 0) return 0;
	const shrink = os.choices.length - kept;
	return shrink < 0 ? 0 : shrink;
}

// openBranches returns the still-open branches of a tree, preserving order.
export function openBranches(tree: OpenBranch[]): OpenBranch[] {
	return tree.filter((b) => !b.closed);
}

// isResolved is true iff every branch is closed (the level is right-sized). COMPUTED, never declared.
export function isResolved(tree: OpenBranch[]): boolean {
	return openBranches(tree).length === 0;
}

// antiVacuitySatisfied reports whether the tree's anti-vacuity branch is closed (true for a tree with
// no anti-vacuity branch — a transversal band, vacuously satisfied).
export function antiVacuitySatisfied(tree: OpenBranch[]): boolean {
	const b = tree.find((x) => x.kind === "anti_vacuity");
	return b ? b.closed : true;
}

// --- altitude classification by schema-mismatch -------------------------------------------------

export interface Altitude {
	best: Level | "";
	matched: boolean;
	scores: Record<string, number>;
}

// matchesSchema reports whether `body` satisfies a level's besoin_level_schema: every declared
// required field present and non-empty. Fail-closed (false) for a non-grammar level.
export function matchesSchema(level: string, body: LevelBody): boolean {
	const req = requiredFieldsFor(level);
	if (!req) return false;
	const b = body ?? {};
	for (const f of req) if (isEmptyField(b[f])) return false;
	return true;
}

function schemaScore(level: Level, body: LevelBody): number {
	let n = 0;
	for (const f of requiredFieldsFor(level) ?? [])
		if (!isEmptyField(body[f])) n++;
	return n;
}

// levelRank mirrors the Go graph.levelRank order so tie-breaking toward the DEEPEST rung matches the
// authority. Source rungs in descent order, then transversal bands after.
const RANK_ORDER: Level[] = [
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
function levelRank(l: Level): number {
	const i = RANK_ORDER.indexOf(l);
	return i < 0 ? RANK_ORDER.length : i;
}

// classifyAltitude routes a body to the level whose besoin_level_schema it BEST (fully) satisfies,
// breaking ties toward the deepest (most specific) rung. Matched=false when no schema is satisfied —
// never guessed. Pure, total, deterministic.
export function classifyAltitude(body: LevelBody): Altitude {
	const b = body ?? {};
	const scores: Record<string, number> = {};
	let best: Level | "" = "";
	let bestRank = -1;
	let matched = false;
	for (const l of allLevels()) {
		scores[l] = schemaScore(l, b);
		if (!matchesSchema(l, b)) continue;
		const r = levelRank(l);
		if (!matched || r > bestRank) {
			matched = true;
			best = l;
			bestRank = r;
		}
	}
	return { best, matched, scores };
}

// isOffAltitude reports whether a body submitted AT `claimed` is off-altitude: it does NOT satisfy the
// claimed level's schema. The negation of matchesSchema (no separate judgment path).
export function isOffAltitude(claimed: string, body: LevelBody): boolean {
	return !matchesSchema(claimed, body);
}

// --- shared helpers (byte-equivalent to candescend.go) ------------------------------------------

function isEmptyField(v: unknown): boolean {
	if (v === null || v === undefined) return true;
	if (typeof v === "string") return v.trim() === "";
	if (Array.isArray(v)) return v.length === 0;
	if (typeof v === "object") return Object.keys(v as object).length === 0;
	return false;
}

function asString(v: unknown): string {
	return typeof v === "string" ? v : "";
}

function isParsableGherkin(g: string): boolean {
	const low = g.toLowerCase();
	return low.includes("given") && low.includes("when") && low.includes("then");
}

function stringSet(v: unknown): Set<string> {
	const out = new Set<string>();
	if (!Array.isArray(v)) return out;
	for (const e of v) if (typeof e === "string" && e.trim() !== "") out.add(e);
	return out;
}
