/**
 * The ENVIRONMENTS + ROLLBACK-TO-PHASE twin — the Workbench /deploy env+rollback source (AIDOS
 * S98, app-builder EPIC 10, DP28 / ADR 0043).
 *
 * The DECLARED projection of the Go package back/archive/envrollback: PROMOTE a stable phase into
 * an environment (preview→staging→prod) and ROLLBACK an environment to an EARLIER stable phase by
 * DETERMINISTIC RE-PROJECTION (S78) — never a restore of a stale sandbox artifact (CLAUDE.md §9).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): promote, rollback and rollbackProducesReProjection are PURE
 * functions of their input — no clock, no rng, no I/O, no LLM. Same input → byte-identical
 * Promotion / RollbackDecision (same id, app hash, stack, provenance). The Go output is the
 * AUTHORITATIVE truth; this twin reproduces the structure for the screen. The reproducibility
 * mirror lib/env-rollback.test.ts (fast-check) pins determinism, the Stop-gate (non-stable ⇒
 * refused), the re-projection (served hash = fresh re-emit of N-1), and the rollback ordering.
 *
 * THE WALL (CLAUDE.md §2/§9): /deploy PLANS; a rollback is a RECORDED DECISION (provenance §9), not
 * a write-to-kernel — the screen proposes it as a ChangeSet for approval, never a direct write.
 */

import {
	type BlockReason,
	DEFAULT_DOMAIN_ROOT,
	type EmittedSurface,
	emittedAppHash,
	type Gate,
	isBlocked,
	isDeployable,
	type PhaseVerdict,
	subdomainOf,
} from "./deploy";

export type { BlockReason, EmittedSurface, Gate, PhaseVerdict };
export { emittedAppHash, isBlocked, subdomainOf };

/** liveUrl — the per-env live HTTPS URL the cockpit surfaces (S99/DP29). DETERMINISTIC: the
 * Traefik-routed address is "https://<env>-<subdomain>.<domain root>" (the ACME certresolver,
 * DP27/S97, gives TLS). Same env+phase+domain → same URL. The scheme is ALWAYS https (TLS is
 * inherited, never optional). PURE — no I/O, no LLM. */
export function liveUrl(
	env: Environment,
	phaseHash: string,
	domainRoot?: string,
): string {
	const root =
		(domainRoot || DEFAULT_DOMAIN_ROOT).trim() || DEFAULT_DOMAIN_ROOT;
	return `https://${env}-${subdomainOf(phaseHash)}.${root}`;
}

/** The closed promotion ladder (preview → staging → prod). */
export type Environment = "preview" | "staging" | "prod";
export const LADDER: Environment[] = ["preview", "staging", "prod"];
const ENV_RANK: Record<Environment, number> = {
	preview: 0,
	staging: 1,
	prod: 2,
};
function isKnownEnv(e: string): e is Environment {
	return e in ENV_RANK;
}

/** A single DAG phase as the env/rollback plane reads it: its cut verdict (S23), its gate (§8),
 * and its emitted surface (S94 — what RE-EMITS). */
export interface PhaseInput {
	phase: PhaseVerdict;
	gate: Gate;
	surface: EmittedSurface;
}

/** The re-projection of a phase (preview.emittedAppHash, S94) — the address the artifact carries. */
export function reProjectedHash(p: PhaseInput): string {
	return emittedAppHash(p.phase.phaseHash, p.surface);
}

/** The per-env Pulumi stack name (DP28, ADR 0043): "<env>-<project>-d-<short phase hash>". */
export function stackName(
	env: Environment,
	project: string,
	phaseHash: string,
): string {
	return `${env}-${project}-${subdomainOf(phaseHash)}`;
}

// ─── HUMAN-VALIDATION GATE ON THE DEV (DP28) ─────────────────────────────────────────────────

/**
 * HumanValidation is the « validation_humaine » event (DP28): the human SAW the live dev/preview
 * deployment of an EXACT phase (DP25 — the real app has a URL the human opens) and VALIDATED or
 * REFUSED it. It is a HITL RUNTIME, below-the-line authorisation (qui / quand / quelle PHASE /
 * validated) — the verdict-for-verdict twin of Go envrollback.HumanValidation, calqued on
 * connectorenforce.ConnectorRuntimeApproval (A2), NEVER authority.Decide: the Kernel truth-admitter
 * governs whether a TRUTH may change; it NEVER gates a runtime deploy EFFECT. It is APPEND-ONLY and
 * content-addressed (the id is the digest of the whole body) — recording a validation is a recorded
 * DECISION (provenance §9), never an edit. The promotion gate consults it by PURE set-membership
 * (the EXACT phase, validated true), never by inference. Pure data.
 */
