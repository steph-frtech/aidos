/**
 * deploy-cockpit.ts — the DP29 PER-PROJECT DEPLOY & ENVIRONMENTS COCKPIT projection twin (EPIC F,
 * clôture ; ÉTEND S99). The verdict-for-verdict TS twin of back/runtime/deploycockpit/deploycockpit.go:
 * it ASSEMBLES — in ONE PURE, deterministic projection — everything the /deploy cockpit renders for
 * a project: the project's PHASES with their LIVENESS (vert / rouge / inconnu), the ENVIRONMENTS
 * (preview / staging / prod / future_cloud) with the phase each serves and its live HTTPS URL, the
 * custom DOMAINS (+ TLS), the closed PROFILES set (DP11), and — per phase — whether it is DEPLOYABLE
 * (« done is computed », DP26). It is the read-side companion of the DP25–28 action twins; the
 * SCREEN is the step, this is its read model.
 *
 * REUSE, NEVER FORK (CLAUDE.md §6, the spec « NE duplique pas »). The projection COMPOSES the
 * existing pure twins — it re-implements nothing:
 *   - the phase liveness rides the S23 cut verdict (PhaseVerdict.stable/reasons) — READ, never
 *     re-derived: unstable ⇒ rouge ; stable with no evidence ⇒ inconnu (NEVER painted green on
 *     nothing) ; stable with evidence ⇒ vert ;
 *   - the deployability per phase is deploy.isDeployable (DP26) — the SAME « done is computed »
 *     Stop-gate the deploy/promote inherits, never a forked check ;
 *   - the live HTTPS URL per environment rides env-rollback.liveUrl (DP28) ;
 *   - the env-domain bindings ride env-domainbind (DP27) ;
 *   - the profiles are the closed DP11 set ;
 *   - the content address rides the deploy.digest FNV-1a motif (the Go records.Hash is
 *     authoritative) — same input ⇒ byte-identical projection (same hash).
 *
 * PURE / DETERMINISM-FIRST (CLAUDE.md §6/§8 ; « projection PURE du DAG »). project + auditTimeline
 * are TOTAL, deterministic functions of their input — no clock, no rng, no I/O, no LLM, no
 * map-order leak. The same project + phases + environments + domains yields a byte-identical
 * Projection (same hash). The liveness / deployability are PURE comparisons (the code judges, never
 * an agent, never an estimation). An empty input yields a well-formed, empty-but-typed projection,
 * never a throw.
 *
 * THE WALL (CLAUDE.md §2). The cockpit READS already-projected facts (the phase cuts, the
 * promotions, the bindings — all below the line) and ASSEMBLES the read model. It writes NOTHING.
 * A deploy/rollback action from the screen is a ChangeSet proposal (infra truth) OR a below-the-
 * line trigger (preview/staging) — never a direct truth-write, never from this projection.
 */

import { digest, isDeployable, type PhaseVerdict } from "./deploy";
import type { Label } from "./env-domainbind";
import { type Environment, liveUrl, type Provenance } from "./env-rollback";

/**
 * The CLOSED DP06 / DP29 environment ladder the cockpit's env switcher offers — preview / staging /
 * prod / future_cloud (the verdict-for-verdict twin of deploycockpit.DefaultLadder). preview is the
 * runtime ephemeral rung (DP28), prod/staging/future_cloud are the lasting deploy rungs (DP06).
 * local is NOT a deploy rung (it terminates no TLS, DP27). Widening it is a truth change.
 */
export type CockpitEnv = "preview" | "staging" | "prod" | "future_cloud";
export const COCKPIT_LADDER: readonly CockpitEnv[] = [
	"preview",
	"staging",
	"prod",
	"future_cloud",
] as const;

/** defaultLadder — a fresh copy of the closed four-rung ladder (never mutable). */
export function defaultLadder(): CockpitEnv[] {
	return [...COCKPIT_LADDER];
}

/**
 * The CLOSED DP11 profile set the cockpit surfaces (the verdict-for-verdict twin of
 * stackmanifest.Profiles, SPEC-stack-2026 §one-shot). Declared once, in canonical order.
 */
export const COCKPIT_PROFILES = [
	"core",
	"docs",
	"observability",
	"qa",
	"git",
	"tickets",
	"connectors",
	"non-prod",
	"full",
] as const;
export type Profile = (typeof COCKPIT_PROFILES)[number];

/** profiles — a fresh copy of the closed DP11 profile set (never mutable). */
export function profiles(): Profile[] {
	return [...COCKPIT_PROFILES];
}

