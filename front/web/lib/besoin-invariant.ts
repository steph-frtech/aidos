/**
 * lib/besoin-invariant.ts — the TYPESCRIPT TWIN of EL14 (back/runtime/besoin/invariant.go). The
 * transversal band `/besoin-invariant`: the interview of the invariants ∀ that CROSS every level
 * ("true on all paths") + the policies where authorization is in play. It is the LATERAL counterpart
 * of the EL13 vertical interview (besoin-interview.ts).
 *
 * FOUR PURE FUNCTIONS, the LLM excluded as authority (CLAUDE.md §6/§8 determinism-first), byte-
 * equivalent to the Go authority:
 *
 *   - parseInvariantBand(body): types the ∀ statement, REFUSES an ∃ (a single example —
 *     INVARIANT_IS_EXAMPLE_NOT_FORALL), validates attachments against the grammar.
 *   - crossedLevels(band): the LATERAL constraint set — an invariant attached at L constrains L AND
 *     every SOURCE rung ABOVE L (an invariant on `operation` is a constraint on
 *     action/control/view/journey/product too).
 *   - recordInvariant(...): the deterministic recorder — applies the CIRCULARITY BAN (the skill cannot
 *     author an invariant it would then satisfy, §8), routes a fuzzy band to /spike, and on success
 *     records the band + (for a policy band only) AT MOST ONE Idea{Proposes:policy} guidance.
 *   - bandCompleteness(nodes): flags a `resolved` SOURCE rung that requires a crossing invariant but is
 *     crossed by none (NEED_LEVEL_MISSING_INVARIANT).
 *
 * Writes NO truth — the wall (§2). The single emission is at most ONE Idea{Proposes:policy} guidance
 * (the legal idea_capture shape), never an Idea for the ∀ statement itself.
 */

import {
	attachableTo,
	type Level,
	parseLevel,
	SOURCE_ORDER,
} from "./besoin-grammar";
import {
	certifyMetadata,
	type Metadata,
	type NodeStatus,
} from "./besoin-metadata";
import type { Idea, Proposes, ProvenanceSource } from "./ideas";

export type InvariantKind = "path_independent" | "policy";

export const INVARIANT_KINDS: InvariantKind[] = ["path_independent", "policy"];

export function isInvariantKind(k: string): k is InvariantKind {
	return (INVARIANT_KINDS as string[]).includes(k);
}

/** An InvariantBand — one lateral band (mirrors besoin.InvariantBand). NO version, NO mirror. */
export interface InvariantBand {
	statement: string;
	attachedLevels: Level[];
	kind: InvariantKind;
	policy?: string;
}

// EL14-local refusal codes — byte-identical to the Go BesoinBlockCode constants.
export const CODE_INVARIANT_IS_EXAMPLE = "INVARIANT_IS_EXAMPLE_NOT_FORALL";
export const CODE_INVARIANT_NO_ATTACHMENT = "INVARIANT_NO_ATTACHMENT";
export const CODE_INVARIANT_BAD_ATTACHMENT = "INVARIANT_BAD_ATTACHMENT";
export const CODE_INVARIANT_CIRCULAR = "INVARIANT_CIRCULAR_SELF_AUTHORED";
export const CODE_INVARIANT_EMPTY = "INVARIANT_EMPTY_STATEMENT";
export const CODE_METADATA_INCOMPLETE = "BESOIN_METADATA_INCOMPLETE";

// The DECLARED universal markers (∀) — byte-identical bilingual set (forallMarkers in invariant.go).
const FORALL_MARKERS = [
	"∀",
	"for all",
	"for every",
	"for each",
	"for any",
	"always",
	"never",
	"no ",
	"every ",
	"all ",
	"each ",
	"any ",
	"pour tout",
	"pour toute",
	"pour chaque",
	"toujours",
	"jamais",
	"chaque ",
	"tout ",
	"toute ",
	"tous ",
	"toutes ",
	"aucun",
	"aucune",
];

// The DECLARED example markers (∃) — byte-identical (exampleMarkers in invariant.go).
const EXAMPLE_MARKERS = [
	"for example",
	"for instance",
	"e.g.",
	"such as",
	"once,",
	"one time",
	"this case",
	"par exemple",
	"par ex.",
	"une fois",
	"dans ce cas",
	"ce cas-ci",
	"exemple :",
];

