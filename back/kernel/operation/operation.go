// Package operation is the AIDOS Operation DSL interpreter (KRD §24.3, §93): the
// N2 (Workflow) executor. An operation body is an ordered list of typed steps —
// validate / authorize / read / mutate / branch / return — read from its Kernel
// AST; this package walks them deterministically as `state → command → events`.
//
// THE SHAPE (KRD §93). An Operation is {Name, Input, Steps[], Emits[]}:
//   - Input  — the named input schema (e.g. "CreateOrderInput");
//   - Steps  — the ordered verbs the interpreter walks, each a typed Step node;
//   - Emits  — the declared event names the operation may emit (a contract on the
//     event surface; the interpreter's emitted events are a subsequence of Emits).
//
// THE SIX VERBS (KRD §24.3). validate (shape-check the input) · authorize
// (delegate to the Policy DSL — DENY short-circuits the pipeline) · read (load an
// entity into a named state slot) · mutate (create/clear an entity, emitting an
// event) · branch (conditional — supported in the table, exercised only when a
// fixture needs it; no invented semantics) · return (name the result ref).
//
// STATE → COMMAND → EVENTS (the N2 truth form). Interpret threads a State bag
// ($.input, $.auth, named slots like $.cart / $.order) through the steps and
// returns the ORDERED event list plus the return Result. Deterministic: the emit
// order mirrors the step order; same (op, state, deps) ⇒ same (events, result).
//
// THE SEAMS (mocked this step). Side-effecting verbs reach the world ONLY through
// injected deps interfaces (Validator/Authorizer/Reader/Mutator). The package is
// PURE — no DB, no HTTP, no clock, no RNG (CLAUDE.md §6 determinism-first). The
// real Policy ∀ evaluation, the real Expr `sum`, the real sqlc read/write are
// later teeth; here the fixture passes mocks at each seam.
//
// THE WALL (CLAUDE.md §2). The interpreter writes no truth: a mutate is a call on
// the injected Mutator (a projection seam, below the waterline), never a direct
// write to a kernel/mirrors/fitness schema. The operation AST it reads is a SOURCE
// row written only by the aidos CLI through an approved ChangeSet.
//
// REUSE, DON'T REINVENT (ADR 0007). The interpreter is table-driven (a kind →
// evaluator dispatch table, stepTable in table.go), not a switch scattered across
// files — verbs are data. The $-rooted selector semantics match back/kernel/expr
// and back/kernel/policy (one selector language across the DSLs). No new ADR: this
// freezes a new artifact (the Operation interpreter); it shifts no prior contract.
package operation

import "errors"

// ErrAuthorizationDenied is the typed error the authorize verb returns when the
// injected Authorizer denies. It short-circuits the pipeline: no later step runs,
// no event is emitted, no mutate is attempted (the §93 "any DENY blocks" law at
// the operation boundary). Callers test with errors.Is(err, ErrAuthorizationDenied).
var ErrAuthorizationDenied = errors.New("operation: authorization denied")

// ErrUnknownStepKind is the typed error the step table returns for an unrecognised
// verb — a kind with no evaluator. It is a typed FAILURE, never a silent skip:
// the table's explicit default. (A well-formed AST never triggers it; it guards
// against a corrupt/unknown step kind decoded from JSONB.)
var ErrUnknownStepKind = errors.New("operation: unknown step kind")

// MutateOp is the closed set of mutate operations (KRD §93: create, clear).
type MutateOp string

const (
	// MutateCreate creates an entity row (the Order create → OrderCreated).
	MutateCreate MutateOp = "create"
	// MutateClear clears an entity (the Cart clear → CartCleared).
	MutateClear MutateOp = "clear"
)

// Operation is one content-addressed workflow body (KRD §24.3, §93).
// {Name, Input, Steps, Emits}. It is read from the kernel.operation AST; this
// package walks Steps in order.
type Operation struct {
	Name  string
	Input string
	Steps []Step
	Emits []string
}

// Result is the return of an interpreted operation: the resolved return ref (the
// named slot the `return` verb points at, e.g. $.order), surfaced as a map for the
// caller to read (result.Ref["status"], result.Ref["total"]). RefName records
// which slot was returned (for diagnostics / the Workbench trace).
type Result struct {
	RefName string
	Ref     map[string]any
}
