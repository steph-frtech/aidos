/**
 * lib/besoin-completeness.ts — the TYPESCRIPT TWIN of EL09 (back/runtime/besoin/completeness.go +
 * mirrorform.go). The completeness law applied to the BESOIN, all PURE/TOTAL/DETERMINISTIC:
 *
 *   - levelMirrorForm(level) → the expected mirror FORM per rung (the EL10 table EL09 consumes). For
 *     the 5 rungs derive-mirror covers it carries the SAME form (no fork); for product/journey/view it
 *     carries the freshly-declared need-side form. Out-of-grammar → null (no fabrication).
 *   - besoinCompleteness(nodes, mirrors, metaComplete) → { complete, monsters[] }: every `resolved`
 *     node must have its right-form level-mirror + live metadata, and no level-mirror may dangle
 *     (orphan). Breaking the node↔mirror link in EITHER direction makes a monster appear (red).
 *
 * Monster detection is COUNTING + MATCHING (a pure function), never an LLM judgment. A BesoinLevelMirror
 * is the NEED-SIDE description of "this resolved rung is provable by a mirror of THIS form" — NOT a real
 * mirror in the `mirrors` schema. This twin WRITES NO mirror and no truth (the wall, §2). It REUSES the
 * grammar twin (allLevels/isLevel/levelRank) — byte-equivalent to the Go authority.
 */

import {
	allLevels,
	isLevel,
	type Level,
	SOURCE_ORDER,
	TRANSVERSAL_BANDS,
} from "./besoin-grammar";

// MirrorForm — the closed set of mirror shapes (KRD three forms + the two need-side screen forms).
export type MirrorForm =
	| "gherkin_n0"
	| "screen_fixture"
	| "fixture_n2"
	| "property_n1";

export function mirrorForms(): MirrorForm[] {
	return ["gherkin_n0", "screen_fixture", "fixture_n2", "property_n1"];
}

export function isMirrorForm(f: string): f is MirrorForm {
	return mirrorForms().includes(f as MirrorForm);
}

// The 5 rungs the skill derive-mirror already covers (entity/policy/operation/control/action). For
// these levelMirrorForm DELEGATES (zero duplication); product/journey/view carry the fresh form.
const DERIVED_MIRROR_COVERS: Record<string, boolean> = {
	entity: true,
	policy: true,
	operation: true,
	control: true,
	action: true,
};

export function derivedMirrorCovers(l: Level): boolean {
	return DERIVED_MIRROR_COVERS[l] === true;
}

// The closed, total map Level → expected MirrorForm. Declared, never learned (CLAUDE.md §8).
const LEVEL_MIRROR_FORMS: Record<string, MirrorForm> = {
	product: "gherkin_n0",
	journey: "gherkin_n0",
	view: "screen_fixture",
	control: "fixture_n2",
	action: "fixture_n2",
	operation: "fixture_n2",
	entity: "property_n1",
	invariant: "property_n1",
	policy: "fixture_n2",
};

// levelMirrorForm returns the expected mirror form of a grammar Level, or null for a non-Level (no
// fabrication). Pure, total. THE WALL: it annexes a form; it writes no mirror.
export function levelMirrorForm(l: string): MirrorForm | null {
	if (!isLevel(l)) return null;
	return LEVEL_MIRROR_FORMS[l] ?? null;
}

// --- EL10 view/journey schema validators (the TWIN of back/runtime/besoin/validators.go) -----------
// The two above-the-wall rungs with NO Go backing pkg (view/journey) get a dedicated DETERMINISTIC
// schema validator. PURE/TOTAL of the body alone — a structural check, never an LLM judgment. Same body
// → same verdict. THE WALL: reads a body, writes nothing.

export interface SchemaResult {
	valid: boolean;
	field?: string;
	reason?: string;
}

function namedList(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	const out: string[] = [];
	for (const e of v) {
		if (typeof e === "string") {
			const s = e.trim();
			if (s !== "") out.push(s);
		} else if (e && typeof e === "object" && "name" in e) {
			const name = String((e as { name?: unknown }).name ?? "").trim();
			if (name !== "") out.push(name);
		}
	}
	return out;
}

function isEmptyStr(v: unknown): boolean {
	return (
		v === undefined || v === null || (typeof v === "string" && v.trim() === "")
	);
}