export interface HumanValidation {
	/** the content-address digest of the whole validation (the idempotency key). Same input → same id. */
	id: string;
	/** the environment the human VALIDATED — the dev/preview deployment they saw (preview). */
	env: Environment;
	/** the EXACT phase the human validated (DP25 — the phase the dev deployment served). The gate
	 * matches this against the phase being promoted: a validation of phase A never unlocks phase B. */
	phaseHash: string;
	/** the human verdict: true = « j'ai vu la vraie app et je la valide », false = refusée. Only true
	 * unlocks the promotion; false (or a missing validation) keeps it fail-closed. */
	validated: boolean;
	/** WHO validated/refused (provenance §9 — defaults to "human", never empty). */
	by: string;
}

export interface HumanValidationInput {
	env: Environment;
	phaseHash: string;
	validated: boolean;
	by?: string;
}

/** recordHumanValidation — build the content-addressed, append-only HumanValidation for a
 * validate|refuse over a dev/preview deployment. PURE, TOTAL — same input → byte-identical
 * validation (same id). It RECORDS a HITL-runtime decision (qui/quand/quelle phase/validated) with
 * provenance; it writes NOTHING (the wall) — the /deploy screen proposes it as an append-only
 * decision. It is NEVER authority.Decide (a runtime EFFECT gate, not a truth admission). A missing
 * actor defaults to "human". The verdict-for-verdict twin of Go RecordHumanValidation. */
export function recordHumanValidation(
	input: HumanValidationInput,
): HumanValidation {
	const by = (input.by ?? "").trim() || "human";
	const id = bodyDigest({
		by,
		env: input.env,
		phase_hash: input.phaseHash,
		validated: input.validated,
	});
	return {
		id,
		env: input.env,
		phaseHash: input.phaseHash,
		validated: input.validated,
		by,
	};
}

/** humanValidationCovers — true IFF this validation is a fresh, VALIDATED authorisation for the
 * EXACT phase. PURE set-membership, fail-closed (calque ConnectorRuntimeApproval.covers, A2):
 * null/undefined, a validation of ANOTHER phase, or validated=false ⇒ false. The promotion gate
 * consults this, never an inference. The verdict-for-verdict twin of Go HumanValidation.covers. */
export function humanValidationCovers(
	v: HumanValidation | null | undefined,
	phaseHash: string,
): boolean {
	return v != null && v.phaseHash === phaseHash && v.validated === true;
}

const DEV_NOT_HUMAN_VALIDATED_FIX = [
	"Ouvrez le déploiement dev/preview (DP25 — la vraie app a une URL), VOYEZ l'app, puis VALIDEZ cette phase exacte (validation_humaine validated=true).",
	"La validation est PAR PHASE : chaque nouveau déploiement dev redemande une validation_humaine de CETTE phase — une validation d'une autre phase ne débloque rien.",
	"Un REFUS (validated=false) ou l'absence de validation maintient la promotion fail-closed — c'est volontaire (DP28).",
	"La porte est une autorisation HITL RUNTIME below-the-line (qui/quand/quelle phase/validated), jamais authority.Decide (l'admetteur de vérité Kernel).",
];

/** devNotHumanValidated — the DEV_NOT_HUMAN_VALIDATED refusal (DP28). It NAMES why the dev
 * validation does not cover the promoted phase so the screen shows the exact gap (no validation /
 * wrong phase / refused). The verdict-for-verdict twin of Go devNotHumanValidatedBlock. */
function devNotHumanValidated(
	promotedPhase: string,
	v: HumanValidation | null | undefined,
): BlockReason {
	let explanation =
		"La promotion preview/dev → STAGING est REFUSÉE (DP28) : la phase dev courante n'a pas de validation_humaine validated=true POUR CETTE phase exacte (fail-closed).";
	if (v == null) {
		explanation +=
			" Cause : aucune validation_humaine n'accompagne la promotion de cette phase dev.";
	} else if (v.phaseHash !== promotedPhase) {
		explanation += ` Cause : la validation_humaine porte sur une AUTRE phase (${subdomainOf(
			v.phaseHash,
		)}) que la phase promue (${subdomainOf(promotedPhase)}) — la validation est PAR PHASE.`;
	} else if (!v.validated) {
		explanation +=
			" Cause : la validation_humaine de cette phase est validated=false (un REFUS humain) — fail-closed.";
	}
	return {
		code: "DEV_NOT_HUMAN_VALIDATED",
		severity: "blocking",
		explanation,
		how_to_fix: DEV_NOT_HUMAN_VALIDATED_FIX,
	};
}

// ─── PROMOTION ──────────────────────────────────────────────────────────────────────────────

