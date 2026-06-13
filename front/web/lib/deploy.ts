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

	/* --- DP26: the optional COMPLETE-ORDER section (network → … → URL) -------------------- */
	/** The DP02 manifest the phase pinned — what DP05 RE-EMITS and what the DP15 datastore
	 * provision + DP12 bootstrap order over. ABSENT ⇒ the exact S96 plan (no order, §9
	 * anti-overwrite); SUPPLIED ⇒ the DP26-ordered deploy. */
	manifest?: OrderManifest;
	/** The deployment environment the datastore is provisioned for (DP15 — gates doltgres-in-prod,
	 * the DP06 rule delegated). Defaults to DEFAULT_DEPLOY_ENV (prod). */
	env?: DeployEnv;
}

/** The CLOSED, ORDERED DP26 deploy sequence (the twin of Go deploy.DeployStageKind). An unknown
 * stage does not exist — the order is EXACTLY these seven, in this order. */
export type DeployStageKind =
	| "network"
	| "volumes"
	| "datastore-provision"
	| "migration"
	| "bootstrap"
	| "healthcheck"
	| "url";

/** orderedStages — the CLOSED DP26 sequence in its DECLARED order (network → volumes →
 * datastore-provision → migration → bootstrap → healthcheck → URL). Declared once, copied out. */
export const ORDERED_DEPLOY_STAGES: readonly DeployStageKind[] = [
	"network",
	"volumes",
	"datastore-provision",
	"migration",
	"bootstrap",
	"healthcheck",
	"url",
];

/** orderedDeployStages — a fresh copy of the closed DP26 sequence (never mutable). */
export function orderedDeployStages(): DeployStageKind[] {
	return [...ORDERED_DEPLOY_STAGES];
}

/** One rung of the ordered deploy sequence: its 1-based position, its closed kind, and a
 * deterministic detail (a NAME / a ${VAR} ref / a service list — never a secret, never a
 * hardcoded endpoint). Pure data the Workbench renders as the timeline. */
export interface DeployStage {
	seq: number;
	kind: DeployStageKind;
	detail: string;
}

/** The DP26 COMPLETE deploy order: the ordered stages + the content address of the sequence +
 * the re-emitted stack's bundle hash (DP05) + the DP12 bootstrap hash. PURE: same phase →
 * byte-identical order. The twin of Go deploy.DeployOrder. */
export interface DeployOrder {
	stages: DeployStage[];
	/** the content address of the RE-EMITTED stack (DP05 — deploy re-emits from the phase). */
	stack_bundle_hash: string;
	/** the content address of the DP12 ordered bootstrap sequence. */
	bootstrap_hash: string;
	/** the content address of the whole order (same phase → same hash, the reproducibility oracle). */
	hash: string;
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

	/* --- DP26: the optional COMPLETE-ORDER section (undefined for an S96 plan) ------------ */
	/** The DP26 complete deploy order (network → volumes → datastore-provision → migration →
	 * bootstrap → healthcheck → URL). undefined when no manifest is supplied (the S96 plan is
	 * preserved byte-identically, §9). The order NEVER alters the emittedAppHash/url/stackName
	 * above — it is HOW the phase's app boots, not WHICH app (re-projection preserved). */
	order?: DeployOrder;
}

export interface BlockReason {
	code: string;
	severity: "blocking";
	explanation: string;
	how_to_fix: string[];
}

/** A minimal projection of the DP02 StackManifest the DP26 order reads (the twin only needs the
 * topology to render the deterministic stage details — the Go side is authoritative for the full
 * AST). app = the per-app key (must equal the surface project); the rest are NAMES / ${VAR} refs. */
export interface OrderManifest {
	app: string;
	services: { name: string; role: string }[];
	volumes?: { name: string; device_var: string }[];
	network: { name: string; external?: boolean };
	connector_scopes?: string[];
}

/** The closed deploy-environment set (DP15 / ADR 0065). The order's datastore-provision stage
 * gates doltgres-in-prod on it (the DP06 rule, delegated). */
