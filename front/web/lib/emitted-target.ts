// emitted-target.ts — EL00: the pure TS twin of back/runtime/agentloop.EmittedTargetEL00().
//
// EL00 (ADR 0040) engraves the TARGET of the EMITTED app: Hono front+back, pure-functional
// TypeScript, its own MCP + Skills, datastore = Postgres dialect via a TS client, Operation-DSL
// via a Go interpreter-service callback. It draws the constructrice≠construite frontier: AIDOS
// stays governable Go (never rewritten in TS, never emits Go for the user app).
//
// This module is the byte-identical TS twin of the Go declared truth, so the Workbench panel can
// run the SAME parity verdict the Go test (config_test / emittedtarget_parity_test) runs — a pure
// function, no clock/rng/IO, no LLM. The wall (CLAUDE.md §2): EL00 writes NO truth; this twin only
// reads/renders the declared target and computes a deterministic parity verdict.

/** AIDOS la constructrice — stays Go, never rewritten in TS (ADR 0040 Décision 1/B). */
export interface Constructrice {
	language: string;
	rewritten_in_ts: boolean;
	emits_go_for_user_app: boolean;
}

/** The emitted user app la construite — Hono/TS target (ADR 0040 Décision 1–7). */
export interface Construite {
	backend: string;
	frontend: string;
	language: string;
	datastore_dialect: string;
	own_mcp: boolean;
	own_skills: boolean;
	operation_interpreter: string;
}

/** The single declared EL00 target — the same shape as the Go EmittedTarget record. */
export interface EmittedTarget {
	adr: string;
	constructrice: Constructrice;
	construite: Construite;
	functional_invariants: string[];
	writes_truth: boolean;
}

/** The FN02/ADR 0036 emitted invariants — LANGUAGE-NEUTRAL, the exact EmittedInvariantCodes()
 *  list (no fork on the Go→Hono/TS pivot, ADR 0040 Décision 3). Frozen, returned by value. */
export const EMITTED_INVARIANTS: readonly string[] = [
	"EMITTED_NO_GLOBAL_MUTABLE",
	"EMITTED_FUNCTION_PURE",
	"EMITTED_CALL_GRAPH_ACYCLIC",
] as const;

/** emittedTargetEL00 — the pure TS twin of the Go EmittedTargetEL00(). Same input (none) → same
 *  output, every call (the determinism-first reproducibility property). */
export function emittedTargetEL00(): EmittedTarget {
	return {
		adr: "0040",
		constructrice: {
			language: "go",
			rewritten_in_ts: false,
			emits_go_for_user_app: false,
		},
		construite: {
			backend: "hono",
			frontend: "hono",
			language: "typescript",
			datastore_dialect: "postgres",
			own_mcp: true,
			own_skills: true,
			operation_interpreter: "go-service-callback",
		},
		functional_invariants: [...EMITTED_INVARIANTS],
		writes_truth: false,
	};
}

/** A single parity check the panel renders. */
export interface ParityCheck {
	label: string;
	declared: string;
	enforced: string;
	ok: boolean;
}

/** The deterministic parity verdict: the declared EL00 target ≡ the enforced config block.
 *  The Workbench feeds it the `emitted_target` block read from arch-fitness.json (the config
 *  FN04/S84 enforces). Same as the Go reflect.DeepEqual parity test, surfaced on screen. */
export interface ParityVerdict {
	checks: ParityCheck[];
	ok: boolean;
}

function check(label: string, declared: string, enforced: string): ParityCheck {
	return { label, declared, enforced, ok: declared === enforced };
}

/** verifyParity — compares the declared target against an enforced config record, field by
 *  field, returning a per-field verdict. Pure: same inputs → same verdict, no LLM. */
export function verifyParity(
	declared: EmittedTarget,
	enforced: EmittedTarget,
): ParityVerdict {
	const checks: ParityCheck[] = [
		check("adr", declared.adr, enforced.adr),
		check(
			"constructrice.language",
			declared.constructrice.language,
			enforced.constructrice.language,
		),
		check(
			"constructrice.rewritten_in_ts",
			String(declared.constructrice.rewritten_in_ts),
			String(enforced.constructrice.rewritten_in_ts),
		),
		check(
			"constructrice.emits_go_for_user_app",
			String(declared.constructrice.emits_go_for_user_app),
			String(enforced.constructrice.emits_go_for_user_app),
		),
		check(
			"construite.backend",
			declared.construite.backend,
			enforced.construite.backend,
		),
		check(
			"construite.frontend",
			declared.construite.frontend,
			enforced.construite.frontend,
		),
		check(
			"construite.language",
			declared.construite.language,
			enforced.construite.language,
		),
		check(
			"construite.datastore_dialect",
			declared.construite.datastore_dialect,
			enforced.construite.datastore_dialect,
		),
		check(
			"construite.own_mcp",
			String(declared.construite.own_mcp),
			String(enforced.construite.own_mcp),
		),
		check(
			"construite.own_skills",
			String(declared.construite.own_skills),
			String(enforced.construite.own_skills),
		),
		check(
			"construite.operation_interpreter",
			declared.construite.operation_interpreter,
			enforced.construite.operation_interpreter,
		),
		check(
			"functional_invariants",
			declared.functional_invariants.join(","),
			enforced.functional_invariants.join(","),
		),
		check(
			"writes_truth",
			String(declared.writes_truth),
			String(enforced.writes_truth),
		),
	];
	return { checks, ok: checks.every((c) => c.ok) };
}
