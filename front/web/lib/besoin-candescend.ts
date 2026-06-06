/**
 * lib/besoin-candescend.ts — the TYPESCRIPT TWIN of EL07 (back/runtime/besoin/candescend.go). The
 * PURE, TOTAL, DETERMINISTIC forcing function of the compound-du-besoin gate:
 *
 *   canDescend(node, level, metaComplete) → Verdict computes `enough` (anti-Goodhart §8: COMPUTED,
 *   never declared) over the five gates:
 *     (a) body statable AND non-vacant (required fields + per-rung parse rules);
 *     (b) the four metadata present/certifiable (the screen passes metaComplete from EL04);
 *     (c) outgoing SOURCE ref resolves @version — OR a forward dependency (carried OpenQuestion, §6);
 *     (e) ANTI-VACUITY: shrinkOptionSpace(node, level) > 0 — a parsable level that narrows nothing is
 *         not_enough (anti-gaming).
 *   (d) — frozen-anchor contradiction — is EL08's cascade; the twin reads only the node body.
 *
 * It REUSES the grammar + thresholds twins (the single source) so the screen never re-implements the
 * gate; the verdict is byte-equivalent to the Go authority. Writes NO truth (the wall, §2).
 */

import {
	isSourceRung,
	type Level,
	nextLevel,
	outgoingRef,
} from "./besoin-grammar";
import {
	defaultThresholds,
	optionSpaceFor,
	requiredFieldsFor,
} from "./besoin-thresholds";

// BesoinBlockCode — the closed, besoin-local refusal codes (byte-identical to the Go BesoinBlockCode).
export type BesoinBlockCode =
	| "BESOIN_NODE_ABSENT"
	| "BESOIN_BODY_VACANT_OR_MALFORMED"
	| "BESOIN_METADATA_INCOMPLETE"
	| "BESOIN_REF_UNRESOLVED"
	| "BESOIN_OPTION_SPACE_NOT_NARROWED";

export interface BlockReason {
	code: BesoinBlockCode;
	severity: "blocking";
	explanation: string;
	howToFix: string[];
}

// LevelBody is the declared rung content the gate validates (free-shape; the twin reads the fields it
// needs per rung). `selects` is the closed-set subset of lower-rung archetypes the body retains.
export type LevelBody = Record<string, unknown>;

export interface NodeInput {
	level: Level;
	body: LevelBody;
	// refsTo are the resolved outgoing reference targets (the lower rungs this node reaches).
	refsTo: Level[];
	present: boolean;
}

export interface Verdict {
	enough: boolean;
	missing: string[];
	openQuestions: string[];
	blockReasons: BlockReason[];
}

const FORWARD_DEP_SHRINK = 1;

// shrinkOptionSpace counts how much the node's body PRUNES the lower rung's declared OptionSpace
// (EL06). shrink = N − kept; a body selecting nothing (or only invalid choices) → 0; a non-enumerable
// pair or a leaf → the positive sentinel (carried OpenQuestion). Pure, deterministic.
export function shrinkOptionSpace(node: NodeInput, level: Level): number {
	if (!isSourceRung(level)) return FORWARD_DEP_SHRINK;
	const refTo = nextLevel(level);
	if (!refTo) return FORWARD_DEP_SHRINK; // entity leaf — vacuously satisfied.
	const os = optionSpaceFor(level, refTo);
	if (!os || !os.enumerable) return FORWARD_DEP_SHRINK; // declared OpenQuestion (operation→entity).
	if (!node.present) return 0;
	const selected = stringSet(node.body.selects);
	if (selected.size === 0) return 0;
	const full = new Set(os.choices);
	let kept = 0;
	for (const c of selected) if (full.has(c)) kept++;
	if (kept === 0) return 0;
	const shrink = os.choices.length - kept;
	return shrink < 0 ? 0 : shrink;
}

