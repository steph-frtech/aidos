/**
 * The PHASE-KEYED DEPLOY twin — the Workbench /deploy source (AIDOS S96).
 *
 * The DECLARED projection of the Go package back/runtime/deploy: the deterministic pipeline
 * that deploys an emitted app ONLY from a STABLE phase (« done is computed »: red→vert ∧ vert
 * antérieur ∧ mutation ≥ seuil ∧ aucun monstre), RE-PROJECTS the app from the phase (never a
 * stale sandbox artifact, DP26), runs a FORWARD-ONLY data migration (S95: expand → backfill →
 * contract), and provisions a per-phase deploy URL via `pulumi up` (ADR 0043).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): buildPlan, isDeployable, emittedAppHash and
 * migrationIsForwardOnly are PURE functions of their input — no clock, no rng, no I/O, no LLM.
 * The same stable phase + surface + change → byte-identical plan (same id, same URL, same
 * staged migration). The Go output is the AUTHORITATIVE truth; this twin reproduces the
 * structure for the screen. The reproducibility mirror lib/deploy.test.ts (fast-check) pins
 * determinism, the Stop-gate (non-stable ⇒ refused), the re-projection (deployed hash = phase
 * emitted hash) and forward-only. The deploy is a PROCESS (Hono Node/Bun/edge, ADR 0040).
 *
 * READ-ONLY (the wall): /deploy PLANS; it writes no truth. A truth-write (recording the phase
 * deploy as a DAG decision) goes through propose → ChangeSet → approval, never a direct write.
 */

export interface EmittedSurface {
	project: string;
	serverBundleHash: string;
	frontBundleHash: string;
	infraHash: string;
	datastoreHash?: string;
}

/** The coherent-cut verdict of a phase (phases.StablePhase from S23), reduced to what the
 * deploy Stop-gate reads: the derived stable verdict + the offending reasons (red mirrors). */
export interface PhaseVerdict {
	phaseHash: string;
	stable: boolean;
	reasons: string[];
}

/** The « done is computed » gate inputs (§8): mutation score vs the declared threshold, and
 * the monster count (the completeness law). Crossed with the phase verdict to decide deploy. */
export interface Gate {
	mutationScore: number;
	mutationThreshold: number;
	monsterCount: number;
}

/** One forward-only migration stage (S95): expand (additive) → backfill (data move) →
 * contract (drop, after backfill). The screen renders the staged steps. */
export interface MigrationStep {
	stage: "expand" | "backfill" | "contract";
	sql: string;
	note: string;
}

export interface MigrationPlan {
	id: string;
	steps: MigrationStep[];
	preservesAllData: boolean;
}

export interface DeployInput {
	phase: PhaseVerdict;
	gate: Gate;
	surface: EmittedSurface;
	programPath: string;
	programBytes: string;
	/** The optional data-migration staged steps (S95). Empty ⇒ no schema change this deploy. */
	migration?: MigrationStep[];
	domainRoot?: string;
}

export interface DeployPlan {
	id: string;
	project: string;
	phaseHash: string;
	emittedAppHash: string;
	url: string;
	subdomain: string;
	stackName: string;
	programPath: string;
	migration: MigrationPlan;
	hasMigration: boolean;
	boot: string[];
	teardown: string[];
}

export interface BlockReason {
	code: string;
	severity: "blocking";
	explanation: string;
	how_to_fix: string[];
}

export const DEFAULT_DOMAIN_ROOT = "deploy.aidos.app";

export function isBlocked<T>(v: T | BlockReason): v is BlockReason {
	return (
		typeof v === "object" && v !== null && "code" in v && "how_to_fix" in v
	);
}

/** A deterministic FNV-1a digest (display content address — the Go records.Hash is
 * authoritative). Same bytes → same digest, no clock/rng. */
