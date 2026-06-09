/**
 * conscience — FK09 (ROADMAP-fke, FKE-6.3): the TS twin of the Go pure aggregator `Reconcile`
 * (back/runtime/conscience). The CONSCIENCE composes the verdicts of the EXISTING judges (the
 * mirror runner, the completeness/monster law, the FK08 facet skeleton, SemanticDiff, the
 * RealityMirror, the sensors, the ledger) into ONE ConsciousnessReport per kernel + the §FKE-31
 * decision cards. The load-bearing rule (FKE-6.3, grill 2026-06-07): the conscience is an
 * AGGREGATOR, NOT A NEW JUDGE — an active evaluator-organ would be "the second agent that
 * validates", which the Tome refuses as proof (§8). So reconcile NEVER re-judges: it READS
 * sourced verdicts and ROUTES them; every report line carries its source judge.
 *
 * THE PAIR IS THE UNIT (FKE-6.3, §3747). Each input verdict becomes a PairVerdict carrying a
 * sourced verdict (green/red/advisory). The overall verdict is "drift" iff any HARD pair is red;
 * the SOFT facet X NEVER flips it (§13.6 — X informs, never clicks the ratchet hard).
 *
 * THE DECISION CARD (FKE-31). Every divergence (red OR advisory pair) produces ONE DecisionCard:
 * the gap, its source judge, the drift class, the blast radius, the §FKE-30 routing options + a
 * recommendation. The card is content-addressed (same gap → same ID) so it is idempotent. A SOFT
 * (X) divergence yields an ADVISORY card (informs, never blocks). An aligned kernel emits no card.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8). reconcile is PURE + TOTAL: same input ⇒ same report + same
 * cards, invariant under input ordering. The Go side is AUTHORITATIVE; this twin mirrors it for
 * the Workbench and carries its own reproducibility property (conscience.test.ts). THE WALL (§2):
 * it reads sourced verdicts and writes nothing — the report is a projection, never a truth.
 */

import { type Facet, isSoft, type SkeletonReport } from "./facetwire";

export type Source =
	| "runner"
	| "completeness"
	| "facet"
	| "semantic_diff"
	| "reality_mirror"
	| "sensor"
	| "ledger";

/** The closed set of judges the conscience composes (anti-fabrication: an unknown source is dropped). */
export const KNOWN_SOURCES: Source[] = [
	"runner",
	"completeness",
	"facet",
	"semantic_diff",
	"reality_mirror",
	"sensor",
	"ledger",
];

const SOURCE_RANK: Record<Source, number> = {
	runner: 0,
	completeness: 1,
	facet: 2,
	semantic_diff: 3,
	reality_mirror: 4,
	sensor: 5,
	ledger: 6,
};

export type Verdict = "green" | "red" | "advisory";

export type DriftKind =
	| "semantic_drift"
	| "contract_drift"
	| "security_drift"
	| "performance_drift"
	| "documentation_drift"
	| "test_gap"
	| "evidence_gap"
	| "reliability_drift"
	| "evolvability_drift"
	| "maintainability_drift"
	| "experience_advisory"
	| "incompleteness";

export type BlastRadius = "low" | "medium" | "high" | "critical";

export type CardOption =
	| "fix_below_wall"
	| "change_above_wall"
	| "ask_user_decision"
	| "block"
	| "keep_experimental"
	| "deprecate";

export interface SourcedVerdict {
	source: Source;
	facet: Facet;
	pair: string;
	verdict: Verdict;
	drift?: DriftKind;
	detail?: string;
	blast?: BlastRadius;
}

export interface Input {
	kernel_id: string;
	skeleton?: SkeletonReport;
	verdicts?: SourcedVerdict[];
}

export interface PairVerdict {
	source: Source;
	facet: Facet;
	pair: string;
	verdict: Verdict;
	drift?: DriftKind;
	detail?: string;
	blast?: BlastRadius;
	soft: boolean;
}

export interface DecisionCard {
	id: string;
	kernel_id: string;
	source: Source;
	facet: Facet;
	pair: string;
	drift?: DriftKind;
	detail?: string;
	blast: BlastRadius;
	options: CardOption[];
	recommendation: CardOption;
	advisory: boolean;
}

export interface ConsciousnessReport {
	kernel_id: string;
	pairs: PairVerdict[];
	cards: DecisionCard[];
	verdict: "aligned" | "drift";
	green: number;
	red: number;
	advisory: number;
}

/** facetDrift maps a non-functional facet to its §FKE-30 drift class (a declared table). */
function facetDrift(f: Facet): DriftKind {
	switch (f) {
		case "S":
			return "security_drift";
		case "R":
			return "reliability_drift";
		case "V":
			return "evolvability_drift";
		case "M":
			return "maintainability_drift";
		case "X":
			return "experience_advisory";
		default:
			return "semantic_drift";
	}
}