// validateViewSchema — a view body MUST carry a non-empty goal + ≥1 named zone + ≥1 named datum. A body
// that parses but lists no zones FAILS. Byte-equivalent to Go ValidateViewSchema. Pure, total.
export function validateViewSchema(
	body: Record<string, unknown>,
): SchemaResult {
	if (isEmptyStr(body.goal)) {
		return {
			valid: false,
			field: "body:goal",
			reason: "Le view doit déclarer un `goal` (le but de l'écran) non vide.",
		};
	}
	if (namedList(body.zones).length === 0) {
		return {
			valid: false,
			field: "body:zones",
			reason:
				"Le view doit déclarer au moins une `zone` nommée (un écran sans zone n'est pas un écran).",
		};
	}
	if (namedList(body.data).length === 0) {
		return {
			valid: false,
			field: "body:data",
			reason:
				"Le view doit déclarer au moins une donnée affichée nommée (`data`).",
		};
	}
	return { valid: true };
}

// isParsableGherkin — ≥1 Given AND When AND Then (case-insensitive). Byte-equivalent to the Go rule.
function isParsableGherkin(g: string): boolean {
	const low = g.toLowerCase();
	return low.includes("given") && low.includes("when") && low.includes("then");
}

// validateJourneySchema — a journey body MUST carry a parseable Gherkin (≥1 Given/When/Then). A
// free-text blob FAILS. Byte-equivalent to Go ValidateJourneySchema. Pure, total.
export function validateJourneySchema(
	body: Record<string, unknown>,
): SchemaResult {
	const g = typeof body.gherkin === "string" ? body.gherkin : "";
	if (g.trim() === "") {
		return {
			valid: false,
			field: "body:gherkin",
			reason: "Le journey doit déclarer un champ `gherkin` non vide.",
		};
	}
	if (!isParsableGherkin(g)) {
		return {
			valid: false,
			field: "body:gherkin",
			reason:
				"Le Gherkin du journey n'est pas parsable (il faut au moins un Given/When/Then).",
		};
	}
	return { valid: true };
}

// validateLevelSchema dispatches to the dedicated EL10 validator for view/journey only (the rungs with
// no Go backing pkg). Returns null for any other rung. Pure, total.
export function validateLevelSchema(
	level: Level,
	body: Record<string, unknown>,
): SchemaResult | null {
	if (level === "view") return validateViewSchema(body);
	if (level === "journey") return validateJourneySchema(body);
	return null;
}

// MonsterCode — the closed besoin-local set of completeness-violation codes (mirrors the Go enum).
export type MonsterCode =
	| "NEED_LEVEL_WITHOUT_MIRROR"
	| "ORPHAN_NEED_MIRROR"
	| "NEED_MIRROR_WRONG_FORM"
	| "NEED_LEVEL_METADATA_DISAPPEARED";

export function monsterCodes(): MonsterCode[] {
	return [
		"NEED_LEVEL_WITHOUT_MIRROR",
		"ORPHAN_NEED_MIRROR",
		"NEED_MIRROR_WRONG_FORM",
		"NEED_LEVEL_METADATA_DISAPPEARED",
	];
}

export function isMonsterCode(c: string): c is MonsterCode {
	return monsterCodes().includes(c as MonsterCode);
}

export type NodeStatus = "empty" | "drafting" | "resolved";

// CompletenessNode is a graph node as the completeness law reads it: its level and lifecycle status.
export interface CompletenessNode {
	level: Level;
	status: NodeStatus;
}

// BesoinLevelMirror — the NEED-SIDE description that a resolved rung is provable by a mirror of a form.
// NOT a real mirror in the `mirrors` schema (the wall).
export interface BesoinLevelMirror {
	reflects: Level;
	form: MirrorForm;
}

export interface Monster {
	code: MonsterCode;
	level: Level | "";
	explanation: string;
	howToFix: string[];
}

export interface CompletenessReport {
	complete: boolean;
	monsters: Monster[];
}

// levelRank ranks a level for deterministic ordering: SOURCE rungs by descent index, then bands. Pure.
function levelRank(l: Level): number {
	const si = SOURCE_ORDER.indexOf(l);
	if (si >= 0) return si;
	const bi = TRANSVERSAL_BANDS.indexOf(l);
	if (bi >= 0) return SOURCE_ORDER.length + bi;
	return SOURCE_ORDER.length + TRANSVERSAL_BANDS.length;
}

