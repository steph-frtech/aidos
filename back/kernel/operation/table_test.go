package operation

// Means-tests (test-as-means, below the line) for the table-driven dispatch and
// the State bag — NOT truth-tests. They pin the interpreter's internal guarantees:
// the AST step table's explicit `default → unknown step kind`, and the $-rooted
// selector / Bind semantics the verbs rely on. These are the agent's inner tests
// toward the human red fixture, never a new operation invariant graded by itself.

import (
	"errors"
	"testing"
)

// unknownStep is an out-of-grammar Step kind (a corrupt/unrecognised verb) used to
// prove the table's explicit default fires — a typed failure, never a silent skip.
type unknownStep struct{}

func (unknownStep) Kind() StepKind { return StepKind("frobnicate") }
func (unknownStep) isStep()        {}

func TestDispatchUnknownStepKindIsTypedError(t *testing.T) {
	_, err := dispatch(unknownStep{})
	if !errors.Is(err, ErrUnknownStepKind) {
		t.Fatalf("dispatch(unknownStep) err = %v, want ErrUnknownStepKind", err)
	}
}

func TestInterpretUnknownStepKindShortCircuits(t *testing.T) {
	op := Operation{
		Name:  "broken",
		Steps: []Step{unknownStep{}},
	}
	events, _, err := Interpret(op, NewState(nil, nil), nil)
	if !errors.Is(err, ErrUnknownStepKind) {
		t.Fatalf("Interpret with unknown step err = %v, want ErrUnknownStepKind", err)
	}
	if len(events) != 0 {
		t.Fatalf("events = %v, want [] on an unknown step kind", events)
	}
}

func TestStepKindsClosedSet(t *testing.T) {
	got := StepKinds()
	want := []StepKind{KindValidate, KindAuthorize, KindRead, KindMutate, KindBranch, KindReturn}
	if len(got) != len(want) {
		t.Fatalf("StepKinds() = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("StepKinds()[%d] = %q, want %q", i, got[i], want[i])
		}
	}
	if !IsStepKind("validate") || IsStepKind("frobnicate") {
		t.Fatalf("IsStepKind closed-set check failed")
	}
}

func TestStateResolveAndBind(t *testing.T) {
	s := NewState(map[string]any{"cartId": "c1"}, map[string]any{"user": map[string]any{"id": "u1"}})

	// $.input.cartId resolves.
	if v, err := s.Resolve("$.input.cartId"); err != nil || v != "c1" {
		t.Fatalf("Resolve($.input.cartId) = %v, %v; want c1", v, err)
	}
	// $.auth.user.id resolves through nesting.
	if v, err := s.Resolve("$.auth.user.id"); err != nil || v != "u1" {
		t.Fatalf("Resolve($.auth.user.id) = %v, %v; want u1", v, err)
	}
	// .length on a collection.
	if err := s.Bind("$.cart", map[string]any{"items": []any{1, 2, 3}}); err != nil {
		t.Fatalf("Bind: %v", err)
	}
	if v, err := s.Resolve("$.cart.items.length"); err != nil || v != float64(3) {
		t.Fatalf("Resolve($.cart.items.length) = %v, %v; want 3", v, err)
	}
	// a missing segment is a typed "not found", never a panic.
	if _, err := s.Resolve("$.cart.missing"); err == nil {
		t.Fatalf("Resolve of a missing slot should error")
	}
	// a non-$-rooted selector is rejected.
	if _, err := s.Resolve("cart.id"); err == nil {
		t.Fatalf("Resolve of a non-$-rooted path should error")
	}
	if err := s.Bind("cart", 1); err == nil {
		t.Fatalf("Bind of a non-$-rooted path should error")
	}
}

func TestReturnOnUnboundSlotIsTypedError(t *testing.T) {
	// An operation that returns a slot it never produced is a typed failure, never
	// a silent empty result.
	op := Operation{
		Name:  "danglingReturn",
		Steps: []Step{ReturnStep{Ref: "$.order"}},
	}
	_, _, err := Interpret(op, NewState(nil, nil), nil)
	if err == nil {
		t.Fatalf("return on an unbound slot should error")
	}
}
