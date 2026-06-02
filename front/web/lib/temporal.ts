/**
 * The TemporalInvariant projection — the Workbench /temporal-invariants source (AIDOS step S50).
 *
 * KRD §49.3 (TemporalInvariant — "toute vérité temporelle doit déclarer son horloge"): a
 * TemporalInvariant is a first-class invariant KIND whose property is TIME-DEPENDENT and which
 * MUST declare its `clock` (clock ∈ system | external | logical) and its `tolerance` (a duration),
 * and whose mirror is a TEMPORAL form (mirror ∈ statechart | tla+ | uppaal). The canonical example
 * is "payment_captured implies order_confirmed within 5 minutes", clock: system, tolerance: 10s,
 * mirror: statechart.
 *
 * This module is the DECLARED projection of the Go package back/kernel/temporal — the same §49.3
 * shape, the same laws: Evaluate is HELD inside the tolerance band (elapsed ≤ bound + tolerance,
 * one-sided for a `within` deadline — ADR 0034) and on a correct event order; VIOLATED over
 * tolerance, out of order, or when the consequent never arrives. One source, no drift.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — NO Date.now(), no real
 * clock, no rng, no I/O. The elapsed datum is PASSED IN (the runtime samples it later). The
 * reproducibility mirror lib/temporal.test.ts (fast-check) pins the tolerance band, totality,
 * determinism, and the clock-required rule.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): /temporal-invariants renders the evaluator's verdict;
 * it never writes truth (the wall). Truth-writes — declaring a TemporalInvariant or changing its
 * tolerance — go via propose → ChangeSet → approval, never from the screen.
 */

/** The three FROZEN KRD §49.3 clocks — the horloge a temporal truth MUST declare. */
export const CLOCKS = ["system", "external", "logical"] as const;
export type Clock = (typeof CLOCKS)[number];

/** The three FROZEN KRD §49.3 temporal mirror forms. */
export const MIRROR_FORMS = ["statechart", "tla+", "uppaal"] as const;
export type MirrorForm = (typeof MIRROR_FORMS)[number];

/** The recognised time relations (this step lands the `within` deadline). */
export const RELATIONS = ["within"] as const;
export type Relation = (typeof RELATIONS)[number];

/** The KRD §49.3 TemporalInvariant AST. Bound + tolerance are durations in seconds. */
export interface TemporalInvariant {
	property: string;
	antecedent: string;
	consequent: string;
	relation: Relation;
	/** The deadline, in seconds (e.g. 300 for 5m). Non-negative. */
	boundSeconds: number;
	clock: Clock;
	/** The tolerance band, in seconds (e.g. 10). Non-negative. */
	toleranceSeconds: number;
	mirror: MirrorForm;
}

/** The §49.3 + §44.5 refusal code. */
export const CODE_TEMPORAL_INVARIANT_VIOLATED = "TEMPORAL_INVARIANT_VIOLATED";

/** The actionable refusal (KRD §44.5: code, severity, explanation, how_to_fix[]). */
export interface BlockReason {
	code: string;
	severity: string;
	explanation: string;
	howToFix: string[];
}

/** Evaluate's verdict — exactly one of two. */
export type Verdict = "held" | "violated";

export interface TemporalVerdict {
	verdict: Verdict;
	blockReason?: BlockReason;
}

/** The observation: the ordered events + the elapsed time (seconds) between antecedent + consequent. */
export interface Observation {
	eventOrder: string[];
	elapsedSeconds: number;
}

export function isKnownClock(c: string): c is Clock {
	return (CLOCKS as readonly string[]).includes(c);
}
export function isKnownMirrorForm(m: string): m is MirrorForm {
	return (MIRROR_FORMS as readonly string[]).includes(m);
}
export function isKnownRelation(r: string): r is Relation {
	return (RELATIONS as readonly string[]).includes(r);
}

/**
 * validate — the §49.3 shape guard (empty string ⇒ valid). The LOAD-BEARING rule: a temporal
 * truth with no declared clock is rejected ("toute vérité temporelle doit déclarer son horloge").
 */
