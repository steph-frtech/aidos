// emittedtarget.go — EL00: the DECLARED target of the EMITTED app (ADR 0040), as a single
// Go-source truth. EL00 is ADR-only — no package logic, just the engraving of the target the
// BesoinGraph elicits against and the app-builder emits toward — exactly as FN02/ADR 0036
// engraved the functional mandate. This file IS that engraving in code form, so the parity
// test (emittedtarget_parity_test.go) can pin it ≡ the arch-fitness.json config.
//
// THE FRONTIER constructrice ≠ construite (ADR 0040 Décision 1/2):
//   - La CONSTRUCTRICE — AIDOS itself: Go (Kernel/Runtime/Archive + the Operation-DSL
//     interpreter) + the Next Workbench + the Postgres truth-store. A governable OS, under
//     the wall. NEVER rewritten in TS; it NEVER emits Go for the user app.
//   - La CONSTRUITE — the app AIDOS emits for the user (the gen/ tree): Hono (front+back),
//     pure-functional TypeScript, with its OWN MCP + Skills; datastore = Postgres dialect
//     (ADR 0006 UNCHANGED) via a TS client; Operation-DSL executed by a CALLBACK to a Go
//     interpreter service (ADR 0040 Décision 7 — never a TS re-emission of a governed truth).
//
// DETERMINISM-FIRST + THE WALL (CLAUDE.md §2/§6/§8). EL00 writes NO truth: it records a
// decision (an ADR + provenance), above-the-line. The emitted app stays governed by
// idée → miroir → /goal; the Hono/TS pivot creates NO truth-write door. The emitted code
// stays a DETERMINISTIC emission (same Kernel → byte-identical bundle, "compile" = tsc); FN02
// purity IS determinism applied to the output, now on TS. The three emitted invariants are
// LANGUAGE-NEUTRAL: pivoting Go→Hono/TS adds none and forks none (Décision 3) — this file
// carries EmittedInvariantCodes() verbatim, no second list. Widening/softening the frontier
// is a TRUTH change (idée → miroir → /goal), never a silent edit — pinned by the parity test.
package agentloop

// Constructrice is the declared, frozen description of AIDOS itself — the governable OS that
// builds apps. It stays Go and is never rewritten in TS (ADR 0040 Décision 1/B).
type Constructrice struct {
	// Language of AIDOS the constructrice — stays "go" (Kernel/Runtime/Archive + interpreter).
	Language string `json:"language"`
	// RewrittenInTS — AIDOS is NEVER rewritten in TypeScript (ADR 0040 Décision 1, Option B
	// rejected). Always false.
	RewrittenInTS bool `json:"rewritten_in_ts"`
	// EmitsGoForUserApp — AIDOS NEVER emits Go for the user app (the frontier). Always false.
	EmitsGoForUserApp bool `json:"emits_go_for_user_app"`
}

// Construite is the declared, frozen target of the EMITTED user app (ADR 0040 Décision 1–7):
// Hono front+back, pure-functional TypeScript, own MCP+Skills, Postgres-dialect datastore via
// a TS client, Operation-DSL via a Go interpreter-service callback.
type Construite struct {
	// Backend / Frontend framework of the emitted app — both Hono (ADR 0040 Décision 1).
	Backend  string `json:"backend"`
	Frontend string `json:"frontend"`
	// Language — pure-functional TypeScript (ADR 0040 Décision 1/3).
	Language string `json:"language"`
	// DatastoreDialect — stays "postgres" (ADR 0006 UNCHANGED; only the access driver moves
	// from pgx to a TS client — ADR 0040 Décision 2).
	DatastoreDialect string `json:"datastore_dialect"`
	// OwnMCP / OwnSkills — the emitted app gets its OWN MCP + Skills (ADR 0040 Décision 4).
	OwnMCP    bool `json:"own_mcp"`
	OwnSkills bool `json:"own_skills"`
	// OperationInterpreter — how the emitted app runs the Operation-DSL. TRENCHED (ADR 0040
	// Décision 7 / OQ-0040-interpréteur) = "go-service-callback": the interpreter stays Go,
	// governable, non-duplicated, exposed as a service the Hono/TS handlers call via a typed
	// client. NEVER a TS re-emission of a governed truth.
	OperationInterpreter string `json:"operation_interpreter"`
}

// EmittedTarget is the single DECLARED truth of EL00: the constructrice≠construite frontier,
// the FN02 invariants applied to the emitted (Hono/TS) code, and the above-the-wall posture.
// The arch-fitness.json `emitted_target` block is the SAME record (parity test pins it).
type EmittedTarget struct {
	// ADR that engraves this target — "0040".
	ADR string `json:"adr"`
	// Constructrice / Construite — the two sides of the trenched frontier.
	Constructrice Constructrice `json:"constructrice"`
	Construite    Construite    `json:"construite"`
	// FunctionalInvariants — the FN02/ADR 0036 emitted invariants, LANGUAGE-NEUTRAL: the exact
	// list EmittedInvariantCodes() returns (no fork on the Go→TS pivot, ADR 0040 Décision 3).
	FunctionalInvariants []string `json:"functional_invariants"`
	// WritesTruth — EL00 is ADR-only, above-the-wall: it writes NO truth (CLAUDE.md §2). false.
	WritesTruth bool `json:"writes_truth"`
}

// EmittedTargetEL00 returns the declared EL00 target — a pure value, built and returned by
// value (it obeys the very EMITTED_NO_GLOBAL_MUTABLE invariant it carries). It is the single
// source the parity test compares against arch-fitness.json's `emitted_target` block.
func EmittedTargetEL00() EmittedTarget {
	invariants := EmittedInvariantCodes()
	names := make([]string, len(invariants))
	for i, c := range invariants {
		names[i] = string(c)
	}
	return EmittedTarget{
		ADR: "0040",
		Constructrice: Constructrice{
			Language:          "go",
			RewrittenInTS:     false,
			EmitsGoForUserApp: false,
		},
		Construite: Construite{
			Backend:              "hono",
			Frontend:             "hono",
			Language:             "typescript",
			DatastoreDialect:     "postgres",
			OwnMCP:               true,
			OwnSkills:            true,
			OperationInterpreter: "go-service-callback",
		},
		FunctionalInvariants: names,
		WritesTruth:          false,
	}
}