export type DeployEnv = "prod" | "staging" | "dev" | "local" | "future_cloud";

export const DEFAULT_DOMAIN_ROOT = "deploy.aidos.app";

/** DEFAULT_DEPLOY_ENV — the environment a deploy targets when none is supplied: a deploy is a
 * LASTING prod environment by default (the twin of Go deploy.DefaultDeployEnv). */
export const DEFAULT_DEPLOY_ENV: DeployEnv = "prod";

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

/** ErrManifestProjectMix — the DP26 manifest belongs to another app than the surface (a
 * cross-app deploy order). The deploy is per-app (S96). The twin of Go ErrManifestProjectMix. */
function manifestProjectMix(manifestApp: string, project: string): BlockReason {
	return {
		code: "OUT_OF_SCOPE",
		severity: "blocking",
		explanation: `Deploy refused: manifest app "${manifestApp}" does not match the surface project "${project}" (a deploy is per-app, S96)`,
		how_to_fix: [
			"Provide a StackManifest whose app equals the surface project.",
			"Re-emit the manifest for this app before deploying (deploy = re-emit, DP26).",
			"Ensure every emitted component belongs to the same project.",
		],
	};
}

/** datastoreFragmentNames — the DP15 core data-substrate service keys for an environment, in
 * sorted order (the twin of datafragments.SubstrateCoreFragments): postgres + valkey + pgbouncer
 * always, doltgres ONLY off prod (the DP06 rule delegated — prod omits doltgres). PURE. */
function datastoreFragmentNames(env: DeployEnv): string {
	const keys = ["postgres", "valkey", "pgbouncer"];
	// The DP06 gate, delegated: doltgres is non-prod only (ADR 0065). Prod omits it cleanly.
	if (env !== "prod") keys.push("doltgres");
	return [...keys].sort().join(", ");
}

/** volumeRefs — the manifest's bind-volume device references (${VAR}) in sorted order — never a
 * hardcoded path (the SPEC-stack-2026 law, the bootstrap discipline reused). */
function volumeRefs(m: OrderManifest): string {
	const refs = (m.volumes ?? []).map((v) => `\${${v.device_var}}`).sort();
	return refs.length === 0 ? "(aucun volume nommé)" : refs.join(", ");
}

/** migrationDetail — names the S95 forward-only migration: its staged step kinds in order, or
 * "(aucune migration de schéma)" when the deploy carries no schema change (the stage stays). */
function migrationDetail(steps: MigrationStep[]): string {
	if (steps.length === 0) return "(aucune migration de schéma)";
	return `S95 forward-only: ${steps.map((s) => s.stage).join(" → ")}`;
}

/** healthcheckDetail — the manifest's service container names whose healthcheck must pass, in
 * sorted order (NAMES only, the DP07 convention: the server = ${APP_NAME}, else ${APP_NAME}-<name>). */
function healthcheckDetail(m: OrderManifest): string {
	const svcs = [...m.services].sort((a, b) =>
		a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
	);
	const names = svcs.map((s) =>
		// biome-ignore lint/suspicious/noTemplateCurlyInString: a deliberate env-var reference rendered for the screen (DP07 container-name convention), never a JS template placeholder.
		s.role === "server" ? "${APP_NAME}" : `\${APP_NAME}-${s.name}`,
	);
	return names.length === 0 ? "(aucun service)" : names.join(", ");
}

/** The DP12 closed bootstrap event-kind sequence (the twin of bootstrap.ORDERED_KINDS) — the
 * profile-independent amorçage rungs the bootstrap detail names, NAMES only (no port/secret). */
const BOOTSTRAP_KINDS = [
	"network-created",
	"volumes-created",
	"env-materialized",
	"secrets-checked",
	"ports-resolved",
	"traefik-up",
	"datastore-up",
	"server-up",
	"healthy",
	"urls-printed",
];

