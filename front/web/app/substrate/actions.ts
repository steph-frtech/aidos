"use server";

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { type Environment, isKnownEnvironment } from "@/lib/environments";

const execFileP = promisify(execFile);

/** The AIDOS repo root (the Go module lives in <repo>/back). Overridable. */
const APP_REPO = process.env.AIDOS_REPO || "/data/dev/aidos";

/**
 * The Go binary the emitter runs under. The go.mod pins go >= 1.25.5, so the
 * system `go` (often older) would refuse under GOTOOLCHAIN=local; we prefer an
 * explicit AIDOS_GO_BIN, then the cached 1.25.10 toolchain binary, and finally a
 * plain `go` (with GOTOOLCHAIN=auto so it resolves the right toolchain itself).
 */
const PINNED_GO =
	"/home/stevig/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.25.10.linux-amd64/bin/go";
function resolveGo(): { bin: string; toolchain: string } {
	if (process.env.AIDOS_GO_BIN) {
		return { bin: process.env.AIDOS_GO_BIN, toolchain: "local" };
	}
	if (existsSync(PINNED_GO)) {
		return { bin: PINNED_GO, toolchain: "local" };
	}
	// Fall back to PATH go and let GOTOOLCHAIN=auto download/select the pinned one.
	return { bin: "go", toolchain: "auto" };
}

/**
 * ServiceFragmentView is the twin of the Go datafragments.ServiceFragment + its
 * content address — the per-service row the /substrate panel renders.
 */
export interface ServiceFragmentView {
	key: string;
	project_id: string;
	service: {
		name: string;
		role: string;
		image: string;
		internal_port: number;
		profile: string;
		healthcheck?: string;
		depends_on?: string[];
	};
	volumes: { name: string; device_var: string }[];
	hash: string;
}

/** RefusalView is the twin of the Go envbindings.Refusal surfaced verbatim. */
export interface RefusalView {
	code: string;
	message: string;
}

/**
 * SubstrateView is the full DP15 emission for one (project, env) — the FULL palette
 * door (with the DP06 refusal surfaced verbatim in prod), the legal core slice, and
 * the closed palette key set. The panel renders this single source.
 */
export interface SubstrateView {
	ok: boolean;
	project_id: string;
	env: Environment;
	/** full_ok is false in prod (the DP06 gate refuses doltgres). */
	full_ok: boolean;
	full: ServiceFragmentView[];
	refusal: RefusalView | null;
	core: ServiceFragmentView[];
	keys: string[];
	/** error carries any execution-level failure (the Go cmd refused / crashed). */
	error?: string;
}

interface RawOutput {
	project_id: string;
	env: string;
	full_ok: boolean;
	full?: ServiceFragmentView[];
	refusal?: RefusalView | null;
	core?: ServiceFragmentView[];
	keys?: string[];
}

/**
 * DemoStep is the twin of the Go demoStep — one observable step of the DP16 demo job's
 * outbox dispatch sequence: a `write-effect` step (the effect is written PENDING in the
 * state transaction) THEN an `ack` step (the dispatcher delivered it). The ordered list
 * is the deterministic trace of the canonical scheduled operation (sendReminder) realised
 * at its echeance on an INJECTED clock — write-effect ALWAYS precedes ack.
 */
export interface DemoStepView {
	step: number;
	phase: "write-effect" | "ack";
	operation: string;
	effect_id: string;
	kind: string;
	target: string;
	bus: string;
}

/**
 * AsyncSubstrateView is the full DP16 ASYNC-substrate emission for one (project, env) —
 * the TWO async-layer service fragments (Windmill = workflow engine, NATS = bus) and the
 * ordered demo dispatch trace. The async panel renders this single source.
 */
export interface AsyncSubstrateView {
	ok: boolean;
	project_id: string;
	env: Environment;
	async: ServiceFragmentView[];
	keys: string[];
	demo: DemoStepView[];
	/** error carries any execution-level failure (the Go cmd refused / crashed). */
	error?: string;
}

