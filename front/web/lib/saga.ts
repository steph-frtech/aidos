/**
 * The SagaInvariant projection — the Workbench /sagas source (AIDOS step S49).
 *
 * KRD §49.2 (SagaInvariant + CoherenceTest — "un changement dans une cellule ne bloque ni ne
 * corrompt la fédération"): a SagaInvariant is a CROSS-CELL distributed-transaction invariant
 * binding named `participants` (order, payment, shipping) to a `property` that must hold across
 * the fédération, each participant carrying its `compensation` step (an S10 operation pinned
 * id@version, never free code). Per §49.1 a saga is transverse by definition — its scope is one
 * of {contract_pair, federation_policy}, NEVER local_cell. The mirror cert_language ∈
 * {statechart, pact, tla+}.
 *
 * This module is the DECLARED projection of the Go package back/kernel/sagas — the same §49.2
 * shape, the same laws: (1) Evaluate is satisfied on the happy path AND when a failed leg's
 * compensation ran (the property holds VIA compensation), violated only for the dangling-money
 * monster (payment_captured with neither order_confirmed nor compensation_executed); (2)
 * CheckCoherence is incompatible when a consumed contract pins a non-head producer version. One
 * source, no drift.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock, no rng, no
 * I/O — same input ⇒ same output. The reproducibility mirror lib/saga.test.ts (fast-check) pins
 * the core safety property, totality, determinism, and the coherence check.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): /sagas renders the evaluator's verdict; it never
 * writes truth (the wall). Truth-writes — declaring or re-scoping a SagaInvariant — go via
 * propose → ChangeSet → approval (SemanticDiff change_type `rescope`/`refine`/`reweight`, KRD
 * §44.1), never from the screen.
 */

/** The two FROZEN saga scopes — a saga is transverse by definition (local_cell is excluded). */
export const SCOPES = ["contract_pair", "federation_policy"] as const;
export type Scope = (typeof SCOPES)[number];

/** The three FROZEN KRD §49.2 mirror cert languages. */
export const CERT_LANGUAGES = ["statechart", "pact", "tla+"] as const;
export type CertLanguage = (typeof CERT_LANGUAGES)[number];

/** A pinned id@version ref (S17 links.Ref shape) — a compensation leg or a consumed contract. */
export interface Ref {
	id: string;
	version: string;
}

/** Render a ref as the canonical "id@version" form. */
export function refString(r: Ref): string {
	return `${r.id}@${r.version}`;
}

/** Whether a ref is well-formed (both id and version non-empty). */
export function isPinned(r: Ref): boolean {
	return r.id !== "" && r.version !== "";
}

/** One cell in the saga: its commit events and its compensation legs (pinned id@version). */
export interface SagaParticipant {
	cell: string;
	commits: string[];
	compensation: Ref[];
}

/** The KRD §49.2 SagaInvariant AST. */
export interface SagaInvariant {
	name: string;
	scope: Scope;
	participants: SagaParticipant[];
	property: string;
	certLanguage: CertLanguage;
}

/** The sibling KRD §49.2 CoherenceTest. */
export interface CoherenceTest {
	contracts: Ref[];
	property: string;
}

/** The §49.2 + §44.5 refusal codes. */
export const CODE_SAGA_INVARIANT_VIOLATED = "SAGA_INVARIANT_VIOLATED";
export const CODE_INCOMPATIBLE_CONTRACT_VERSION =
	"INCOMPATIBLE_CONTRACT_VERSION";

/** The actionable refusal (KRD §44.5: code, severity, explanation, how_to_fix[]). */
export interface BlockReason {
	code: string;
	severity: string;
	explanation: string;
	howToFix: string[];
}

/** Evaluate's verdict — exactly one of two. */
export type Outcome = "satisfied" | "violated";

export interface SagaOutcome {
	outcome: Outcome;
	blockReason?: BlockReason;
}

/** The ordered events the fédération emitted (the statechart's terminal state). */
export type Trace = string[];

export function isKnownScope(s: string): s is Scope {
	return (SCOPES as readonly string[]).includes(s);
}
export function isKnownCertLanguage(c: string): c is CertLanguage {
	return (CERT_LANGUAGES as readonly string[]).includes(c);
}

/** Validation error (empty string ⇒ valid). */
export function validate(s: SagaInvariant): string {
	if (!s.name) return "sagas: saga has no name";
	if (!s.property) return "sagas: saga has no property";
	if (!isKnownScope(s.scope))
		return `sagas: unknown scope ${s.scope} (a saga is transverse — never local_cell)`;
	if (!isKnownCertLanguage(s.certLanguage))
		return `sagas: unknown cert_language ${s.certLanguage}`;
	if (s.participants.length < 2)
		return "sagas: a saga must span ≥2 participants";
	for (const p of s.participants) {
		if (!p.cell) return "sagas: malformed participant (empty cell ref)";
		for (const c of p.compensation) {
			if (!isPinned(c))
				return `sagas: a compensation stepRef must be pinned id@version (${refString(c)})`;
		}
	}
	if (!recognisedProperty(s.property))
		return `sagas: unrecognised saga property ${s.property}`;
	return "";
}