/** buildOrder — the DP26 COMPLETE deploy order, REUSING the DP05/DP15/S95/DP12 motifs verbatim
 * (the front twin renders the deterministic plan-as-data the Go engine is authoritative for):
 *
 *  1. the manifest must belong to the SAME app as the surface (per-app deploy, S96);
 *  2. the order's seven stages (network → volumes → datastore-provision → migration → bootstrap
 *     → healthcheck → URL) are ordered; every detail is a NAME / ${VAR} ref / a service list,
 *     never a secret value, never a hardcoded endpoint;
 *  3. the order is content-addressed (a digest over the canonical summary), so "même phase →
 *     même ordre" is one comparison.
 *
 * PURE: same (phase, manifest, env, migration) → byte-identical order. It runs NO real docker —
 * the order is a deterministic plan-as-data. It NEVER reads/alters the emittedAppHash/url/stackName.
 */
function buildOrder(
	input: DeployInput,
	url: string,
	steps: MigrationStep[],
): DeployOrder | BlockReason {
	const m = input.manifest as OrderManifest;

	// (1) per-app: the manifest's app must match the surface's project.
	if (m.app !== input.surface.project) {
		return manifestProjectMix(m.app, input.surface.project);
	}

	const env = input.env ?? DEFAULT_DEPLOY_ENV;

	// the re-emitted stack bundle hash (DP05) — a deterministic content address of the
	// topology + env + url (the deploy re-emits from the phase; the Go EmitStack BundleHash is
	// authoritative — the twin reproduces a stable address for the screen).
	const stackBundleHash = digest(
		JSON.stringify({
			app: m.app,
			env,
			network: m.network.name,
			phase: input.phase.phaseHash,
			services: [...m.services].map((s) => s.name).sort(),
		}),
	);
	// the DP12 bootstrap sequence hash (the profile-independent ordered amorçage).
	const bootstrapHash = digest(
		JSON.stringify({ app: m.app, kinds: BOOTSTRAP_KINDS }),
	);

	// (2) order the seven stages — DETAILS are NAMES / ${VAR} refs only.
	const details: Record<DeployStageKind, string> = {
		network: m.network.name,
		volumes: volumeRefs(m),
		"datastore-provision": datastoreFragmentNames(env),
		migration: migrationDetail(steps),
		bootstrap: `amorçage ordonné DP12 (${BOOTSTRAP_KINDS.join(" → ")})`,
		healthcheck: healthcheckDetail(m),
		url,
	};
	const stages: DeployStage[] = ORDERED_DEPLOY_STAGES.map((kind, i) => ({
		seq: i + 1,
		kind,
		detail: details[kind],
	}));

	// (3) content-address the whole order (the canonical "stack\nbootstrap\nseq:kind:detail" summary).
	const summary = [
		`stack=${stackBundleHash}`,
		`bootstrap=${bootstrapHash}`,
		...stages.map((s) => `s=${s.seq}:${s.kind}:${s.detail}`),
	].join("\n");

	return {
		stages,
		stack_bundle_hash: stackBundleHash,
		bootstrap_hash: bootstrapHash,
		hash: digest(summary),
	};
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

	// DP26 — the OPTIONAL complete-order section. Only when a manifest is supplied (else the
	// S96 shape is preserved byte-identically, §9). The emittedAppHash/url/stack above are
	// already computed and NEVER read by the order: the order changes HOW the phase boots, never
	// WHICH app (the re-projection property is preserved — deployedMatchesPhase still asserts
	// hash artefact = hash phase). The order folds into the plan id (order_hash), so a different
	// order → a different deploy id; an S96 plan with no order folds an empty order hash.
	let order: DeployOrder | undefined;
	if (input.manifest) {
		const o = buildOrder(input, url, steps);
		if (isBlocked(o)) return o;
		order = o;
	}

	const idBody = JSON.stringify({
		boot,
		emitted_app_hash: appHash,
		has_migration: hasMigration,
		migration_id: migration.id,
		order_hash: order ? order.hash : "",
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
		...(order ? { order } : {}),
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