export interface PromoteInput {
	env: Environment;
	project: string;
	phase: PhaseInput;
	/** Optional custom domain to LINK to this env (S99/DP29) — defaults to the AIDOS deploy root. */
	domainRoot?: string;
	/** The human validation_humaine of the dev/preview deployment (DP28). It GATES the dev/preview →
	 * staging hop ONLY: promotion to staging is refused DEV_NOT_HUMAN_VALIDATED unless this carries a
	 * HumanValidation of the EXACT phase being promoted, validated=true (fail-closed — null / another
	 * phase / validated=false ⇒ refused). A HITL RUNTIME gate, never authority.Decide (A2). null for
	 * the prod/preview hops (they are not gated by this door). */
	devValidation?: HumanValidation | null;
}

export interface Promotion {
	id: string;
	env: Environment;
	project: string;
	phaseHash: string;
	emittedAppHash: string;
	stackName: string;
	/** The linked domain root (custom or the default) — TLS is provisioned via ACME (S97/DP27). */
	domainRoot: string;
	/** The live HTTPS URL the cockpit shows once the env is promoted (always https — TLS inherited). */
	liveUrl: string;
}

function outOfScope(msg: string): BlockReason {
	return {
		code: "OUT_OF_SCOPE",
		severity: "blocking",
		explanation: `Promotion/rollback refusé : ${msg}`,
		how_to_fix: [
			"Fournissez un projet et un environnement connu (preview|staging|prod).",
			"Fournissez une phase avec sa surface émise (S94) — la promotion ré-émet la phase, jamais un artefact sandbox périmé.",
		],
	};
}

const PROMOTE_NOT_STABLE_FIX = [
	"Rendez la phase stable — chaque miroir rouge nommé doit passer au vert, le vert antérieur intact, le score de mutation ≥ seuil, aucun monstre.",
	"Promouvez une phase dont le verdict de coupe (S23) est stable — la stabilité est CALCULÉE.",
	"Ne contournez jamais le gate ; la promotion RÉ-ÉMET l'app depuis la phase (S78), jamais un artefact sandbox périmé (DP28).",
];

function promoteNotStable(reasons: string[]): BlockReason {
	let explanation =
		"La promotion d'environnement est REFUSÉE (S98) : la phase visée n'est PAS une phase stable (« done is computed » : red→vert ∧ vert antérieur ∧ mutation ≥ seuil ∧ aucun monstre).";
	if (reasons.length > 0) explanation += ` Raisons : ${reasons.join(", ")}.`;
	return {
		code: "ENV_PROMOTE_NOT_STABLE",
		severity: "blocking",
		explanation,
		how_to_fix: PROMOTE_NOT_STABLE_FIX,
	};
}

/** A deterministic, content-addressed display digest of a body (the Go records.Hash is
 * authoritative). */
