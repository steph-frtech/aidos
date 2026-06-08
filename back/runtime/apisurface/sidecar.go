package apisurface

import (
	"errors"

	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// sidecar.go is the Go SIDECAR interpreter boundary (ADR 0040 Déc.7, S90). The emitted
// Hono/TS handler calls this through a JSON callback; AIDOS calls operation.Interpret
// natively. The INTERPRETER-PARITY LAW (S90 done-criterion) is that the two agree: this
// file is operation.Interpret behind the callback, with a DETERMINISTIC, REPRODUCIBLE
// deps double (deny-on-marker authorizer, cart-with-items reader, summing mutator) — no
// LLM, no clock, no RNG. The parity mirror pins SidecarVerdict == operation.Interpret.

// canonicalizeShared wraps the S02 canonicaliser so pact.go's local imports stay minimal.
func canonicalizeShared(b []byte) ([]byte, error) { return records.Canonicalize(b) }

// operationBodyFor resolves an Op (the S90 surface descriptor) to the Kernel operation
// BODY the interpreter walks. For the createOrder anchor it returns the real S10 body;
// for any other operation it synthesises a minimal, well-typed body matching the Op's
// shape — an authorize step iff the Op authorizes, a single create-mutate over its entity,
// returning the created row. It AUTHORS no new business rule (the body is the Op's own
// declared shape projected into the closed step grammar); the wall is respected (no kernel
// write). A read-only Op (VerbGet) gets a read+return body, no mutate.
func operationBodyFor(op Op) operation.Operation {
	if op.Name == "createOrder" {
		return operation.CreateOrder()
	}
	steps := make([]operation.Step, 0, 4)
	steps = append(steps, operation.ValidateStep{Schema: op.Name + "Input"})
	if op.Authorize {
		steps = append(steps, operation.AuthorizeStep{Policy: "can" + op.Name})
	}
	if op.Verb == VerbGet {
		steps = append(steps,
			operation.ReadStep{Entity: op.Entity.Name, Where: map[string]any{}, As: "$." + lower(op.Entity.Name)},
			operation.ReturnStep{Ref: "$." + lower(op.Entity.Name)},
		)
		return operation.Operation{Name: op.Name, Input: op.Name + "Input", Steps: steps, Emits: []string{}}
	}
	steps = append(steps,
		operation.MutateStep{
			Entity: op.Entity.Name,
			Op:     operation.MutateCreate,
			Data:   map[string]any{"input": "$.input"},
			As:     "$." + lower(op.Entity.Name),
		},
		operation.ReturnStep{Ref: "$." + lower(op.Entity.Name)},
	)
	return operation.Operation{Name: op.Name, Input: op.Name + "Input", Steps: steps, Emits: []string{op.Entity.Name + "Created"}}
}

func lower(s string) string {
	if s == "" {
		return s
	}
	return string(s[0]|0x20) + s[1:]
}

// authFromInput projects a caller-auth slot from the input. The interpreter needs $.auth
// for the createOrder mutate ($.auth.user.id); we provide a fixed user so the verdict is
// reproducible. The deny path never depends on auth content — only on the deny marker.
func authFromInput(_ map[string]any) map[string]any {
	return map[string]any{"user": map[string]any{"id": "u1"}}
}

// denyOnMarkerDeps is the DETERMINISTIC, REPRODUCIBLE deps double both the sidecar and the
// native interpreter run through, so they reach the SAME verdict:
//   - Validate — accepts (shape is checked by the entity schema elsewhere);
//   - Authorize — DENIES iff $.input carries the "__deny__" marker (the reproducible policy
//     trigger), ALLOWS otherwise — a pure function of the input, no LLM;
//   - Read — yields a cart with two priced items (so the createOrder body has a cart to sum);
//   - Mutate — for a create returns a pending result, summing $.cart.items prices into total
//     when present (the S10 fixture's mutate seam), no events surfaced to the verdict.
type denyOnMarkerDeps struct{}

func (denyOnMarkerDeps) Validate(string, any) error { return nil }

func (denyOnMarkerDeps) Authorize(_ string, state *operation.State) error {
	if v, err := state.Resolve("$.input.__deny__"); err == nil {
		if b, ok := v.(bool); ok && b {
			return operation.ErrAuthorizationDenied
		}
	}
	return nil
}

func (denyOnMarkerDeps) Read(_ string, _ map[string]any, _ *operation.State) (any, error) {
	return map[string]any{
		"id":     "c1",
		"userId": "u1",
		"items":  []any{map[string]any{"price": float64(10)}, map[string]any{"price": float64(5)}},
	}, nil
}

func (denyOnMarkerDeps) Mutate(_ string, op string, data map[string]any, _ *operation.State) (any, []string, error) {
	if op != string(operation.MutateCreate) {
		return nil, []string{}, nil
	}
	result := map[string]any{"status": "pending"}
	if items, ok := data["items"].([]any); ok {
		total := float64(0)
		for _, it := range items {
			if m, ok := it.(map[string]any); ok {
				if p, ok := m["price"].(float64); ok {
					total += p
				}
			}
		}
		result["total"] = total
	}
	return result, []string{}, nil
}

// ensure errors import is used (the sidecar deny path returns a sentinel via the package).
var _ = errors.Is