/**
 * Liveness is the CLOSED trichotomy the cockpit colours each phase with (DP29 done-criteria:
 * « liveness vert/rouge/inconnu »). The verdict-for-verdict twin of deploycockpit.Liveness — a PURE
 * projection of the phase's coherent-cut verdict (S23), NEVER an estimation:
 *   - "vert"    — the phase cut is STABLE with evidence ;
 *   - "rouge"   — the phase cut is UNSTABLE (≥1 red mirror) ;
 *   - "inconnu" — the phase carries no cut evidence yet (not computable; the cockpit NEVER guesses).
 */
export type Liveness = "vert" | "rouge" | "inconnu";

/** The data-liveness attribute the cockpit paints (the e2e contract: green|red|unknown). */
export type LivenessAttr = "green" | "red" | "unknown";
const LIVENESS_ATTR: Record<Liveness, LivenessAttr> = {
	vert: "green",
	rouge: "red",
	inconnu: "unknown",
};

/** livenessAttr — map the trichotomy to the e2e data attribute (green|red|unknown). PURE, TOTAL. */
export function livenessAttr(l: Liveness): LivenessAttr {
	return LIVENESS_ATTR[l];
}

/**
 * One project phase the cockpit projects: its content-addressed DAG node id (S24), the human label
 * of its DAG line, whether it is a current head (S24), its coherent-cut verdict (S23 — the SOURCE
 * of both the liveness and the deployability), and the DP26 Stop-gate inputs (§8). The optional
 * `hasEvidence` flag mirrors the Go cut/sensor evidence (a stable phase with no cut + no sensors is
 * « inconnu », never painted green on nothing) — defaults to true (a real DAG phase carries a cut).
 */
export interface PhaseInput {
	/** the DAG node's content address (S24) — the phase id the cockpit keys on. */
	nodeId: string;
	/** the human name of the DAG line this phase belongs to (S24). */
	label?: string;
	/** whether this phase is a current head of its line (S24). */
	head?: boolean;
	/** the coherent-cut verdict (S23) — READ, never re-computed. Its stable/reasons ARE the liveness. */
	phase: PhaseVerdict;
	/** the DP26 « done is computed » gate inputs (mutation threshold, monster count, §8). */
	gate: {
		mutationScore: number;
		mutationThreshold: number;
		monsterCount: number;
	};
	/** whether the phase carries cut/sensor evidence (S23). A stable phase WITHOUT evidence is
	 * « inconnu » (not computable). Defaults to true. */
	hasEvidence?: boolean;
}

/**
 * livenessOf — the PURE projection of a phase's coherent-cut verdict (S23) into the trichotomy. It
 * NEVER re-computes the cut (it READS the verdict) and NEVER estimates: an UNSTABLE phase is rouge ;
 * a STABLE phase with NO evidence is INCONNU (not yet computable — never painted green on nothing) ;
 * a STABLE phase WITH evidence is vert. The verdict-for-verdict twin of deploycockpit.LivenessOf.
 */
export function livenessOf(p: PhaseInput): Liveness {
	if (!p.phase.stable) return "rouge";
	// A stable verdict with no evidence is not a computed liveness — show « inconnu », never green.
	if (p.hasEvidence === false) return "inconnu";
	return "vert";
}

/** One environment of the project's ladder the cockpit projects (DP28 + DP06): which phase it
 * serves, the custom domain root cabled into it (DP27), and — for the preview rung — whether a
 * validated validation_humaine covers that phase (DP28: the preview → staging hop is permitted only
 * then). The verdict-for-verdict twin of deploycockpit.EnvironmentInput. */
export interface EnvironmentInput {
	env: CockpitEnv;
	/** the DAG node id of the phase this env serves (the recorded DP28 promotion target). Empty ⇒
	 * nothing deployed there yet. */
	servedPhaseId?: string;
	/** the custom domain root linked to this env (DP27). Empty ⇒ the default deploy root. */
	domainRoot?: string;
	/** the DP28 gate (only meaningful on the preview rung): whether a validated validation_humaine
	 * covers the served phase. Read from the recorded validation, never inferred. */
	humanValidated?: boolean;
}

/** A custom-domain binding the cockpit projects per environment (DP27 — TLS/URL read as-is). */
export interface EnvDomainBinding {
	domain: string;
	environment: string;
	url: string;
	certResolver: string;
	routerName: string;
	tls: boolean;
	labels: Label[];
}