interface RawAsyncOutput {
	project_id: string;
	env: string;
	async?: ServiceFragmentView[];
	keys?: string[];
	demo?: DemoStepView[];
}

/**
 * ObsServiceFragmentView is the twin of the Go observabilityfragments.ServiceFragment +
 * its content address AND the wall oracle — the per-service row the observability section
 * renders. `writes_truth` is ALWAYS false and `capabilities` is a closed read-only set
 * (observe:*), the data behind the « écrit aucune vérité » indicator (the wall §2).
 */
export interface ObsServiceFragmentView extends ServiceFragmentView {
	writes_truth: boolean;
	capabilities: string[];
}

/**
 * InstrumentationView is the twin of the Go observabilityfragments.Instrumentation — how
 * the emitted TS app wires @opentelemetry/* → SigNoz (OTLP endpoint var) and its errors →
 * GlitchTip (DSN var), ADR 0040 (JS/TS OTel SDK, NEVER Go). A PURE projection of the
 * Kernel, READ-ONLY on reality (writes_truth always false).
 */
export interface InstrumentationView {
	project_id: string;
	env: string;
	packages: string[];
	otlp_endpoint_var: string;
	otlp_target: string;
	dashboard_target: string;
	error_dsn_var: string;
	error_target: string;
	read_only_reality: boolean;
	hash: string;
	writes_truth: boolean;
	capabilities: string[];
}

/**
 * ObservabilitySubstrateView is the full DP17 OBSERVABILITY-substrate emission for one
 * (project, env) — the THREE observability fragments (OTel collector + SigNoz + GlitchTip,
 * all profile observability), the emitted TS instrumentation projection, the closed
 * palette key set, and the CAPITAL indicator `obs_no_truth` (the ops-observability writes
 * NO truth — exploitation observability ≠ Kernel sensor, the RealityMirror E12 is the only
 * on-ramp). The observability section renders this single source.
 */
export interface ObservabilitySubstrateView {
	ok: boolean;
	project_id: string;
	env: Environment;
	observability: ObsServiceFragmentView[];
	instrumentation: InstrumentationView | null;
	keys: string[];
	/** obs_no_truth is the deterministic indicator: NO fragment / NOT the instrumentation
	 * writes truth AND no capability is a truth-write scope (computed by the Go oracle). */
	obs_no_truth: boolean;
	/** error carries any execution-level failure (the Go cmd refused / crashed). */
	error?: string;
}

interface RawObsOutput {
	project_id: string;
	env: string;
	observability?: ObsServiceFragmentView[];
	instrumentation?: InstrumentationView | null;
	keys?: string[];
	obs_no_truth?: boolean;
}

/**
 * AppServiceFragmentView is the twin of the Go appservicefragments.ServiceFragment + its
 * content address AND the wall oracle — the per-service row the DP18 app-service section
 * renders. `writes_truth` is ALWAYS false (an optional app-service of the BUILT app never
 * writes AIDOS truth) and `capabilities` is a below-the-line set (git/tickets/auth of the
 * emitted app), the data behind the « auth de l'app ≠ auth AIDOS » indicator (the wall §2).
 */
export interface AppServiceFragmentView extends ServiceFragmentView {
	writes_truth: boolean;
	capabilities: string[];
}

/** AuthGrantView is one operation→min-role row of the emitted app's runtime AuthorityGraph. */
export interface AuthGrantView {
	operation: string;
	min_role: string;
}

/** AuthDecisionView is one verbatim runtime-authz verdict (role × operation → allowed). */
export interface AuthDecisionView {
	role: string;
	operation: string;
	allowed: boolean;
	required: string;
}

