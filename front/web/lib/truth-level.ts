/**
 * The truth-level twin — the Workbench /truth-level source (AIDOS FK01).
 *
 * The DECLARED projection of the Go package back/kernel/truthlevel: the seven KRD truth
 * levels (FKE-5, Raw→Reconciled) and the deterministic transition that is the SOLE legal
 * writer of a record's truth_level.
 *
 *   1 raw          — what was said, pasted, observed or generated experimentally
 *   2 interpreted  — what the left brain thinks it understood (an idea exists)
 *   3 proposed     — what is proposed above the wall (a DRAFT changeset proposes it)
 *   4 accepted     — what a user or Governor validated (the changeset is APPLIED)
 *   5 projected    — what is generated (code, config, prompt, test, doc, MCP, infra)
 *   6 observed     — what tests, logs, metrics, evals, scans and runtime show
 *   7 reconciled   — what the consciousness concludes after comparison
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): compute is a PURE, TOTAL function of its Signals —
 * no clock, no rng, no I/O, no LLM. Same signals → same level. The Go Compute is the
 * AUTHORITATIVE truth; this twin reproduces it for the screen. checkParity is the parity
 * mirror (stored vs computed, divergence = RED). The reproducibility mirror
 * lib/truth-level.test.ts (fast-check) pins determinism, the ladder, and parity.
 *
 * READ-ONLY (the wall): /truth-level COMPUTES and DISPLAYS; it never writes truth. The
 * level is set on a record by the privileged transition at the legal door, never here.
 */

export type LevelName =
	| "unknown"
	| "raw"
	| "interpreted"
	| "proposed"
	| "accepted"
	| "projected"
	| "observed"
	| "reconciled";

/** The seven FKE-5 provenance doors, one boolean each (the transition's input). */
export interface Signals {
	hasRawSignal: boolean;
	hasIdea: boolean;
	hasProposal: boolean;
	isAccepted: boolean;
	hasProjection: boolean;
	hasObservation: boolean;
	isReconciled: boolean;
}

/** A truth level: its rung (1..7, 0=unknown) and canonical name. */
export interface Level {
	rung: number;
	name: LevelName;
}

/** The seven canonical FKE-5 rungs in Raw→Reconciled order (the panel filter set). */
export const LEVELS: readonly Level[] = [
	{ rung: 1, name: "raw" },
	{ rung: 2, name: "interpreted" },
	{ rung: 3, name: "proposed" },
	{ rung: 4, name: "accepted" },
	{ rung: 5, name: "projected" },
	{ rung: 6, name: "observed" },
	{ rung: 7, name: "reconciled" },
] as const;

const UNKNOWN: Level = { rung: 0, name: "unknown" };

/**
 * compute is the deterministic, pure, TOTAL transition (FKE-5): the highest truth level
 * whose door is satisfied. Total over every Signals value — the all-false case maps to
 * `unknown`. The SOLE legal writer of a truth_level (never hand-posed). Read top-down so a
 * partially/over-filled Signals still resolves to a single rung.
 */
export function compute(s: Signals): Level {
	if (s.isReconciled) return { rung: 7, name: "reconciled" };
	if (s.hasObservation) return { rung: 6, name: "observed" };
	if (s.hasProjection) return { rung: 5, name: "projected" };
	if (s.isAccepted) return { rung: 4, name: "accepted" };
	if (s.hasProposal) return { rung: 3, name: "proposed" };
	if (s.hasIdea) return { rung: 2, name: "interpreted" };
	if (s.hasRawSignal) return { rung: 1, name: "raw" };
	return UNKNOWN;
}

/** The verdict of the parity mirror for one record. */
export interface ParityResult {
	stored: Level;
	computed: Level;
	aligned: boolean;
}

/**
 * checkParity is the parity mirror (FKE-5: stored_level == computed_level). ALIGNED (a
 * green pair) iff the stored rung equals compute(signals); any divergence is RED. PURE.
 * The stored level is a CACHE PROVEN BY THE COMPUTATION.
 */
export function checkParity(storedRung: number, s: Signals): ParityResult {
	const computed = compute(s);
	const stored =
		LEVELS.find((l) => l.rung === storedRung) ??
		(storedRung === 0
			? UNKNOWN
			: { rung: storedRung, name: "unknown" as LevelName });
	return { stored, computed, aligned: stored.rung === computed.rung };
}

/** A demo record carrying its provenance signals — what the panel filters by level. */
export interface DemoRecord {
	id: string;
	labelFr: string;
	labelEn: string;
	signals: Signals;
}

const allFalse: Signals = {
	hasRawSignal: false,
	hasIdea: false,
	hasProposal: false,
	isAccepted: false,
	hasProjection: false,
	hasObservation: false,
	isReconciled: false,
};

/** A small honest catalogue of records, one per rung, for the panel to filter by level. */
export const DEMO_RECORDS: readonly DemoRecord[] = [
	{
		id: "rec-raw",
		labelFr: "Note de chat « ajouter un panier »",
		labelEn: "Chat note “add a cart”",
		signals: { ...allFalse, hasRawSignal: true },
	},
	{
		id: "rec-interpreted",
		labelFr: "Idée capturée : panier de checkout",
		labelEn: "Captured idea: checkout cart",
		signals: { ...allFalse, hasRawSignal: true, hasIdea: true },
	},
	{
		id: "rec-proposed",
		labelFr: "ChangeSet DRAFT proposé au-dessus du mur",
		labelEn: "DRAFT changeset proposed above the wall",
		signals: {
			...allFalse,
			hasRawSignal: true,
			hasIdea: true,
			hasProposal: true,
		},
	},
	{
		id: "rec-accepted",
		labelFr: "Vérité validée (ChangeSet APPLIQUÉ)",
		labelEn: "Validated truth (changeset APPLIED)",
		signals: {
			...allFalse,
			hasRawSignal: true,
			hasIdea: true,
			hasProposal: true,
			isAccepted: true,
		},
	},
	{
		id: "rec-projected",
		labelFr: "Code émis (handlers + DDL + types)",
		labelEn: "Emitted code (handlers + DDL + types)",
		signals: {
			...allFalse,
			hasRawSignal: true,
			hasIdea: true,
			hasProposal: true,
			isAccepted: true,
			hasProjection: true,
		},
	},
	{
		id: "rec-observed",
		labelFr: "Tests verts + métriques runtime",
		labelEn: "Green tests + runtime metrics",
		signals: {
			...allFalse,
			hasRawSignal: true,
			hasIdea: true,
			hasProposal: true,
			isAccepted: true,
			hasProjection: true,
			hasObservation: true,
		},
	},
	{
		id: "rec-reconciled",
		labelFr: "Conscience : aligned après comparaison",
		labelEn: "Consciousness: aligned after comparison",
		signals: {
			...allFalse,
			hasRawSignal: true,
			hasIdea: true,
			hasProposal: true,
			isAccepted: true,
			hasProjection: true,
			hasObservation: true,
			isReconciled: true,
		},
	},
] as const;