export function validate(inv: TemporalInvariant): string {
	if (!inv.property) return "temporal: temporal invariant has no property";
	if (!inv.antecedent) return "temporal: temporal invariant has no antecedent";
	if (!inv.consequent) return "temporal: temporal invariant has no consequent";
	if (!isKnownRelation(inv.relation))
		return `temporal: unknown relation ${inv.relation} (this step lands within only)`;
	if (!Number.isFinite(inv.boundSeconds) || inv.boundSeconds < 0)
		return "temporal: bound must be a non-negative duration";
	if (!inv.clock)
		return "temporal: a temporal invariant MUST declare its clock (KRD §49.3)";
	if (!isKnownClock(inv.clock))
		return `temporal: unknown clock ${inv.clock} (system | external | logical)`;
	if (!Number.isFinite(inv.toleranceSeconds) || inv.toleranceSeconds < 0)
		return "temporal: tolerance must be a non-negative duration";
	if (!isKnownMirrorForm(inv.mirror))
		return `temporal: unknown mirror ${inv.mirror} (statechart | tla+ | uppaal)`;
	if (inv.clock === "logical" && inv.toleranceSeconds > 0)
		return "temporal: a logical clock cannot carry a wall-clock tolerance (OQ-S50-logical-tolerance)";
	return "";
}

/**
 * evaluate — the temporal property evaluator (KRD §49.3). For a `within` deadline:
 *   - the antecedent absent ⇒ held (the implication is vacuously true);
 *   - the consequent absent ⇒ violated (the deadline is never met);
 *   - the consequent BEFORE the antecedent ⇒ violated (§49.3 ordre des événements);
 *   - elapsed ≤ bound + tolerance ⇒ held (the band, one-sided — ADR 0034);
 *   - elapsed > bound + tolerance ⇒ violated / TEMPORAL_INVARIANT_VIOLATED.
 * Total, deterministic, never throws. Pure — no Date.now(), no real clock.
 */
export function evaluate(
	inv: TemporalInvariant,
	obs: Observation,
): TemporalVerdict {
	const err = validate(inv);
	if (err) return { verdict: "violated", blockReason: malformedReason(err) };

	const antIdx = obs.eventOrder.indexOf(inv.antecedent);
	const consIdx = obs.eventOrder.indexOf(inv.consequent);

	if (antIdx < 0) return { verdict: "held" };
	if (consIdx < 0)
		return { verdict: "violated", blockReason: violatedReason("missing") };
	if (consIdx < antIdx)
		return { verdict: "violated", blockReason: violatedReason("order") };
	if (obs.elapsedSeconds <= inv.boundSeconds + inv.toleranceSeconds)
		return { verdict: "held" };
	return { verdict: "violated", blockReason: violatedReason("over") };
}

type Cause = "over" | "order" | "missing";

function violatedReason(cause: Cause): BlockReason {
	let explanation =
		"La propriété temporelle est violée : la confirmation dépasse le délai déclaré, même élargi par la tolérance (KRD §49.3 — toute vérité temporelle doit déclarer son horloge).";
	if (cause === "order")
		explanation =
			"La propriété temporelle est violée : l'événement conséquent (order_confirmed) est observé AVANT l'antécédent (payment_captured). L'ordre des événements fait partie de la propriété (KRD §49.3) : une confirmation avant la capture brise l'implication.";
	if (cause === "missing")
		explanation =
			"La propriété temporelle est violée : l'antécédent (payment_captured) a eu lieu mais le conséquent (order_confirmed) n'est jamais survenu — le délai n'est jamais atteint (KRD §49.3).";
	return {
		code: CODE_TEMPORAL_INVARIANT_VIOLATED,
		severity: "blocking",
		explanation,
		howToFix: [
			"confirm_within_5m_or_compensate",
			"widen_tolerance_only_if_declared",
		],
	};
}

function malformedReason(err: string): BlockReason {
	return {
		code: CODE_TEMPORAL_INVARIANT_VIOLATED,
		severity: "blocking",
		explanation: `L'invariant temporel est mal formé et ne peut pas être évalué (KRD §49.3) : ${err}.`,
		howToFix: ["declare_clock_and_tolerance"],
	};
}

/** Render a seconds duration as a Go-style duration string (e.g. 300 → "5m", 10 → "10s"). */
export function durationString(seconds: number): string {
	if (seconds === 0) return "0s";
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	if (m > 0 && s > 0) return `${m}m${s}s`;
	if (m > 0) return `${m}m`;
	return `${s}s`;
}