/**
 * AuthBindingView is the twin of the Go appservicefragments.AppAuthBinding — the auth-cabling
 * projection that CABLES the emitted Better-Auth service onto the S80 `app-auth` macro
 * (subsystem_expansion_id, byte-identical via Expand), grafts the S76 UNIQUE owner-scoping
 * expansion (owner_scoping_expansion_id, never duplicated), and maps the operation→min-role
 * grants onto the EMITTED APP'S runtime AuthorityGraph (authority_graph_scope =
 * "emitted-app-runtime", NEVER the AIDOS approvers). `demo` carries two verbatim verdicts
 * proving the runtime gate REFUSES an insufficient role + ALLOWS a sufficient one. It WRITES
 * NO AIDOS truth (writes_truth + wrote_kernel always false, the wall §2).
 */
export interface AuthBindingView {
	project_id: string;
	macro: string;
	service_key: string;
	subsystem_expansion_id: string;
	owner_scoping_expansion_id: string;
	roles: string[];
	grants: AuthGrantView[];
	authority_graph_scope: string;
	base_url_var: string;
	secret_var: string;
	binding_id: string;
	wrote_kernel: boolean;
	writes_truth: boolean;
	demo: AuthDecisionView[];
}

/**
 * AppServiceSubstrateView is the full DP18 APP-SERVICE-substrate emission for one
 * (project, env) — the THREE optional app-service fragments (Forgejo git + Plane tickets +
 * Better-Auth core/auth), the auth-cabling binding (S80 × S76), the closed palette key set,
 * and the CAPITAL indicator `auth_app_not_aidos` (the emitted app's auth maps the RUNTIME
 * AuthorityGraph, never the AIDOS approvers — separation auth-app ≠ auth-AIDOS, the wall §2).
 * The app-service section renders this single source.
 */
export interface AppServiceSubstrateView {
	ok: boolean;
	project_id: string;
	env: Environment;
	app_services: AppServiceFragmentView[];
	binding: AuthBindingView | null;
	keys: string[];
	/** auth_app_not_aidos is the deterministic indicator: the binding maps the EMITTED-APP
	 * runtime scope (never the AIDOS approvers) AND nothing writes AIDOS truth (Go oracle). */
	auth_app_not_aidos: boolean;
	/** error carries any execution-level failure (the Go cmd refused / crashed). */
	error?: string;
}

interface RawAppsvcOutput {
	project_id: string;
	env: string;
	app_services?: AppServiceFragmentView[];
	binding?: AuthBindingView | null;
	keys?: string[];
	auth_app_not_aidos?: boolean;
}

/**
 * emitFragments — the /substrate gesture (ui-completeness, CLAUDE.md §7): run the
 * AUTHORITATIVE Go emitter (cmd/aidosdatafragments) for the active project and the
 * SELECTED environment, and surface the fragments + the DP06 verdict.
 *
 * DETERMINISM-FIRST (§6/§8): the Go is authoritative (never a forked TS twin); the
 * env is VALIDATED against the closed set before it ever reaches the process (no
 * injection — `env` is one of five literals or the call is refused). THE WALL (§2):
 * this is a below-the-line projection — it reads the closed palette and renders the
 * fragments; it WRITES NO truth (no kernel/mirrors/fitness, no gen/ file). The
 * doltgres-in-prod refusal is the EXISTING DP06 rule, never re-coined here.
 */
export async function emitFragments(
	projectId: string | null,
	env: string,
): Promise<SubstrateView> {
	// Fail-closed env validation BEFORE the process — env is one of five literals.
	const safeEnv: Environment = isKnownEnvironment(env) ? env : "dev";
	// A project is always isolated; an absent active project uses a stable seed so
	// the screen still demonstrates the fragments (the volume name carries the id).
	const project = projectId?.trim() ? projectId.trim() : "__demo__";

	try {
		const go = resolveGo();
		const { stdout } = await execFileP(
			go.bin,
			["run", "./cmd/aidosdatafragments", "-project", project, "-env", safeEnv],
			{
				cwd: `${APP_REPO}/back`,
				timeout: 120_000,
				maxBuffer: 8 * 1024 * 1024,
				env: { ...process.env, GOTOOLCHAIN: go.toolchain },
			},
		);
		const raw = JSON.parse(stdout) as RawOutput;
		return {
			ok: true,
			project_id: raw.project_id,
			env: safeEnv,
			full_ok: raw.full_ok,
			full: raw.full ?? [],
			refusal: raw.refusal ?? null,
			core: raw.core ?? [],
			keys: raw.keys ?? [],
		};
	} catch (e) {
		return {
			ok: false,
			project_id: project,
			env: safeEnv,
			full_ok: false,
			full: [],
			refusal: null,
			core: [],
			keys: [],
			error: e instanceof Error ? e.message : String(e),
		};
	}
}