/** The WHOLE cockpit request for ONE project (the verdict-for-verdict twin of deploycockpit.Input). */
export interface CockpitInput {
	project: string;
	/** the project's phases in frontier order (projectdag, S56). The projection preserves the order. */
	phases: PhaseInput[];
	/** the project's environments in ladder order (DP06 / DP28). Defaults to the closed four-rung ladder. */
	environments?: EnvironmentInput[];
	/** the project's custom-domain bindings already resolved per environment (DP27). */
	domains?: EnvDomainBinding[];
}

/** One phase as the cockpit shows it: id/label/head, liveness (vert/rouge/inconnu), deployability
 * (DP26), and the reasons it is not (the PHASE_NOT_STABLE source). The twin of deploycockpit.PhaseCard. */
export interface PhaseCard {
	nodeId: string;
	label?: string;
	head: boolean;
	liveness: Liveness;
	deployable: boolean;
	/** every offending fact when NOT deployable (the red mirror ids / a below-threshold mutation
	 * score / a present monster), sorted — the reason set behind PHASE_NOT_STABLE. Empty iff deployable. */
	reasons: string[];
}

/** One environment as the cockpit shows it (DP28 + DP27). The twin of deploycockpit.EnvironmentCard. */
export interface EnvironmentCard {
	env: CockpitEnv;
	servedPhaseId?: string;
	/** the liveness of the served phase (projected from the phase card — one source, never re-derived). */
	servedLiveness?: Liveness;
	/** the live HTTPS URL this env serves the app at (DP28 liveUrl — always https). Empty when nothing
	 * is deployed there yet. */
	liveUrl?: string;
	/** the custom domain cabled into this env (DP27). Empty ⇒ the default deploy root. */
	domain?: string;
	/** whether the env terminates TLS for its custom domain (DP27). */
	tls: boolean;
	/** the DP28 gate (preview rung only): whether the served phase is human-validated. */
	humanValidated: boolean;
	/** the DP28 gate verdict: a validated preview deployment unlocks the staging promotion. False on
	 * every other rung (the gate is preview→staging only). */
	stagingPromotable: boolean;
}

/** The DP29 per-project cockpit read model. The twin of deploycockpit.Projection. */
export interface CockpitProjection {
	project: string;
	phases: PhaseCard[];
	environments: EnvironmentCard[];
	domains: EnvDomainBinding[];
	profiles: Profile[];
	/** the content address of the whole projection (the deploy.digest motif — Go records.Hash is
	 * authoritative). Same input → same hash (the reproducibility oracle — « projection PURE du DAG »). */
	hash: string;
}

/**
 * project — the PURE DP29 cockpit projection (the spec's « DeployCockpitProjection »). It ASSEMBLES
 * — in one deterministic projection — the project's phase cards (liveness + deployability, reusing
 * S23 + DP26), environment cards (served phase + live URL + domain, reusing DP28 + DP27),
 * custom-domain bindings (DP27), and the closed DP11 profile set, then content-addresses the whole
 * read model. It re-computes NOTHING — every verdict is READ from the pure twins. The
 * verdict-for-verdict twin of deploycockpit.Project.
 *
 * projectID is the spec's first positional argument; when empty it falls back to in.project (the
 * projection's project echoes whichever is non-empty, projectID winning). PURE / TOTAL: no clock,
 * no rng, no I/O, no LLM. Same input → byte-identical Projection (same hash). Never throws.
 */