/**
 * isForallStatement — a DECLARED lexical predicate (never an LLM judgment): a statement is forall-
 * shaped iff it carries a universal marker AND no example marker. Byte-equivalent to the Go authority.
 */
export function isForallStatement(statement: string): boolean {
	const s = statement.trim().toLowerCase();
	if (s === "") return false;
	let hasUniversal = false;
	for (const m of FORALL_MARKERS) {
		if (s.includes(m)) {
			hasUniversal = true;
			break;
		}
	}
	if (!hasUniversal) return false;
	for (const m of EXAMPLE_MARKERS) {
		if (s.includes(m)) return false;
	}
	return true;
}

/** isExampleStatement — a non-empty statement that is NOT a forall (an ∃). Pure. */
export function isExampleStatement(statement: string): boolean {
	return statement.trim() !== "" && !isForallStatement(statement);
}

export type ParseBandResult =
	| { ok: true; band: InvariantBand }
	| { ok: false; code: string; explanation: string };

function asString(v: unknown): string {
	return typeof v === "string" ? v : "";
}

function levelRank(l: Level): number {
	const i = SOURCE_ORDER.indexOf(l);
	if (i >= 0) return i;
	// Transversal bands rank after the SOURCE rungs (invariant then policy).
	if (l === "invariant") return SOURCE_ORDER.length;
	if (l === "policy") return SOURCE_ORDER.length + 1;
	return SOURCE_ORDER.length + 2;
}

/**
 * parseInvariantBand — the deterministic constructor. Types the ∀, refuses an ∃, validates the
 * attached levels against AttachableTo for the band kind. Byte-equivalent to the Go authority.
 */
export function parseInvariantBand(
	body: Record<string, unknown>,
): ParseBandResult {
	const b = body ?? {};
	const statement = asString(b.statement).trim();
	if (statement === "") {
		return {
			ok: false,
			code: CODE_INVARIANT_EMPTY,
			explanation: "le champ `statement` est vide",
		};
	}
	if (isExampleStatement(statement)) {
		return {
			ok: false,
			code: CODE_INVARIANT_IS_EXAMPLE,
			explanation: `${statement} est un exemple (∃), pas un invariant universel (∀ P→Q)`,
		};
	}

	let kind = asString(b.kind) as InvariantKind | "";
	if (kind === "") {
		kind =
			asString(b.rule) !== "" || asString(b.policy) !== ""
				? "policy"
				: "path_independent";
	}
	if (!isInvariantKind(kind)) {
		return {
			ok: false,
			code: "besoin: unknown level",
			explanation: `kind ${kind} hors des natures de bande`,
		};
	}

	const bandLevel: Level = kind === "policy" ? "policy" : "invariant";

	const attached = parseAttachedLevels(b.attached_levels, bandLevel);
	if (!attached.ok) return attached;

	const band: InvariantBand = {
		statement,
		attachedLevels: attached.levels,
		kind,
	};
	if (kind === "policy") {
		let rule = asString(b.rule).trim();
		if (rule === "") rule = asString(b.policy).trim();
		band.policy = rule;
	}
	return { ok: true, band };
}

function parseAttachedLevels(
	raw: unknown,
	bandLevel: Level,
):
	| { ok: true; levels: Level[] }
	| { ok: false; code: string; explanation: string } {
	const names: string[] = [];
	if (Array.isArray(raw)) {
		for (const x of raw) if (typeof x === "string") names.push(x);
	} else if (typeof raw === "string" && raw !== "") {
		names.push(raw);
	}
	if (names.length === 0) {
		return {
			ok: false,
			code: CODE_INVARIANT_NO_ATTACHMENT,
			explanation: "la bande n'attache aucun rung SOURCE",
		};
	}
	const seen = new Set<Level>();
	const out: Level[] = [];
	for (const n of names) {
		const pr = parseLevel(n);
		if (!pr.ok) {
			return {
				ok: false,
				code: CODE_INVARIANT_BAD_ATTACHMENT,
				explanation: `niveau attaché ${n} invalide`,
			};
		}
		const ok = attachableTo(bandLevel, pr.level);
		if (ok === null) {
			return {
				ok: false,
				code: CODE_INVARIANT_BAD_ATTACHMENT,
				explanation: `${bandLevel} n'est pas une bande transversale`,
			};
		}
		if (!ok) {
			return {
				ok: false,
				code: CODE_INVARIANT_BAD_ATTACHMENT,
				explanation: `la bande ${bandLevel} ne peut s'attacher au niveau ${pr.level}`,
			};
		}
		if (seen.has(pr.level)) continue;
		seen.add(pr.level);
		out.push(pr.level);
	}
	out.sort((a, b) => levelRank(a) - levelRank(b));
	return { ok: true, levels: out };
}

