// Package interpretsvc is the SIDECAR INTERPRETER service logic — the runnable backend
// the emitted Hono server (honoemit.EmitServer) routes every operation to. The emitted
// handler does `const result = await deps.interpret(opName, input)`; THIS package is what
// that `interpret` port resolves to (ADR 0040 Déc.7: the operation-interpreter callback is
// the Go sidecar). It is the clé de voûte of "déployer l'app émise depuis les specs".
//
// WHAT THE SIDECAR DOES, per request `interpret(operation, input)`:
//
//	(a) look the named Operation up in the Registry (the project's Kernel cut, read-only);
//	(b) build the operation State ($.input = the command payload, $.auth = the caller);
//	(c) call operation.Interpret(op, state, deps) — REUSED VERBATIM, re-implementing NO
//	    rule (the wall, §2; determinism-first, §6/§8): the Kernel interpreter is the source;
//	(d) the four side-effecting verbs (validate/authorize/read/mutate) reach the world ONLY
//	    through the injected Deps seams — in production those are the pgx-backed seams over
//	    the EMITTED schema (dbdeps.go); in the mirror they are in-memory seams;
//	(e) return the operation Result as JSON + the ordered events it emitted.
//
// THE HONEST "MARCHE DE PLUS" (CLAUDE.md §8 honesty). operation.Interpret does NOT hand back
// DB writes: it is pure and threads its effects THROUGH the Mutator seam (deps.Mutate). So the
// State↔DB bridge lives ENTIRELY in the seams (the Reader loads a row into a slot, the Mutator
// applies a create/clear to a table) — Interpret itself never touches Postgres. That is by
// design (the seam contract, operation/deps.go), not a gap: the sidecar's job is exactly to
// SUPPLY those seams over the emitted schema, never to reach inside Interpret. The remaining
// depth (a real Validator over the entity schema, a real Authorizer over the Policy ∀ evaluator)
// is documented as OpenQuestions, not faked (see README + the report). Expr `sum` for a computed
// `total` IS now wired (OQ-SIDECAR-expr CLOSED): the interpreter evaluates the anchor's `total`
// Expr through the REUSED kernel Expr engine before the Mutator runs, so createOrder persists a
// real Σ over the cart's item prices. The sidecar is runnable today over the createOrder anchor.
//
// THE WALL (CLAUDE.md §2). The sidecar EXECUTES operations — a runtime effect BELOW the line.
// It writes NO Kernel truth: it never touches kernel/mirrors/fitness; the Operation it runs is
// a SOURCE row it only READS. Its DB writes land in the EMITTED app schema (the app's own
// tables), never in a truth schema. Anti-overwrite §9: it appends rows, it rewrites no AST.
//
// DETERMINISM-FIRST. Given the same Operation, the same input, the same starting DB State and
// the same (pure) seams, Interpret yields the same (events, result) — the reproducibility
// property mirror (interpretsvc_property_test.go) pins it. The sidecar adds no clock and no RNG
// of its own to that walk; any non-determinism (a generated id, a clock) lives in the seam, not
// in the interpreter, and is the seam's declared concern.
package interpretsvc

import (
	"errors"
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/operation"
)

// ErrUnknownOperation is returned when interpret is asked for an operation name the Registry
// does not pin. It is a typed FAILURE (a 404-shaped honest refusal), never a silent empty run —
// the sidecar invents no operation the Kernel cut does not carry.
var ErrUnknownOperation = errors.New("interpretsvc: unknown operation")

// Registry is the project's Kernel cut as the sidecar sees it: a name → Operation map (read-only).
// In production it is loaded from the project's kernel.operation rows (the same ASTs honoemit
// wired into routes); in the mirror it is seeded with the createOrder anchor. The sidecar only
// READS it — it is a projection of SOURCE truth, never authored here (the wall).
type Registry struct {
	ops map[string]operation.Operation
}

// NewRegistry builds a Registry from a slice of operations, keyed by Name. A duplicate name is a
// typed error (the Kernel cut must be unambiguous) — never a silent last-wins overwrite.
func NewRegistry(ops []operation.Operation) (*Registry, error) {
	m := make(map[string]operation.Operation, len(ops))
	for _, op := range ops {
		if op.Name == "" {
			return nil, fmt.Errorf("interpretsvc: operation pins no name")
		}
		if _, dup := m[op.Name]; dup {
			return nil, fmt.Errorf("interpretsvc: duplicate operation %q in the cut", op.Name)
		}
		m[op.Name] = op
	}
	return &Registry{ops: m}, nil
}

// Lookup returns the Operation pinned under name (read-only) and whether it exists.
func (r *Registry) Lookup(name string) (operation.Operation, bool) {
	op, ok := r.ops[name]
	return op, ok
}

// Names returns the operation names in the cut (for /healthz diagnostics / the route inventory),
// in no particular order — a caller that needs determinism sorts.
func (r *Registry) Names() []string {
	out := make([]string, 0, len(r.ops))
	for name := range r.ops {
		out = append(out, name)
	}
	return out
}

// Outcome is the sidecar's per-request result: the operation Result (the returned ref, surfaced
// as a map) and the ORDERED events the walk emitted. It is what the HTTP layer marshals to JSON
// and the Hono handler returns to the caller.
type Outcome struct {
	// Operation echoes the operation name that ran (for the trace / the panel).
	Operation string `json:"operation"`
	// Result is the operation's return ref (e.g. the created $.order), surfaced as a map. It is
	// nil for an operation with no return verb.
	Result map[string]any `json:"result"`
	// Events is the ordered event list the walk emitted (e.g. [OrderCreated, CartCleared]). The
	// order mirrors the step order — deterministic.
	Events []string `json:"events"`
}

// Interpret is the sidecar's core gesture: run the named operation over the given input through
// the supplied Deps seams, REUSING operation.Interpret verbatim. It re-implements NO rule — the
// dispatch, the short-circuit, the event order all live in the Kernel interpreter; this function
// only (a) resolves the op from the cut, (b) builds the State, (c) calls Interpret, (d) shapes the
// Outcome. An unknown op is ErrUnknownOperation; an authorize DENY / a seam error propagates as
// the interpreter's own typed error (the caller maps it to an HTTP status).
//
// input is the command payload ($.input); auth is the caller identity ($.auth). Both are plain
// maps decoded from the request — the sidecar threads them in, it invents no field.
func Interpret(reg *Registry, opName string, input, auth map[string]any, deps operation.Deps) (Outcome, error) {
	op, ok := reg.Lookup(opName)
	if !ok {
		return Outcome{}, fmt.Errorf("%w: %q", ErrUnknownOperation, opName)
	}

	state := operation.NewState(input, auth)
	events, result, err := operation.Interpret(op, state, deps)
	if err != nil {
		// Propagate the interpreter's typed error verbatim (authorize DENY, a seam failure, an
		// unknown step kind). The HTTP layer maps it to a status; the sidecar adds no opinion.
		return Outcome{}, err
	}

	return Outcome{
		Operation: opName,
		Result:    result.Ref,
		Events:    events,
	}, nil
}
