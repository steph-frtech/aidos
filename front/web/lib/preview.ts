/**
 * The ephemeral PREVIEW ENVIRONMENT twin — the Workbench /preview source (AIDOS S94).
 *
 * The DECLARED projection of the Go package back/runtime/preview: the deterministic planner
 * that turns the EMITTED SURFACE of a content-addressed STABLE PHASE (the emitted server,
 * front, infra and datastore hashes + the emitted Pulumi program) into a content-addressed
 * PreviewPlan — the per-phase preview URL, the `pulumi up` boot, the deterministic
 * `pulumi destroy` teardown — and judges the done-criterion (the served-app hash equals the
 * emitted-app hash of the phase).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): buildPlan and emittedAppHash are PURE functions of
 * their input — no clock, no rng, no I/O, no LLM. The same emitted surface for the same phase
 * → byte-identical plan (same id, same URL, same boot/teardown). The Go output is the
 * AUTHORITATIVE truth; this twin reproduces the structure for the screen. The reproducibility
 * mirror lib/preview.test.ts (fast-check) pins determinism, phase-keying and the served↔emitted
 * equality. The preview is a PROCESS (Hono Node/Bun/edge, ADR 0040 — never a Go binary).
 *
 * READ-ONLY (the wall): /preview PLANS; it writes no truth.
 */

export interface EmittedSurface {
	project: string;
	serverBundleHash: string;
	frontBundleHash: string;
	infraHash: string;
	datastoreHash?: string;
}

export interface PhaseRef {
	phaseHash: string;
}

export interface PreviewInput {
	phase: PhaseRef;
	surface: EmittedSurface;
	programPath: string;
	programBytes: string;
	domainRoot?: string;
}

export interface PreviewPlan {
	id: string;
	project: string;
	phaseHash: string;
	emittedAppHash: string;
	url: string;
	subdomain: string;
	stackName: string;
	programPath: string;
	boot: string[];
	teardown: string[];
}

export interface BlockReason {
	code: string;
	severity: "blocking";
	explanation: string;
	how_to_fix: string[];
}

export const DEFAULT_DOMAIN_ROOT = "preview.aidos.app";

export function isBlocked<T>(v: T | BlockReason): v is BlockReason {
	return (
		typeof v === "object" && v !== null && "code" in v && "how_to_fix" in v
	);
}

const HOW_TO_FIX = [
	"Provide a content-addressed phase (phase_hash) and a complete emitted surface.",
	"Emit the server (S87), front (S93) and infra/Pulumi program (ADR 0043) for the phase first.",
	"Ensure every emitted component belongs to the same project.",
];

function fail(msg: string): BlockReason {
	return {
		code: "OUT_OF_SCOPE",
		severity: "blocking",
		explanation: `Preview refused: ${msg}`,
		how_to_fix: HOW_TO_FIX,
	};
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

/**
 * emittedAppHash — the SINGLE content address of the whole emitted app of a phase: a
 * canonical, named-key join of the surface's component hashes (server ⊕ front ⊕ infra ⊕
 * datastore), keyed by the phase. PURE + order-free (named keys). Any byte change in any
 * component → a new hash.
 */
export function emittedAppHash(phase: PhaseRef, s: EmittedSurface): string {
	const body = JSON.stringify({
		datastore: s.datastoreHash ?? "",
		front_bundle: s.frontBundleHash,
		infra: s.infraHash,
		phase: phase.phaseHash,
		project: s.project,
		server_bundle: s.serverBundleHash,
	});
	return digest(body);
}

/** The per-phase preview subdomain: "p-" + first 12 alnum chars of the phase hash (DNS-safe,
 * starts with a letter). Deterministic — same phase → same subdomain. */
export function subdomainOf(phaseHash: string): string {
	const h = phaseHash.toLowerCase();
	let short = "";
	for (const ch of h) {
		if (/[a-z0-9]/.test(ch)) short += ch;
		if (short.length >= 12) break;
	}
	if (short === "") short = "000000000000";
	return `p-${short}`;
}

function dir(p: string): string {
	const i = p.lastIndexOf("/");
	return i < 0 ? "." : p.slice(0, i);
}

function validate(input: PreviewInput): BlockReason | null {
	if (!input.phase.phaseHash)
		return fail("no phase (a preview is keyed on a content-addressed phase)");
	if (!input.surface.project) return fail("surface has no project");
	if (!input.surface.serverBundleHash)
		return fail("surface has no server bundle (the app must boot a server)");
	if (!input.surface.frontBundleHash)
		return fail("surface has no front bundle (the app must serve a UI)");
	if (!input.surface.infraHash)
		return fail("surface has no infra program (nothing to `pulumi up`)");
	if (!input.programBytes || !input.programPath)
		return fail("no emitted Pulumi program to boot");
	if (!input.programPath.includes(`gen/${input.surface.project}/`))
		return fail("program project does not match the surface project");
	return null;
}

/** buildPlan — the deterministic, content-addressed PreviewPlan. Same input → byte-identical
 * plan (same id, same URL). Writes nothing (the wall). */
export function buildPlan(input: PreviewInput): PreviewPlan | BlockReason {
	const br = validate(input);
	if (br) return br;

	const appHash = emittedAppHash(input.phase, input.surface);
	const root = input.domainRoot || DEFAULT_DOMAIN_ROOT;
	const sub = subdomainOf(input.phase.phaseHash);
	const url = `https://${sub}.${root}`;
	const stack = `preview-${input.surface.project}-${sub}`;
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
		boot,
		teardown,
	};
}

/** servedMatchesEmitted — the S94 done-criterion: a running preview's served-app hash must
 * EQUAL the plan's emitted-app hash. A pure comparison — code judges, never an agent. */
export function servedMatchesEmitted(
	plan: PreviewPlan,
	servedAppHash: string,
): true | BlockReason {
	if (servedAppHash === plan.emittedAppHash) return true;
	return {
		code: "OUT_OF_SCOPE",
		severity: "blocking",
		explanation: `the preview serves app hash "${servedAppHash}" but the phase emits "${plan.emittedAppHash}" — the preview does not serve this phase`,
		how_to_fix: [
			"Re-emit the phase's surface and rebuild the preview plan (deploy = re-emit, DP26).",
			"Tear the stale preview down (`pulumi destroy`) and `pulumi up` the current program.",
		],
	};
}