/** routeOptions is the §FKE-30 → §FKE-31 routing table: a pure mapping of a divergence to options. */
function routeOptions(p: PairVerdict): {
	options: CardOption[];
	recommendation: CardOption;
} {
	if (p.verdict === "advisory") {
		return {
			options: ["keep_experimental", "change_above_wall", "ask_user_decision"],
			recommendation: "keep_experimental",
		};
	}
	switch (p.drift) {
		case "security_drift":
			return {
				options: ["block", "fix_below_wall", "ask_user_decision"],
				recommendation: "block",
			};
		case "contract_drift":
		case "semantic_drift":
			return {
				options: ["fix_below_wall", "change_above_wall", "ask_user_decision"],
				recommendation: "ask_user_decision",
			};
		case "evidence_gap":
		case "test_gap":
		case "incompleteness":
			return {
				options: ["fix_below_wall", "ask_user_decision", "deprecate"],
				recommendation: "fix_below_wall",
			};
		default:
			return {
				options: ["fix_below_wall", "change_above_wall", "ask_user_decision"],
				recommendation: "ask_user_decision",
			};
	}
}

/** A stable, deterministic string hash (FNV-1a 32-bit) for the content-addressed card ID. */
function hashStr(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

function cardFor(kernelId: string, p: PairVerdict): DecisionCard {
	const blast = p.blast ?? "low";
	const { options, recommendation } = routeOptions(p);
	const gap = JSON.stringify([
		kernelId,
		p.source,
		p.facet,
		p.pair,
		p.drift ?? "",
		p.detail ?? "",
	]);
	return {
		id: `DC-${hashStr(gap)}`,
		kernel_id: kernelId,
		source: p.source,
		facet: p.facet,
		pair: p.pair,
		drift: p.drift,
		detail: p.detail,
		blast,
		options,
		recommendation,
		advisory: p.verdict === "advisory",
	};
}

function sortPairs(ps: PairVerdict[]): PairVerdict[] {
	return [...ps].sort((a, b) => {
		if (a.source !== b.source)
			return SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
		if (a.facet !== b.facet) return a.facet < b.facet ? -1 : 1;
		if (a.pair !== b.pair) return a.pair < b.pair ? -1 : 1;
		return a.verdict < b.verdict ? -1 : a.verdict > b.verdict ? 1 : 0;
	});
}

/**
 * reconcile is the FK09 conscience: a PURE, TOTAL aggregator composing the sourced verdicts (the
 * FK08 facet skeleton + the extra SourcedVerdicts) into a ConsciousnessReport + its §FKE-31
 * decision cards. It ADDS NO JUDGMENT — it copies every verdict verbatim, sorts canonically, emits
 * one card per divergence, and computes the overall verdict (drift iff any HARD pair is red; the
 * SOFT facet X never flips it — §13.6). An unknown source is dropped (only sourced verdicts).
 */
export function reconcile(input: Input): ConsciousnessReport {
	const pairs: PairVerdict[] = [];

	// (1) Compose the FK08 facet skeleton directly.
	if (input.skeleton) {
		for (const col of input.skeleton.columns) {
			const soft = col.soft;
			const divs = soft ? col.advisories : col.divergences;
			if (divs.length === 0) {
				pairs.push({
					source: "facet",
					facet: col.facet,
					pair: "skeleton",
					verdict: "green",
					soft,
				});
				continue;
			}
			for (const d of divs) {
				pairs.push({
					source: "facet",
					facet: col.facet,
					pair: d.rung,
					verdict: soft ? "advisory" : "red",
					drift: facetDrift(col.facet),
					detail: d.kind,
					soft,
				});
			}
		}
	}

	// (2) Compose the extra sourced verdicts (verbatim; unknown source dropped).
	const known = new Set<string>(KNOWN_SOURCES);
	for (const sv of input.verdicts ?? []) {
		if (!known.has(sv.source)) continue;
		const soft = isSoft(sv.facet);
		let v = sv.verdict;
		// A red on the SOFT facet X is downgraded to advisory (§13.6).
		if (soft && v === "red") v = "advisory";
		pairs.push({
			source: sv.source,
			facet: sv.facet,
			pair: sv.pair,
			verdict: v,
			drift: sv.drift,
			detail: sv.detail,
			blast: sv.blast ?? "low",
			soft,
		});
	}

	const sortedPairs = sortPairs(pairs);

	// (3) Tally + cards.
	const cards: DecisionCard[] = [];
	let green = 0;
	let red = 0;
	let advisory = 0;
	let hardRed = false;
	for (const p of sortedPairs) {
		if (p.verdict === "green") {
			green++;
		} else if (p.verdict === "red") {
			red++;
			hardRed = true;
			cards.push(cardFor(input.kernel_id, p));
		} else {
			advisory++;
			cards.push(cardFor(input.kernel_id, p));
		}
	}
	cards.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

	return {
		kernel_id: input.kernel_id,
		pairs: sortedPairs,
		cards,
		verdict: hardRed ? "drift" : "aligned",
		green,
		red,
		advisory,
	};
}
