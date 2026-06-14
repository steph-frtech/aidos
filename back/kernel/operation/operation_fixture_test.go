package operation_test

// Fixture mirror (N2: state → command → events), interpreted in Go.
// reflects=kernel.operation/createOrder · test_kind=workflow · cert_language=fixture ·
// liveness=live · authority=below.
//
// Materialized source: tests/kernel/createOrder_op.fixture.md (the human-readable
// fixture, conceptually stored in the `mirrors` schema; persisted to Postgres at
// S06 — bootstrap exception). It is the LIEN PORTEUR: this test loads the
// createOrder/happy + createOrder/authz-denied rows; if the fixture intention
// disappears the test breaks (no silent rot into a monster).
//
// The operation is the KRD §93 createOrder.op, VERBATIM — the agent invents no
// step, event, total formula or status. Side-effecting verbs reach the world only
// through injected mock deps, so the package stays pure (no DB/HTTP/clock).

import (
	"errors"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/operation"
)

// mockDeps is the test double standing in for the four side-effecting seams
// (Validator/Authorizer/Reader/Mutator). It records the order of calls so the
// fixture can assert authorize ran BEFORE any mutate, and that a denied authorize
// never reaches a mutate.
type mockDeps struct {
	authorizeAllow bool     // does the authorizer return ALLOW?
	cart           any      // the value the reader yields for the Cart read
	calls          []string // ordered call log: "validate","authorize","read","mutate"
}

func (m *mockDeps) Validate(schema string, input any) error {
	m.calls = append(m.calls, "validate")
	return nil
}

func (m *mockDeps) Authorize(policy string, state *operation.State) error {
	m.calls = append(m.calls, "authorize")
	if m.authorizeAllow {
		return nil
	}
	return operation.ErrAuthorizationDenied
}

func (m *mockDeps) Read(entity string, where map[string]any, state *operation.State) (any, error) {
	m.calls = append(m.calls, "read")
	return m.cart, nil
}

func (m *mockDeps) Mutate(entity string, op string, data map[string]any, state *operation.State) (any, []string, error) {
	m.calls = append(m.calls, "mutate")
	switch op {
	case "create":
		// The Order create mutate: returns the created order + emits OrderCreated.
		// total arrives ALREADY COMPUTED in the data — the interpreter evaluated the
		// anchor's `total: sum($.cart.items,"price")` Expr through expr.Eval before the
		// Mutator ran (the §96 projection's repo.order.create persists the same row).
		// The mock re-folds NOTHING: it forwards the Σ the Expr engine produced, proving
		// the seam no longer owns the sum (the wall / determinism-first §6/§8).
		return map[string]any{
			"status": data["status"], // the literal "pending" from the AST
			"total":  data["total"],  // the Expr-evaluated sum (10 + 5 = 15)
		}, []string{"OrderCreated"}, nil
	case "clear":
		// The Cart clear mutate: emits CartCleared, no result slot.
		return nil, []string{"CartCleared"}, nil
	default:
		return nil, nil, errors.New("mock: unknown mutate op " + op)
	}
}

func (m *mockDeps) called(name string) bool {
	for _, c := range m.calls {
		if c == name {
			return true
		}
	}
	return false
}

// indexOf returns the index of the first occurrence of name in the call log, or -1.
func (m *mockDeps) indexOf(name string) int {
	for i, c := range m.calls {
		if c == name {
			return i
		}
	}
	return -1
}

// happyState builds the createOrder/happy given state: an authed user u1 owning a
// non-empty cart c1 with two priced items (10 + 5 = 15).
func happyState() *operation.State {
	return operation.NewState(
		map[string]any{"cartId": "c1"}, // $.input
		map[string]any{ // $.auth
			"user": map[string]any{"id": "u1"},
		},
	)
}

// happyCart is what the mock Reader yields for the Cart read.
func happyCart() any {
	return map[string]any{
		"id":     "c1",
		"userId": "u1",
		"items":  []any{map[string]any{"price": float64(10)}, map[string]any{"price": float64(5)}},
	}
}

func TestCreateOrderHappy(t *testing.T) {
	deps := &mockDeps{authorizeAllow: true, cart: happyCart()}
	events, result, err := operation.Interpret(operation.CreateOrder(), happyState(), deps)
	if err != nil {
		t.Fatalf("Interpret: unexpected error %v", err)
	}

	// events == [OrderCreated, CartCleared], ordered, exactly these two.
	wantEvents := []string{"OrderCreated", "CartCleared"}
	if len(events) != len(wantEvents) {
		t.Fatalf("events = %v, want %v", events, wantEvents)
	}
	for i := range wantEvents {
		if events[i] != wantEvents[i] {
			t.Fatalf("events[%d] = %q, want %q (full %v)", i, events[i], wantEvents[i], events)
		}
	}

	// return.status == "pending"
	if got := result.Ref["status"]; got != "pending" {
		t.Fatalf("return.status = %v, want \"pending\"", got)
	}
	// return.total == 15 (= sum of item prices, computed by mutate)
	if got, ok := result.Ref["total"].(float64); !ok || got != 15 {
		t.Fatalf("return.total = %v, want 15", result.Ref["total"])
	}

	// authorize ran BEFORE any mutate (the pipeline order is real).
	ai, mi := deps.indexOf("authorize"), deps.indexOf("mutate")
	if ai < 0 {
		t.Fatalf("authorize was never called")
	}
	if mi < 0 {
		t.Fatalf("mutate was never called")
	}
	if ai > mi {
		t.Fatalf("authorize (idx %d) must run before the first mutate (idx %d); calls=%v", ai, mi, deps.calls)
	}
}

func TestCreateOrderAuthzDenied(t *testing.T) {
	// Empty cart ⇒ the policy would DENY. The mock authorizer returns DENY.
	deniedState := operation.NewState(
		map[string]any{"cartId": "c1"},
		map[string]any{"user": map[string]any{"id": "u1"}},
	)
	deps := &mockDeps{
		authorizeAllow: false,
		cart:           map[string]any{"id": "c1", "userId": "u1", "items": []any{}},
	}

	events, _, err := operation.Interpret(operation.CreateOrder(), deniedState, deps)

	// err is AuthorizationDenied
	if !errors.Is(err, operation.ErrAuthorizationDenied) {
		t.Fatalf("err = %v, want AuthorizationDenied", err)
	}
	// events == []
	if len(events) != 0 {
		t.Fatalf("events = %v, want [] (a denied authorize emits nothing)", events)
	}
	// the Mutator was NEVER called (authorize short-circuits before any mutate)
	if deps.called("mutate") {
		t.Fatalf("mutate was called after an authorize DENY; calls=%v", deps.calls)
	}
}