/**
 * emitAsyncFragments — the DP16 /substrate ASYNC gesture (ui-completeness, CLAUDE.md §7):
 * run the AUTHORITATIVE Go emitter (cmd/aidosdatafragments -async, the twin of the data
 * door — never a forked TS palette) for the active project + the SELECTED environment, and
 * surface the TWO async fragments (Windmill workflow engine, NATS bus) plus the demo
 * dispatch trace (write-effect → ack) of the canonical scheduled operation realised at its
 * echeance on an INJECTED clock — no real job, no real clock.
 *
 * DETERMINISM-FIRST (§6/§8): the Go is authoritative; the env is VALIDATED against the
 * closed set before it reaches the process. THE WALL (§2): a below-the-line projection —
 * it WRITES NO truth (no kernel/mirrors/fitness, no gen/ file); Windmill is the slot's
 * engine, Temporal is REFUSED (the Go asserts it). Same (project, env) ⇒ same fragments.
 */
export async function emitAsyncFragments(
	projectId: string | null,
	env: string,
): Promise<AsyncSubstrateView> {
	const safeEnv: Environment = isKnownEnvironment(env) ? env : "dev";
	const project = projectId?.trim() ? projectId.trim() : "__demo__";

	try {
		const go = resolveGo();
		const { stdout } = await execFileP(
			go.bin,
			[
				"run",
				"./cmd/aidosdatafragments",
				"-project",
				project,
				"-env",
				safeEnv,
				"-async",
			],
			{
				cwd: `${APP_REPO}/back`,
				timeout: 120_000,
				maxBuffer: 8 * 1024 * 1024,
				env: { ...process.env, GOTOOLCHAIN: go.toolchain },
			},
		);
		const raw = JSON.parse(stdout) as RawAsyncOutput;
		return {
			ok: true,
			project_id: raw.project_id,
			env: safeEnv,
			async: raw.async ?? [],
			keys: raw.keys ?? [],
			demo: raw.demo ?? [],
		};
	} catch (e) {
		return {
			ok: false,
			project_id: project,
			env: safeEnv,
			async: [],
			keys: [],
			demo: [],
			error: e instanceof Error ? e.message : String(e),
		};
	}
}

/**
 * emitObservabilityFragments — the DP17 /substrate OBSERVABILITY gesture (ui-completeness,
 * CLAUDE.md §7): run the AUTHORITATIVE Go emitter (cmd/aidosdatafragments -observability,
 * the third twin of the data/async doors — never a forked TS palette) for the active
 * project + the SELECTED environment, and surface the THREE observability fragments (OTel
 * collector + SigNoz + GlitchTip, all profile observability), the emitted TS instrumentation
 * (@opentelemetry/* → SigNoz, errors → GlitchTip, ADR 0040), and the CAPITAL indicator
 * `obs_no_truth`.
 *
 * DETERMINISM-FIRST (§6/§8): the Go is authoritative; the env is VALIDATED against the
 * closed set before it reaches the process. THE WALL (§2): a below-the-line projection —
 * it WRITES NO truth (no kernel/mirrors/fitness, no gen/ file); exploitation observability
 * is NOT a Kernel sensor (the RealityMirror E12 is the only on-ramp). Same (project, env) ⇒
 * byte-identical fragments + instrumentation.
 */