/**
 * crossedLevels — the LATERAL constraint set: an invariant attached at L constrains L AND every SOURCE
 * rung ABOVE L. Sorted in descent order, de-duplicated. Byte-equivalent to the Go authority.
 */
export function crossedLevels(band: InvariantBand): Level[] {
	const crossed = new Set<Level>();
	for (const attached of band.attachedLevels) {
		const idx = SOURCE_ORDER.indexOf(attached);
		if (idx < 0) continue;
		for (let i = 0; i <= idx; i++) crossed.add(SOURCE_ORDER[i]);
	}
	const out = [...crossed];
	out.sort((a, b) => levelRank(a) - levelRank(b));
	return out;
}

/** constrainsLevel — whether a band laterally constrains a SOURCE rung. Pure. */
export function constrainsLevel(band: InvariantBand, level: Level): boolean {
	return crossedLevels(band).includes(level);
}

export type AnswerRouting = "record" | "off_altitude" | "spike";

export const SPIKE_GATE: readonly string[] = [
	"idea_capture",
	"idea_grill",
	"idea_spike",
];

export interface InvariantResult {
	band?: InvariantBand;
	crossedLevels: Level[];
	routing: AnswerRouting;
	recorded: boolean;
	policyIdea: Idea | null;
	spikeRoute?: string[];
	blockReason?: {
		code: string;
		severity: string;
		explanation: string;
		howToFix: string[];
	};
}

/**
 * recordInvariant — the deterministic recorder of one band turn. Applies the circularity ban (§8),
 * parses (refusing an ∃), routes a fuzzy band to /spike, and on success records the band + (for a
 * policy band only) AT MOST ONE Idea{Proposes:policy} guidance. Byte-equivalent to the Go authority.
 * The graph mutation lives in the MCP (EL15); here we return the routing decision + the guidance.
 */
export function recordInvariant(
	body: Record<string, unknown>,
	utterance: string,
	selfAuthored: boolean,
	status: NodeStatus,
	meta: Metadata,
): InvariantResult {
	// 1. CIRCULARITY BAN (§8).
	if (selfAuthored) {
		return {
			crossedLevels: [],
			routing: "off_altitude",
			recorded: false,
			policyIdea: null,
			blockReason: {
				code: CODE_INVARIANT_CIRCULAR,
				severity: "blocking",
				explanation:
					"Ban de circularité (§8) : la skill ne peut PAS auteurer un invariant qu'elle satisferait ensuite. L'humain énonce l'invariant ; le code ne fait que l'enregistrer et le classer.",
				howToFix: ["let_the_human_state_the_invariant"],
			},
		};
	}

	// 2. PARSE — types the ∀, refuses an ∃ / bad attachment.
	const parsed = parseInvariantBand(body);
	if (!parsed.ok) {
		return {
			crossedLevels: [],
			routing: "off_altitude",
			recorded: false,
			policyIdea: null,
			blockReason: {
				code: parsed.code,
				severity: "blocking",
				explanation: parsed.explanation,
				howToFix: bandFixOf(parsed.code),
			},
		};
	}
	const band = parsed.band;
	const crossed = crossedLevels(band);

	// 3. FUZZY → /spike. An unverifiable band routes to /spike via the legal three-hop gate.
	if (certifyMetadata(status, meta).routeToSpike) {
		return {
			band,
			crossedLevels: crossed,
			routing: "spike",
			recorded: false,
			policyIdea: null,
			spikeRoute: [...SPIKE_GATE],
			blockReason: {
				code: CODE_METADATA_INCOMPLETE,
				severity: "blocking",
				explanation:
					"La bande est floue (verifiability unverifiable) : elle est routée vers /spike via idea_capture(draft) → idea_grill → idea_spike, JAMAIS enregistrée.",
				howToFix: ["route_to_spike", ...SPIKE_GATE],
			},
		};
	}

	// 4. RECORD. For a POLICY band ONLY: AT MOST ONE Idea{Proposes:policy} guidance.
	let policyIdea: Idea | null = null;
	if (band.kind === "policy") {
		policyIdea = buildPolicyIdea(band, utterance);
	}
	return {
		band,
		crossedLevels: crossed,
		routing: "record",
		recorded: true,
		policyIdea,
	};
}