// canDescend computes the EL07 verdict. metaComplete carries the EL04 metadata verdict (gate (b)) —
// the screen supplies it (the twin does not re-implement the kernel classifier). Pure, deterministic.
export function canDescend(
	node: NodeInput,
	level: Level,
	metaComplete: boolean,
): Verdict {
	const v: Verdict = {
		enough: false,
		missing: [],
		openQuestions: [],
		blockReasons: [],
	};

	if (!node.present) {
		return notEnough(
			v,
			"node",
			"BESOIN_NODE_ABSENT",
			`Aucun nœud ${level} dans le BesoinGraph : il n'y a rien à right-sizer.`,
			["declare_level_body"],
		);
	}

	// (a) body statable AND non-vacant.
	const bodyGap = checkBody(level, node.body);
	if (bodyGap)
		notEnough(v, bodyGap.missing, bodyGap.code, bodyGap.expl, bodyGap.fix);

	// (b) four metadata.
	if (!metaComplete) {
		notEnough(
			v,
			"metadata",
			"BESOIN_METADATA_INCOMPLETE",
			"Les quatre métadonnées (truth_kind, verifiability, scope, authority) ne sont pas toutes présentes/certifiables (EL04).",
			["declare_missing_metadata"],
		);
	}

	// (c) outgoing ref resolves — or forward dependency.
	const ref = outgoingRef(level);
	if (ref) {
		const resolved = node.refsTo.includes(ref.refTo);
		if (!resolved) {
			const os = optionSpaceFor(level, ref.refTo);
			if (os && !os.enumerable) {
				appendUnique(
					v.openQuestions,
					`forward-dep: ${level}→${ref.refTo} non résolu — ${os.openQuestion ?? ""} (OpenQuestion portée, bootstrap §6, jamais un résiduel bloquant).`,
				);
			} else {
				notEnough(
					v,
					`ref:${ref.refField}`,
					"BESOIN_REF_UNRESOLVED",
					`La référence sortante ${ref.refField} (${level}→${ref.refTo}) ne résout pas @version.`,
					["resolve_ref"],
				);
			}
		}
	}

	// (e) anti-vacuity.
	if (shrinkOptionSpace(node, level) === 0) {
		notEnough(
			v,
			"option_space",
			"BESOIN_OPTION_SPACE_NOT_NARROWED",
			"Le niveau parse mais ne rétrécit PAS l'espace d'options du niveau inférieur (anti-vacuité, anti-gaming).",
			["narrow_option_space"],
		);
	}

	v.enough = v.blockReasons.length === 0;
	v.missing.sort();
	v.openQuestions.sort();
	return v;
}

function notEnough(
	v: Verdict,
	missing: string,
	code: BesoinBlockCode,
	explanation: string,
	howToFix: string[],
): Verdict {
	appendUnique(v.missing, missing);
	v.blockReasons.push({ code, severity: "blocking", explanation, howToFix });
	return v;
}

interface BodyGap {
	missing: string;
	code: BesoinBlockCode;
	expl: string;
	fix: string[];
}

// checkBody verifies the required fields (single source) + per-rung parse rules. null when valid.
function checkBody(level: Level, body: LevelBody): BodyGap | null {
	for (const f of requiredFieldsFor(level) ?? []) {
		if (isEmptyField(body[f])) {
			return {
				missing: `body:${f}`,
				code: "BESOIN_BODY_VACANT_OR_MALFORMED",
				expl: `Le champ requis ${f} est absent ou vide (corps vacant, EL02 RequiredFields).`,
				fix: [`declare_field:${f}`],
			};
		}
	}
	if (level === "product") {
		const th = defaultThresholds();
		const scn = body.scenarios;
		if (
			!Array.isArray(scn) ||
			scn.length === 0 ||
			scn.length > th.maxScenarios
		) {
			return {
				missing: "body:scenarios",
				code: "BESOIN_BODY_VACANT_OR_MALFORMED",
				expl: `Le product doit déclarer entre 1 et ${th.maxScenarios} scénarios (seuil déclaré EL06).`,
				fix: ["right_size_scenarios"],
			};
		}
	}
	if (level === "journey" && !isParsableGherkin(asString(body.gherkin))) {
		return {
			missing: "body:gherkin",
			code: "BESOIN_BODY_VACANT_OR_MALFORMED",
			expl: "Le Gherkin du journey n'est pas parsable (Given/When/Then requis).",
			fix: ["write_parsable_gherkin"],
		};
	}
	if (
		level === "control" &&
		(typeof body.visible_when !== "boolean" ||
			typeof body.enabled_when !== "boolean")
	) {
		return {
			missing: "body:conditions",
			code: "BESOIN_BODY_VACANT_OR_MALFORMED",
			expl: "visible_when et enabled_when doivent être typés booléens (EL02).",
			fix: ["type_conditions_bool"],
		};
	}
	return null;
}

function isEmptyField(v: unknown): boolean {
	if (v === null || v === undefined) return true;
	if (typeof v === "string") return v.trim() === "";
	if (Array.isArray(v)) return v.length === 0;
	if (typeof v === "object") return Object.keys(v).length === 0;
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

function appendUnique(xs: string[], s: string): string[] {
	if (!xs.includes(s)) xs.push(s);
	return xs;
}
