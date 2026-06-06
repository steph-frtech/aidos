// besoin-gate.ts — the EL11 Stop:besoin-gate decision, the TS twin of
// back/hooks/stop/besoin-gate/gate.go. It COMPOSES the existing twins (it does NOT re-implement
// the rules): canDescend (EL07, besoin-candescend.ts) + besoinCompleteness (EL09,
// besoin-completeness.ts). The verdict is COMPUTED, never declared (anti-Goodhart §8).
//
// THE OU, NOT THE ET (EL11). The gate BLOCKS the descent iff, for the CURRENT level, EITHER:
//   - ¬canDescend(...).enough          (EL07: the rung is not right-sized), OR
//   - a monster AT the current level   (EL09: missing/wrong-form mirror, orphan, vanished meta).
// The two disjuncts are INDEPENDENT — each blocks on its own. A NoOp when there is no session
// (the hook does not over-fire — §5). DETERMINISTIC: pure function of the input.

import { canDescend, type NodeInput, type Verdict } from "./besoin-candescend";
import {
	type BesoinLevelMirror,
	besoinCompleteness,
	type CompletenessNode,
	type Monster,
} from "./besoin-completeness";
import type { Level } from "./besoin-grammar";

export type GateVerdict = "no_op" | "allow" | "block";

// GateBlockReason is the actionable refusal shape (KRD §44.5). The umbrella reason carries the
// declared EL11 how_to_fix path.
export interface GateBlockReason {
	code: string;
	severity: "blocking";
	explanation: string;
	howToFix: string[];
}

// GateSession is the open-BesoinGraph payload the gate gates. Its PRESENCE (a non-null session)
// is what scopes the hook; a null session → no_op. nodes are the completeness-law graph nodes;
// metaCompleteByLevel maps each resolved node's level → whether its four EL04 metadata are still
// present/certifiable (the screen supplies it — the twin does not re-implement the classifier).
export interface GateSession {
	project: string;
	level: Level;
	// node is the CURRENT rung the session is descending FROM (fed to canDescend, EL07).
	node: NodeInput;
	// metaComplete is the current node's EL04 metadata verdict (gate (b) of EL07).
	metaComplete: boolean;
	// nodes are the completeness-law view of the graph (level + status), for the EL09 sweep.
	nodes: CompletenessNode[];
	// mirrors is the declared need-side level-mirror set (EL09).
	mirrors: BesoinLevelMirror[];
	// metaCompleteByLevel maps a resolved level → its metadata-complete flag (EL09 sweep). When a
	// level is absent, the current level falls back to `metaComplete`.
	metaCompleteByLevel: Record<string, boolean>;
}

export interface GateDecision {
	verdict: GateVerdict;
	notEnough: boolean;
	hasMonster: boolean;
	blockReasons: GateBlockReason[];
}

// EL11_HOW_TO_FIX is the declared EL11 umbrella resolution path, verbatim from the ROADMAP.
export const EL11_HOW_TO_FIX: string[] = [
	"declare_missing_metadata",
	"resolve_ref",
	"state_invariant_as_forall",
	"assign_authority",
	"narrow_option_space",
];

// decide computes the EL11 gate decision. PURE, TOTAL, DETERMINISTIC — same input → same output.
export function decide(session: GateSession | null): GateDecision {
	if (session === null) {
		return {
			verdict: "no_op",
			notEnough: false,
			hasMonster: false,
			blockReasons: [],
		};
	}

	const d: GateDecision = {
		verdict: "allow",
		notEnough: false,
		hasMonster: false,
		blockReasons: [],
	};

	// Disjunct 1 — EL07: is the current rung right-sized? ¬enough blocks (even without a monster).
	const verdict: Verdict = canDescend(
		session.node,
		session.level,
		session.metaComplete,
	);
	if (!verdict.enough) {
		d.notEnough = true;
		for (const r of verdict.blockReasons) {
			d.blockReasons.push({
				code: r.code,
				severity: "blocking",
				explanation: r.explanation,
				howToFix: r.howToFix,
			});
		}
	}

	// Disjunct 2 — EL09: a monster AT the current level blocks even when the rung is enough (the OU).
	const metaMap = metaByLevel(session);
	const report = besoinCompleteness(session.nodes, session.mirrors, metaMap);
	for (const m of report.monsters as Monster[]) {
		if (m.level !== session.level) continue;
		d.hasMonster = true;
		d.blockReasons.push({
			code: m.code,
			severity: "blocking",
			explanation: m.explanation,
			howToFix: m.howToFix,
		});
	}

	if (d.notEnough || d.hasMonster) {
		d.verdict = "block";
		d.blockReasons.push({
			code: "BESOIN_GATE_BLOCKED",
			severity: "blocking",
			explanation: gateExplanation(d),
			howToFix: EL11_HOW_TO_FIX,
		});
	}
	return d;
}

function metaByLevel(s: GateSession): Record<string, boolean> {
	const out: Record<string, boolean> = { ...s.metaCompleteByLevel };
	if (!(s.level in out)) out[s.level] = s.metaComplete;
	return out;
}

function gateExplanation(d: GateDecision): string {
	if (d.notEnough && d.hasMonster) {
		return "Stop:besoin-gate — descente refusée : le niveau courant n'est PAS right-sized (EL07) ET porte un monstre de complétude-du-besoin (EL09). Les deux disjoncts du OU ont tiré.";
	}
	if (d.notEnough) {
		return "Stop:besoin-gate — descente refusée : le niveau courant n'est PAS right-sized (¬canDescend.enough, EL07). Le OU bloque sur ce seul disjonct, même sans monstre.";
	}
	return "Stop:besoin-gate — descente refusée : le niveau courant porte un monstre de complétude-du-besoin (EL09). Le OU bloque sur ce seul disjonct, même si le rung est par ailleurs enough.";
}