function monsterLevelRank(l: Level | ""): number {
	if (l !== "" && isLevel(l)) return levelRank(l);
	return SOURCE_ORDER.length + TRANSVERSAL_BANDS.length + 1;
}

// besoinCompleteness computes the EL09 report. metaComplete maps a resolved node's level to whether its
// four EL04 metadata are still present/certifiable (the screen supplies it; the twin does not
// re-implement the kernel classifier — byte-equivalent gate b). Pure, total, deterministic.
export function besoinCompleteness(
	nodes: CompletenessNode[],
	mirrors: BesoinLevelMirror[],
	metaComplete: Record<string, boolean>,
): CompletenessReport {
	const monsters: Monster[] = [];

	const mirrorByLevel = new Map<Level, BesoinLevelMirror>();
	for (const m of mirrors) mirrorByLevel.set(m.reflects, m);

	// 1. Every resolved node must have its statable level-mirror of the right form + live metadata.
	for (const n of nodes) {
		if (n.status !== "resolved") continue;
		const wantForm = levelMirrorForm(n.level);
		const mir = mirrorByLevel.get(n.level);
		if (!mir) {
			monsters.push({
				code: "NEED_LEVEL_WITHOUT_MIRROR",
				level: n.level,
				explanation: `Le niveau "${n.level}" est \`resolved\` mais aucun miroir-de-niveau ne le reflète : une vérité-besoin sans miroir est un souhait (loi de complétude).`,
				howToFix: [
					"state_level_mirror",
					`énoncez le miroir-de-niveau de forme "${wantForm}" pour le rung "${n.level}" (via /goal, sous le mur)`,
				],
			});
		} else if (mir.form !== wantForm) {
			monsters.push({
				code: "NEED_MIRROR_WRONG_FORM",
				level: n.level,
				explanation: `Le miroir-de-niveau du rung "${n.level}" porte la forme "${mir.form}" alors que levelMirrorForm exige "${wantForm}".`,
				howToFix: [
					"fix_mirror_form",
					`ré-énoncez le miroir avec la forme "${wantForm}"`,
				],
			});
		}

		// The four metadata of a resolved node must still be present/certifiable (EL04 reused).
		if (metaComplete[n.level] !== true) {
			monsters.push({
				code: "NEED_LEVEL_METADATA_DISAPPEARED",
				level: n.level,
				explanation: `Le niveau "${n.level}" est \`resolved\` mais ses métadonnées par-vérité ne sont plus présentes/certifiables (EL04).`,
				howToFix: [
					"declare_missing_metadata",
					"re-certifiez les quatre métadonnées (truth_kind/verifiability/scope/authority)",
				],
			});
		}
	}

	// 2. Every declared level-mirror must reflect a `resolved` node of the graph — else it is an orphan.
	const resolvedLevels = new Set<Level>(
		nodes.filter((n) => n.status === "resolved").map((n) => n.level),
	);
	for (const m of mirrors) {
		if (!resolvedLevels.has(m.reflects)) {
			monsters.push({
				code: "ORPHAN_NEED_MIRROR",
				level: m.reflects,
				explanation: `Un miroir-de-niveau prétend refléter le rung "${m.reflects}" mais aucun nœud \`resolved\` ne lui correspond : un miroir orphelin est un monstre (loi de complétude).`,
				howToFix: [
					"reflect_a_resolved_node",
					"supprimez le miroir orphelin OU résolvez le nœud qu'il prétend refléter",
				],
			});
		}
	}

	monsters.sort((a, b) => {
		const ra = monsterLevelRank(a.level);
		const rb = monsterLevelRank(b.level);
		if (ra !== rb) return ra - rb;
		if (a.code !== b.code) return a.code < b.code ? -1 : 1;
		if (a.explanation === b.explanation) return 0;
		return a.explanation < b.explanation ? -1 : 1;
	});

	return { complete: monsters.length === 0, monsters };
}

// allGrammarLevels re-exports the grammar's allLevels for callers (screen) needing the 9-rung sweep.
export function allGrammarLevels(): Level[] {
	return allLevels();
}