export function digest(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

/** gateReasons — the gate's offending facts (mutation below threshold, a present monster),
 * canonically ordered. Empty iff the gate's computed side holds. */
export function gateReasons(gate: Gate): string[] {
	const rs: string[] = [];
	if (gate.mutationScore < gate.mutationThreshold) {
		rs.push(
			`mutation_below_threshold(${gate.mutationScore.toFixed(4)}<${gate.mutationThreshold.toFixed(4)})`,
		);
	}
	if (gate.monsterCount > 0) rs.push(`monster_present(${gate.monsterCount})`);
	return rs.sort();
}

/** isDeployable — the « done is computed » decision: the phase's coherent-cut verdict (S23)
 * crossed with the gate (mutation ≥ threshold, no monster). Returns {deployable, reasons}. */
export function isDeployable(
	phase: PhaseVerdict,
	gate: Gate,
): { deployable: boolean; reasons: string[] } {
	const reasons = [...phase.reasons, ...gateReasons(gate)].sort();
	const gateStable =
		gate.mutationScore >= gate.mutationThreshold && gate.monsterCount === 0;
	return { deployable: phase.stable && gateStable, reasons };
}

/** emittedAppHash — the SINGLE content address of the whole app RE-EMITTED from a phase: a
 * canonical, named-key join of the surface's component hashes, keyed by the phase. PURE +
 * order-free. Any byte change in any component → a new hash (no stale artifact masquerades). */
export function emittedAppHash(phaseHash: string, s: EmittedSurface): string {
	const body = JSON.stringify({
		datastore: s.datastoreHash ?? "",
		front_bundle: s.frontBundleHash,
		infra: s.infraHash,
		phase: phaseHash,
		project: s.project,
		server_bundle: s.serverBundleHash,
	});
	return digest(body);
}

/** The per-phase deploy subdomain: "d-" + first 12 alnum chars of the phase hash (DNS-safe,
 * starts with a letter, distinct from preview's "p-"). Same phase → same subdomain. */
export function subdomainOf(phaseHash: string): string {
	const h = phaseHash.toLowerCase();
	let short = "";
	for (const ch of h) {
		if (/[a-z0-9]/.test(ch)) short += ch;
		if (short.length >= 12) break;
	}
	if (short === "") short = "000000000000";
	return `d-${short}`;
}

/** migrationIsForwardOnly — the migration stages appear in expand → backfill → contract order
 * with no backward step (a contract never precedes a backfill). PURE — code judges. */
export function migrationIsForwardOnly(steps: MigrationStep[]): boolean {
	const rank: Record<string, number> = {
		expand: 0,
		backfill: 1,
		contract: 2,
	};
	let last = -1;
	for (const s of steps) {
		const r = rank[s.stage];
		if (r === undefined) return false;
		if (r < last) return false;
		last = r;
	}
	return true;
}

function migrationPreservesAllData(steps: MigrationStep[]): boolean {
	// Every contract must be preceded (somewhere) by a backfill (no row loses its value).
	const hasContract = steps.some((s) => s.stage === "contract");
	const hasBackfill = steps.some((s) => s.stage === "backfill");
	return !hasContract || hasBackfill;
}

function dir(p: string): string {
	const i = p.lastIndexOf("/");
	return i < 0 ? "." : p.slice(0, i);
}

const STALE_FIX = [
	"Make the phase stable — turn every red mirror named in the reasons green (red→green), keep the prior green intact, reach the declared mutation threshold, leave no monster.",
	"Recompute the phase verdict after corrections — stability is COMPUTED, never declared; deploy unblocks when the verdict is stable.",
	"Never bypass the gate to deploy a stale artifact — deploy RE-EMITS the app from the phase (S78), it never restores a stale artifact (DP26 / ADR 0043).",
];

function notStable(reasons: string[]): BlockReason {
	let explanation =
		"Le déploiement de la phase est REFUSÉ (S96) : la phase visée n'est PAS une phase stable (« done is computed » : red→vert ∧ vert antérieur ∧ mutation ≥ seuil ∧ aucun monstre).";
	if (reasons.length > 0) explanation += ` Raisons : ${reasons.join(", ")}.`;
	return {
		code: "PHASE_NOT_STABLE",
		severity: "blocking",
		explanation,
		how_to_fix: STALE_FIX,
	};
}

function surfaceFail(msg: string): BlockReason {
	return {
		code: "OUT_OF_SCOPE",
		severity: "blocking",
		explanation: `Deploy refused: ${msg}`,
		how_to_fix: [
			"Provide a complete emitted surface (server S87, front S93, infra/Pulumi ADR 0043) for the phase.",
			"Re-emit the phase's app (deploy = re-emit, DP26) — never deploy a stale sandbox artifact.",
			"Ensure every emitted component belongs to the same project.",
		],
	};
}

function validateSurface(input: DeployInput): BlockReason | null {
	if (!input.surface.project) return surfaceFail("surface has no project");
	if (!input.surface.serverBundleHash)
		return surfaceFail(
			"surface has no server bundle (the app must boot a server)",
		);
	if (!input.surface.frontBundleHash)
		return surfaceFail("surface has no front bundle (the app must serve a UI)");
	if (!input.surface.infraHash)
		return surfaceFail("surface has no infra program (nothing to `pulumi up`)");
	if (!input.programBytes || !input.programPath)
		return surfaceFail("no emitted Pulumi program to boot");
	if (!input.programPath.includes(`gen/${input.surface.project}/`))
		return surfaceFail("program project does not match the surface project");
	return null;
}

/** buildPlan — the deterministic, content-addressed DeployPlan, produced ONLY when the phase
 * is deployable. STOP-GATE FIRST: a non-stable phase is refused PHASE_NOT_STABLE before any
 * re-emission. Writes nothing (the wall). */
export function buildPlan(input: DeployInput): DeployPlan | BlockReason {
	// 1. STOP-GATE FIRST.
	const gate = isDeployable(input.phase, input.gate);
	if (!gate.deployable) return notStable(gate.reasons);

	// 2. validate the surface.
	const br = validateSurface(input);
	if (br) return br;

	// 3. RE-EMIT FROM THE PHASE.
	const appHash = emittedAppHash(input.phase.phaseHash, input.surface);

	// 4. the forward-only migration.
	const steps = input.migration ?? [];
	const hasMigration = steps.length > 0;
	const migration: MigrationPlan = {
		id: hasMigration ? digest(JSON.stringify(steps)) : "",
		steps,
		preservesAllData: migrationPreservesAllData(steps),
	};

	const root = input.domainRoot || DEFAULT_DOMAIN_ROOT;
	const sub = subdomainOf(input.phase.phaseHash);
	const url = `https://${sub}.${root}`;
	const stack = `deploy-${input.surface.project}-${sub}`;
	const cwd = dir(input.programPath);

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
		"--cwd",
		cwd,
	];
	const teardown = [
		"pulumi",
		"destroy",
		"--yes",
		"--cwd",
		cwd,
		"&&",
		"pulumi",
		"stack",
		"rm",
		"--yes",
		stack,
	];

	const idBody = JSON.stringify({
		boot,
		emitted_app_hash: appHash,
		has_migration: hasMigration,
		migration_id: migration.id,
		phase_hash: input.phase.phaseHash,
		program_path: input.programPath,
		project: input.surface.project,
		stack_name: stack,
		subdomain: sub,
		teardown,
		url,
	});

	return {
		id: digest(idBody),
		project: input.surface.project,
		phaseHash: input.phase.phaseHash,
		emittedAppHash: appHash,
		url,
		subdomain: sub,
		stackName: stack,
		programPath: input.programPath,
		migration,
		hasMigration,
		boot,
		teardown,
	};
}

/** deployedMatchesPhase — the S96 re-projection property: a running deploy's served-app hash
 * must EQUAL the plan's emitted-app hash, else a stale sandbox artifact is deployed. A pure
 * comparison — code judges, never an agent. */
export function deployedMatchesPhase(
	plan: DeployPlan,
	servedAppHash: string,
): true | BlockReason {
	if (servedAppHash === plan.emittedAppHash) return true;
	return {
		code: "OUT_OF_SCOPE",
		severity: "blocking",
		explanation: `the deploy serves app hash "${servedAppHash}" but the phase re-emits "${plan.emittedAppHash}" — the deployed artifact is not the phase's app (a stale sandbox artifact)`,
		how_to_fix: [
			"Re-emit the phase's surface and rebuild the deploy plan (deploy = re-emit, DP26 / ADR 0043).",
			"Tear the stale deploy down (`pulumi destroy`) and `pulumi up` the current emitted program.",
			"Never restore a sandbox artifact as-is — the truth-store/phase is authoritative, the code is regenerable.",
		],
	};
}