const CANONICAL_PROPERTY =
	"payment_captured implies (order_confirmed or compensation_executed)";

function recognisedProperty(property: string): boolean {
	return property === CANONICAL_PROPERTY;
}

/**
 * Evaluate — the saga property evaluator (KRD §49.2). For the canonical property
 * "payment_captured implies (order_confirmed or compensation_executed)": a captured payment is
 * satisfied IFF order_confirmed OR compensation_executed is present; a trace without
 * payment_captured is satisfied (vacuously). The dangling-money monster (payment_captured,
 * neither) is violated / SAGA_INVARIANT_VIOLATED. Total, deterministic, never throws.
 */
export function evaluate(s: SagaInvariant, trace: Trace): SagaOutcome {
	if (!recognisedProperty(s.property)) {
		return {
			outcome: "violated",
			blockReason: unparsablePropertyReason(s.property),
		};
	}
	const has = (e: string) => trace.includes(e);
	const captured = has("payment_captured");
	const holds =
		!captured || has("order_confirmed") || has("compensation_executed");
	if (holds) return { outcome: "satisfied" };
	return { outcome: "violated", blockReason: sagaViolatedReason() };
}

function sagaViolatedReason(): BlockReason {
	return {
		code: CODE_SAGA_INVARIANT_VIOLATED,
		severity: "blocking",
		explanation:
			"Un paiement capturé (payment_captured) reste sans commande confirmée (order_confirmed) ni compensation exécutée (compensation_executed) : la propriété de la saga est violée. Une jambe a échoué après la capture et la compensation déclarée n'a pas été exécutée — la fédération laisse de l'argent capturé contre rien (KRD §49.2).",
		howToFix: [
			"run_compensation_on_failure",
			"declare_compensation_for_the_failed_leg",
		],
	};
}

function unparsablePropertyReason(property: string): BlockReason {
	return {
		code: CODE_SAGA_INVARIANT_VIOLATED,
		severity: "blocking",
		explanation: `La propriété de la saga « ${property} » n'a pas pu être évaluée.`,
		howToFix: ["fix_the_property_predicate", "run_compensation_on_failure"],
	};
}

/** RunCompensation's result: the ordered compensation events + the post-compensation trace. */
export interface Compensation {
	events: string[];
	trace: Trace;
}

/**
 * RunCompensation — the statechart compensation transition (KRD §49.2): given a saga and a
 * trace where a leg failed, returns the declared compensation legs of the participants whose
 * commit events are present, in REVERSE participant order (last-committed compensated first),
 * then the compensation_executed marker. The legs are REFERENCED S10 operations (id@version) —
 * NOT executed. Pure, total, deterministic.
 */
export function runCompensation(s: SagaInvariant, failed: Trace): Compensation {
	const present = new Set(failed);
	const events: string[] = [];
	for (let i = s.participants.length - 1; i >= 0; i--) {
		const p = s.participants[i];
		const committed = p.commits.some((c) => present.has(c));
		if (!committed) continue;
		for (const leg of p.compensation) events.push(refString(leg));
	}
	events.push("compensation_executed");
	return { events, trace: [...failed, "compensation_executed"] };
}

/** CheckCoherence's verdict — exactly one of two. */
export type Coherence = "coherent" | "incompatible";

export interface CoherenceOutcome {
	coherence: Coherence;
	blockReason?: BlockReason;
	offending?: string[];
}

/** Heads map: a target id → its current head version (the S17 Resolve input). */
export type Heads = Record<string, string>;

/**
 * resolveStatus — the S17 Resolve staleness check (green | stale | absent), projected. A
 * consumed ref is green iff heads has its id pinned exactly at head; stale if pinned to a
 * non-head version; absent if heads has no entry. green is the only healthy status.
 */
export function resolveStatus(
	ref: Ref,
	heads: Heads,
): "green" | "stale" | "absent" {
	const head = heads[ref.id];
	if (head === undefined) return "absent";
	return head === ref.version ? "green" : "stale";
}

/**
 * CheckCoherence — the coherence check (KRD §49.2): « aucun événement consommé n'est produit par
 * une version incompatible ». incompatible iff ANY consumed ref is not at head (composing the
 * S17 Resolve staleness), coherent only when all are. Total, deterministic, never throws.
 */
export function checkCoherence(
	ct: CoherenceTest,
	heads: Heads,
): CoherenceOutcome {
	const offending = ct.contracts
		.filter((r) => resolveStatus(r, heads) !== "green")
		.map(refString);
	if (offending.length === 0) return { coherence: "coherent" };
	return {
		coherence: "incompatible",
		offending,
		blockReason: {
			code: CODE_INCOMPATIBLE_CONTRACT_VERSION,
			severity: "blocking",
			explanation: `Un événement consommé est épinglé à une version producteur incompatible (non-head) : ${offending.join(", ")}. La fédération ne reste cohérente que si chaque contrat consommé pointe la version head du producteur (KRD §49.2).`,
			howToFix: [
				"repin_consumed_contract_to_producer_head",
				"open_a_changeset_to_migrate_the_consumer",
			],
		},
	};
}