/**
 * buildPolicyIdea — the SINGLE Idea{Proposes:policy} guidance (the legal idea_capture shape). The id is
 * the kernel content hash, computed by the Go authority / the MCP (EL15) — left empty here, the honest
 * boundary (the TS twin has no hasher; the content address is server-side). The intent is the verbatim
 * policy rule (never paraphrased). At most ONE per band.
 */
function buildPolicyIdea(band: InvariantBand, utterance: string): Idea {
	let intent = band.policy ?? "";
	if (intent.trim() === "") intent = band.statement;
	const source: ProvenanceSource = "human";
	const proposes: Proposes = "policy";
	return {
		id: "", // content-addressed by the Go authority / EL15 MCP (besoin-intake).
		proposes,
		intent,
		provenance: { source, detail: utterance },
		status: "draft",
	};
}

function bandFixOf(code: string): string[] {
	switch (code) {
		case CODE_INVARIANT_IS_EXAMPLE:
			return [
				"state_as_forall",
				"reformulez en ∀ P→Q (pour tout / toujours / jamais), jamais un exemple unique",
			];
		case CODE_INVARIANT_NO_ATTACHMENT:
			return [
				"attach_to_a_source_rung",
				"nommez au moins un rung SOURCE que l'invariant croise",
			];
		case CODE_INVARIANT_BAD_ATTACHMENT:
			return [
				"attach_to_an_attachable_rung",
				"policy → operation/entity ; invariant → tout rung SOURCE (AttachableTo, EL02)",
			];
		case CODE_INVARIANT_EMPTY:
			return ["state_the_invariant", "énoncez l'invariant ∀"];
		default:
			return ["fix_band_body"];
	}
}

// --- band completeness ------------------------------------------------------------------------------

export const CODE_LEVEL_MISSING_INVARIANT = "NEED_LEVEL_MISSING_INVARIANT";

export interface BandMonster {
	code: string;
	level: Level;
	explanation: string;
	howToFix: string[];
}

export interface BandCompletenessReport {
	complete: boolean;
	monsters: BandMonster[];
}

/** A resolved SOURCE-rung node with its declared body (for bandCompleteness). */
export interface BandNodeInput {
	level: Level;
	status: NodeStatus;
	body: Record<string, unknown>;
}

/**
 * bandCompleteness — flags every `resolved` SOURCE rung that DECLARES it requires a crossing
 * invariant/policy (`requires_invariant: true`) but is crossed by NO band. Byte-equivalent to the Go
 * authority. Pure, total.
 */
export function bandCompleteness(
	nodes: BandNodeInput[],
): BandCompletenessReport {
	const bands: InvariantBand[] = [];
	for (const n of nodes) {
		if (n.level !== "invariant" && n.level !== "policy") continue;
		const p = parseInvariantBand(n.body);
		if (p.ok) bands.push(p.band);
	}
	const monsters: BandMonster[] = [];
	for (const l of SOURCE_ORDER) {
		const node = nodes.find((n) => n.level === l && n.status === "resolved");
		if (!node) continue;
		if (node.body.requires_invariant !== true) continue;
		const crossed = bands.some((b) => constrainsLevel(b, l));
		if (!crossed) {
			monsters.push({
				code: CODE_LEVEL_MISSING_INVARIANT,
				level: l,
				explanation: `Le niveau ${l} est résolu et déclare requérir un invariant/policy croisé, mais aucune bande ne le croise.`,
				howToFix: [
					"record_a_crossing_invariant",
					`énoncez un ∀ attaché à ${l} (ou à un rung qu'il croise)`,
				],
			});
		}
	}
	monsters.sort((a, b) => levelRank(a.level) - levelRank(b.level));
	return { complete: monsters.length === 0, monsters };
}