function bodyDigest(body: unknown): string {
	// Reuse deploy's digest via emittedAppHash-style FNV by stringifying a canonical body.
	const s = JSON.stringify(body);
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

/** promote — bind a STABLE phase to an environment. STOP-GATE FIRST: a non-stable phase is
 * refused ENV_PROMOTE_NOT_STABLE before any re-emission. PURE, content-addressed, writes nothing. */
export function promote(input: PromoteInput): Promotion | BlockReason {
	if (!input.project) return outOfScope("no project (the binding is per app)");
	if (!isKnownEnv(input.env))
		return outOfScope(
			"unknown environment (the ladder is closed: preview|staging|prod)",
		);
	const gate = isDeployable(input.phase.phase, input.phase.gate);
	if (!gate.deployable) return promoteNotStable(gate.reasons);

	const phaseHash = input.phase.phase.phaseHash;

	// DP28 — THE HUMAN-VALIDATION GATE on the dev/preview → staging hop. The human must have SEEN the
	// live dev deployment (DP25) of THIS EXACT phase and VALIDATED it. FAIL-CLOSED set-membership
	// (calque ConnectorRuntimeApproval A2, NEVER authority.Decide): no validation, a validation of
	// another phase, or validated=false ⇒ refused DEV_NOT_HUMAN_VALIDATED. Gated AFTER the stop-gate
	// (a red dev phase never reaches the human gate) and only on the staging hop (prod/preview are
	// not gated by this door). It is a PURE comparison (the exact phase hash), never an LLM.
	if (
		input.env === "staging" &&
		!humanValidationCovers(input.devValidation, phaseHash)
	) {
		return devNotHumanValidated(phaseHash, input.devValidation);
	}

	const appHash = reProjectedHash(input.phase);
	const stack = stackName(input.env, input.project, phaseHash);
	const domainRoot = (input.domainRoot ?? "").trim() || DEFAULT_DOMAIN_ROOT;
	const url = liveUrl(input.env, phaseHash, domainRoot);
	const id = bodyDigest({
		domain_root: domainRoot,
		emitted_app_hash: appHash,
		env: input.env,
		live_url: url,
		phase_hash: phaseHash,
		project: input.project,
		stack_name: stack,
	});
	return {
		id,
		env: input.env,
		project: input.project,
		phaseHash,
		emittedAppHash: appHash,
		stackName: stack,
		domainRoot,
		liveUrl: url,
	};
}

// ─── ROLLBACK ───────────────────────────────────────────────────────────────────────────────

export interface RollbackInput {
	env: Environment;
	project: string;
	/** The currently-served phase (N) — the one that incidented. */
	current: PhaseInput;
	/** The EARLIER target phase (N-1) — must be distinct, earlier, stable. */
	target: PhaseInput;
	/** The DAG lineage (ancestor phase hashes) of the served phase (S24). */
	lineage: string[];
	actor?: string;
	reason?: string;
}

export interface Provenance {
	actor: string;
	reason: string;
	fromPhaseHash: string;
	toPhaseHash: string;
}

export interface RollbackDecision {
	id: string;
	env: Environment;
	project: string;
	fromPhaseHash: string;
	toPhaseHash: string;
	/** The re-projection of the TARGET phase (the app served AFTER rollback). */
	reProjectedAppHash: string;
	stackName: string;
	boot: string[];
	teardown: string[];
	provenance: Provenance;
}

const ROLLBACK_NOT_EARLIER_FIX = [
	"Choisissez une phase qui PRÉCÈDE strictement la phase servie dans le DAG (S24) ET dont le verdict de coupe est stable.",
	"Revenir à la phase déjà servie est un no-op (rien à ré-émettre) — ce n'est pas un rollback.",
	"Le rollback RÉ-ÉMET l'app depuis la phase antérieure (S78), réconcilie le datastore, et ENREGISTRE la décision (append-only, provenance §9) — jamais un artefact sandbox tel quel.",
];

function notEarlier(cause: string): BlockReason {
	return {
		code: "ROLLBACK_NOT_EARLIER",
		severity: "blocking",
		explanation: `Le rollback-vers-phase est REFUSÉ (S98) : la phase cible n'est PAS une phase stable DISTINCTE et ANTÉRIEURE. Cause : ${cause}.`,
		how_to_fix: ROLLBACK_NOT_EARLIER_FIX,
	};
}

/** rollback — roll an environment back to an EARLIER stable phase by re-projection. The target
 * must be distinct, earlier (in the lineage), and stable; else ROLLBACK_NOT_EARLIER (or
 * ENV_PROMOTE_NOT_STABLE if red). PURE, content-addressed, append-only, writes nothing. */
export function rollback(input: RollbackInput): RollbackDecision | BlockReason {
	if (!input.project) return outOfScope("no project (the rollback is per app)");
	if (!isKnownEnv(input.env))
		return outOfScope(
			"unknown environment (the ladder is closed: preview|staging|prod)",
		);

	const fromHash = input.current.phase.phaseHash;
	const toHash = input.target.phase.phaseHash;

	if (toHash === fromHash)
		return notEarlier(
			"rollback target is the currently-served phase (a no-op, not a rollback)",
		);
	if (!input.lineage.includes(toHash))
		return notEarlier(
			"rollback target does not precede the served phase in the DAG (S24 lineage)",
		);
	const tgate = isDeployable(input.target.phase, input.target.gate);
	if (!tgate.deployable) return promoteNotStable(tgate.reasons);

	const appHash = reProjectedHash(input.target);
	const actor = (input.actor ?? "").trim() || "human";
	const reason = input.reason ?? "";
	const stack = stackName(input.env, input.project, toHash);
	const provenance: Provenance = {
		actor,
		reason,
		fromPhaseHash: fromHash,
		toPhaseHash: toHash,
	};
	const boot = [
		"pulumi",
		"stack",
		"select",
		"--create",
		stack,
		"&&",
		"pulumi",
		"up",
		"--yes",
	];
	const teardown = ["pulumi", "destroy", "--yes"];
	const id = bodyDigest({
		boot,
		env: input.env,
		from_phase_hash: fromHash,
		project: input.project,
		provenance: {
			actor,
			from_phase_hash: fromHash,
			reason,
			to_phase_hash: toHash,
		},
		re_projected_app_hash: appHash,
		stack_name: stack,
		teardown,
		to_phase_hash: toHash,
	});
	return {
		id,
		env: input.env,
		project: input.project,
		fromPhaseHash: fromHash,
		toPhaseHash: toHash,
		reProjectedAppHash: appHash,
		stackName: stack,
		boot,
		teardown,
		provenance,
	};
}

/** rollbackProducesReProjection — the env's served-app hash AFTER rollback MUST equal a fresh
 * re-emit of the TARGET phase (never a stale sandbox artifact). Code judges the equality. */
export function rollbackProducesReProjection(
	dec: RollbackDecision,
	target: PhaseInput,
	servedAppHash: string,
): boolean {
	const fresh = reProjectedHash(target);
	return servedAppHash === dec.reProjectedAppHash && servedAppHash === fresh;
}