export function project(
	projectID: string,
	input: CockpitInput,
): CockpitProjection {
	const proj = (projectID || "").trim() || input.project || "";

	// ── PHASES — liveness + deployability, a pure projection of the cut (S23 + DP26). ──
	// A by-node-id index of each phase's liveness, so an environment can colour its served phase
	// from the SAME projection (one source — the env never re-derives the liveness).
	const livenessByPhase = new Map<string, Liveness>();
	const phases: PhaseCard[] = input.phases.map((p) => {
		const live = livenessOf(p);
		livenessByPhase.set(p.nodeId, live);
		// isDeployable IS the DP26 « done is computed » Stop-gate — reused, never forked. A non-stable
		// phase is marked NON-deployable with the reason set (the PHASE_NOT_STABLE source).
		const { deployable, reasons } = isDeployable(p.phase, p.gate);
		return {
			nodeId: p.nodeId,
			label: p.label,
			head: p.head === true,
			liveness: live,
			deployable,
			reasons,
		};
	});

	// ── DOMAINS — index the resolved DP27 bindings by environment (read as-is, never re-resolved). ──
	const domainByEnv = new Map<string, EnvDomainBinding>();
	for (const d of input.domains ?? []) domainByEnv.set(d.environment, d);

	// ── ENVIRONMENTS — served phase + live URL + domain + the DP28 gate (a pure assembly). ──
	const envInputs: EnvironmentInput[] =
		input.environments && input.environments.length > 0
			? input.environments
			: defaultLadder().map((e) => ({ env: e }));
	const environments: EnvironmentCard[] = envInputs.map((e) => {
		const card: EnvironmentCard = {
			env: e.env,
			servedPhaseId: e.servedPhaseId,
			tls: false,
			humanValidated: false,
			stagingPromotable: false,
		};
		// The DP28 gate: the preview rung unlocks the staging promotion ONLY when its served phase
		// carries a validated validation_humaine. Fail-closed (read, never inferred).
		if (e.env === "preview") {
			card.humanValidated = e.humanValidated === true;
			card.stagingPromotable = e.humanValidated === true && !!e.servedPhaseId;
		}
		if (e.servedPhaseId) {
			// Colour the served phase from the SAME phase index (one source — never re-derived).
			card.servedLiveness = livenessByPhase.get(e.servedPhaseId) ?? "inconnu";
			// The live HTTPS URL is the DP28 address (always https — TLS inherited). REUSED, not minted.
			// future_cloud rides the same routing as a deploy env (the URL shape is env-prefixed).
			card.liveUrl = liveUrl(
				e.env as unknown as Environment,
				e.servedPhaseId,
				e.domainRoot,
			);
		}
		// The custom domain (DP27) cabled into this env — read as-is (TLS/URL already resolved).
		const d = domainByEnv.get(e.env);
		if (d) {
			card.domain = d.domain;
			card.tls = d.tls;
		}
		return card;
	});

	const domains = input.domains ? [...input.domains] : [];

	// ── Content address — the deploy.digest FNV-1a motif over the canonical body MINUS the hash. ──
	const body = {
		project: proj,
		phases,
		environments,
		domains,
		profiles: profiles(),
	};
	const hash = digest(canonicalize(body));

	return { ...body, hash };
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// THE AUDIT TIMELINE — the DP28 incident / rollback history the cockpit shows (a pure reducer).
// ───────────────────────────────────────────────────────────────────────────────────────────────

/** The closed audit-event kinds the cockpit timeline renders. */
export type AuditKind =
	| "deploy"
	| "promote"
	| "human_validation"
	| "incident"
	| "rollback";

/** One audit-timeline entry — a recorded, append-only deploy/incident/rollback decision (DP28
 * provenance §9). The seq is the caller's recorded order (the DAG of decisions); the timeline
 * preserves it and NEVER re-sorts (deterministic). PURE data the cockpit renders as a timeline row. */
export interface AuditEntry {
	/** the recorded order (0-based) — the timeline preserves it (append-only, never re-sorted). */
	seq: number;
	kind: AuditKind;
	/** the environment the decision touched (preview | staging | prod | future_cloud). */
	env: CockpitEnv;
	/** the content-addressed phase the decision operated on (the deployed / rolled-back phase). */
	phaseHash: string;
	/** for a rollback: the phase rolled back FROM (the incidented head). Empty otherwise. */
	fromPhaseHash?: string;
	/** the provenance (who / why) — recorded, never inferred (§9). */
	provenance?: Provenance;
	/** a human one-line summary the cockpit renders (deterministic, no clock). */
	summary: string;
}

/**
 * auditTimeline — assemble the recorded deploy/incident/rollback decisions into the cockpit's
 * timeline, in the CALLER's recorded order (the DAG of decisions). It NEVER re-sorts (the order is
 * the recorded append-only sequence — deterministic) and NEVER fabricates an entry. PURE, TOTAL —
 * same input → byte-identical timeline (each entry's seq echoes its recorded position). The twin of
 * a read over the append-only HITL-runtime decisions (provenance §9).
 */
export function auditTimeline(
	entries: Omit<AuditEntry, "seq">[],
): AuditEntry[] {
	return entries.map((e, i) => ({ ...e, seq: i }));
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Canonicalization — a stable, sorted-key JSON encoding (the records.Canonicalize motif, S02).
// ───────────────────────────────────────────────────────────────────────────────────────────────

function canonicalize(v: unknown): string {
	if (v === null || v === undefined) return "null";
	if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
	if (typeof v === "object") {
		const keys = Object.keys(v as Record<string, unknown>).sort();
		return `{${keys
			.map(
				(k) =>
					`${JSON.stringify(k)}:${canonicalize((v as Record<string, unknown>)[k])}`,
			)
			.join(",")}}`;
	}
	return JSON.stringify(v);
}
