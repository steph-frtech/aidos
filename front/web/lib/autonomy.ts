/**
 * autonomy — FK10 (ROADMAP-fke, FKE-11/34): the TS twin of the Go pure autonomy functions
 * (back/kernel/autonomy). The AUTONOMY axis of the governed agent layer is a CLOSED, DECLARED
 * level autonomy_level ∈ {A0..A8} (the 6th axis of the CoucheAgent), a FAIL-CLOSED enforcement
 * (an action whose required level exceeds the declared level is refused with an actionable
 * BlockReason), and a PROMOTION that is a PURE FUNCTION of the AgentRun history (N green E4+
 * runs without incident) — never a level the agent declares for itself.
 *
 * THE LADDER (FKE-11/34): A0 propose-only … A6 merge/integration … A7 release/deploy … A8 fully
 * autonomous. The set is CLOSED; a value outside [0,8] is fail-closed.
 *
 * A8-NEVER-ON-CRITICAL (FKE-11/34): a critical action (merge/deploy/irreversible truth write)
 * NEVER admits A8 — the enforcer caps the admissible level at A7 (human escalation).
 *
 * FAIL-CLOSED ENFORCEMENT (the wall §2/§8): enforce compares required ≤ declared; required >
 * declared REFUSES with AGENT_AUTONOMY_EXCEEDED. The autonomy is never self-widened below the
 * line — the only door to a higher level is the promotion computed from history, frozen above
 * the line via idea → mirror → /goal.
 *
 * PROMOTION = PURE FUNCTION OF HISTORY (FKE-34): promotionFromHistory returns current+1 IFF the
 * last N runs are ALL green at evidence ≥ E4 with NO incident (never past A8). The level is
 * COMPUTED from the record, never declared (§8 anti-Goodhart).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): enforce + promotionFromHistory are PURE + TOTAL — same
 * input ⇒ same verdict / same level. The Go side is AUTHORITATIVE; this twin mirrors it for the
 * Workbench and carries its own reproducibility property (autonomy.test.ts). THE WALL (§2): it
 * reads a declared level + a run history and returns a verdict / a proposed level; it writes
 * nothing.
 */

/** A rung of the closed autonomy ladder A0..A8 (an int so the ladder is directly ordered). */
export type Level = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** The nine closed rungs in canonical A0→A8 order (never invent a rung). */
export const LEVELS: Level[] = [0, 1, 2, 3, 4, 5, 6, 7, 8];

/** The highest level a CRITICAL action may ever require/admit (FKE-11/34: "A8 jamais sur action critique"). */
export const CRITICAL_CEILING: Level = 7;

/** The S13 BlockReason code an autonomy refusal carries. */
export const CODE_AUTONOMY_EXCEEDED = "AGENT_AUTONOMY_EXCEEDED" as const;

/** Is `l` a member of the closed ladder A0..A8? Any other value is fail-closed. */
export function isKnownLevel(l: number): l is Level {
	return Number.isInteger(l) && l >= 0 && l <= 8;
}

/** Render a level as its canonical "A<n>" label; an out-of-range level renders "A?". */
export function levelLabel(l: number): string {
	return isKnownLevel(l) ? `A${l}` : "A?";
}

/** The autonomy demand of one attempted action: the level it requires and whether it is critical. */
export interface Action {
	name: string;
	required: Level;
	critical: boolean;
}

/** The actionable refusal shape (mirror of the Go blockreason.BlockReason). */
export interface BlockReason {
	code: typeof CODE_AUTONOMY_EXCEEDED;
	severity: "blocking";
	explanation: string;
	howToFix: string[];
}

/** enforce's verdict: allowed, or refused with the S13 BlockReason. */
export interface Decision {
	allowed: boolean;
	blockReason?: BlockReason;
}

const REFUSAL: BlockReason = {
	code: CODE_AUTONOMY_EXCEEDED,
	severity: "blocking",
	explanation:
		"L'action exige un niveau d'autonomie strictement supérieur à celui que le CoucheAgent a déclaré (fail-closed). " +
		"autonomy_level ∈ {A0..A8} ; A8 n'est jamais permis sur une action critique. La seule porte vers un niveau " +
		"supérieur est la montée calculée depuis l'historique AgentRun, gelée via idée → miroir → /goal.",
	howToFix: [
		"stay_within_declared_level : ramenez l'action sous le niveau déclaré (une action critique reste toujours sous-A8).",
		"earn_promotion_from_history : accumulez N runs verts E4+ sans incident — la montée est calculée, jamais déclarée.",
		"freeze_the_higher_level_via_goal : le nouveau niveau n'est figé qu'au-dessus de la ligne via idée → miroir → /goal.",
	],
};

function refuse(): Decision {
	return { allowed: false, blockReason: REFUSAL };
}

/**
 * enforce — the PURE, FAIL-CLOSED autonomy gate (FKE-11/34). Admits an action IFF the declared
 * level and the required level are valid rungs, the critical-action ceiling A7 holds (A8 never
 * governs a critical action), and required ≤ declared (read as a ceiling). Every refusal carries
 * AGENT_AUTONOMY_EXCEEDED. Pure, total, deterministic.
 */
export function enforce(declared: number, action: Action): Decision {
	if (!isKnownLevel(declared) || !isKnownLevel(action.required)) {
		return refuse();
	}
	if (action.critical && action.required > CRITICAL_CEILING) {
		return refuse();
	}
	let effective = declared;
	if (action.critical && effective > CRITICAL_CEILING) {
		effective = CRITICAL_CEILING;
	}
	if (action.required > effective) {
		return refuse();
	}
	return { allowed: true };
}

/** The autonomy-relevant projection of one AgentRun: green, evidence (0..7 = E0..E7), incident. */
export interface RunOutcome {
	green: boolean;
	evidence: number;
	incident: boolean;
}

/** The promotion bar — declared above the line, never learned (§8). */
export interface PromotionPolicy {
	minGreenRuns: number;
	minEvidence: number;
}

/** The FKE-34 bar: 3 consecutive green runs at evidence ≥ E4 with no incident. */
export const DEFAULT_POLICY: PromotionPolicy = {
	minGreenRuns: 3,
	minEvidence: 4,
};

/**
 * promotionFromHistory — the PURE promotion function (FKE-34: "la promotion est une fonction pure
 * de l'historique ; jamais déclarée"). Returns current+1 IFF the LAST N runs are ALL green at
 * evidence ≥ minEvidence with NO incident (never past A8); else current unchanged. The level is
 * COMPUTED from the record — an agent cannot promote itself by asserting confidence (§8). Pure,
 * total, deterministic. It returns a PROPOSED level; freezing it stays /goal's job (the wall §2).
 */
export function promotionFromHistory(
	current: number,
	history: RunOutcome[],
	policy: PromotionPolicy = DEFAULT_POLICY,
): Level {
	if (!isKnownLevel(current) || current >= 8) {
		return isKnownLevel(current) ? current : 0;
	}
	const n = policy.minGreenRuns < 1 ? 1 : policy.minGreenRuns;
	if (history.length < n) {
		return current;
	}
	const window = history.slice(history.length - n);
	for (const o of window) {
		if (!o.green || o.evidence < policy.minEvidence || o.incident) {
			return current;
		}
	}
	return (current + 1) as Level;
}
