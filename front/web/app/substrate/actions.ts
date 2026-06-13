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