export async function emitObservabilityFragments(
	projectId: string | null,
	env: string,
): Promise<ObservabilitySubstrateView> {
	const safeEnv: Environment = isKnownEnvironment(env) ? env : "dev";
	const project = projectId?.trim() ? projectId.trim() : "__demo__";

	try {
		const go = resolveGo();
		const { stdout } = await execFileP(
			go.bin,
			[
				"run",
				"./cmd/aidosdatafragments",
				"-project",
				project,
				"-env",
				safeEnv,
				"-observability",
			],
			{
				cwd: `${APP_REPO}/back`,
				timeout: 120_000,
				maxBuffer: 8 * 1024 * 1024,
				env: { ...process.env, GOTOOLCHAIN: go.toolchain },
			},
		);
		const raw = JSON.parse(stdout) as RawObsOutput;
		return {
			ok: true,
			project_id: raw.project_id,
			env: safeEnv,
			observability: raw.observability ?? [],
			instrumentation: raw.instrumentation ?? null,
			keys: raw.keys ?? [],
			obs_no_truth: raw.obs_no_truth ?? false,
		};
	} catch (e) {
		return {
			ok: false,
			project_id: project,
			env: safeEnv,
			observability: [],
			instrumentation: null,
			keys: [],
			obs_no_truth: false,
			error: e instanceof Error ? e.message : String(e),
		};
	}
}

/**
 * emitAppServiceFragments — the DP18 /substrate APP-SERVICE gesture (ui-completeness,
 * CLAUDE.md §7): run the AUTHORITATIVE Go emitter (cmd/aidosdatafragments -appsvc, the fourth
 * twin of the data/async/observability doors — never a forked TS palette) for the active
 * project + the SELECTED environment, and surface the THREE optional app-service fragments
 * (Forgejo git + Plane tickets + Better-Auth core/auth), the auth-cabling binding (S80 app-auth
 * macro cabled via the S76 UNIQUE Expand), and the CAPITAL indicator `auth_app_not_aidos`.
 *
 * DETERMINISM-FIRST (§6/§8): the Go is authoritative; the env is VALIDATED against the closed
 * set before it reaches the process. THE WALL (§2): a below-the-line projection — it WRITES NO
 * truth (no kernel/mirrors/fitness, no gen/ file); the emitted app's auth maps the EMITTED
 * APP'S runtime AuthorityGraph, NEVER the AIDOS approvers (auth-app ≠ auth-AIDOS). The cabling
 * reuses S80/S76 (never duplicated). Same (project, env) ⇒ byte-identical fragments + binding.
 */
export async function emitAppServiceFragments(
	projectId: string | null,
	env: string,
): Promise<AppServiceSubstrateView> {
	const safeEnv: Environment = isKnownEnvironment(env) ? env : "dev";
	const project = projectId?.trim() ? projectId.trim() : "__demo__";

	try {
		const go = resolveGo();
		const { stdout } = await execFileP(
			go.bin,
			[
				"run",
				"./cmd/aidosdatafragments",
				"-project",
				project,
				"-env",
				safeEnv,
				"-appsvc",
			],
			{
				cwd: `${APP_REPO}/back`,
				timeout: 120_000,
				maxBuffer: 8 * 1024 * 1024,
				env: { ...process.env, GOTOOLCHAIN: go.toolchain },
			},
		);
		const raw = JSON.parse(stdout) as RawAppsvcOutput;
		return {
			ok: true,
			project_id: raw.project_id,
			env: safeEnv,
			app_services: raw.app_services ?? [],
			binding: raw.binding ?? null,
			keys: raw.keys ?? [],
			auth_app_not_aidos: raw.auth_app_not_aidos ?? false,
		};
	} catch (e) {
		return {
			ok: false,
			project_id: project,
			env: safeEnv,
			app_services: [],
			binding: null,
			keys: [],
			auth_app_not_aidos: false,
			error: e instanceof Error ? e.message : String(e),
		};
	}
}
