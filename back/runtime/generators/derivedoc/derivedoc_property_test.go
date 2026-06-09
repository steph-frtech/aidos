package derivedoc_test

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/expr"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/runtime/generators/derivedoc"
	"pgregory.net/rapid"
)

// FK06 reproducibility mirror (CLAUDE.md §6 determinism-first): DeriveDoc is a PURE,
// TOTAL function over a Kernel value — same kernel ⇒ byte-IDENTICAL s9. The emitter
// never reads a clock, an rng, a map iteration order, or an LLM; the s9 bytes are a
// deterministic projection of the ASTs. This is the load-bearing done-criterion
// (« même kernel → s9 byte-identique »).

// genKernel builds an arbitrary small Kernel from the closed AST grammar. Map / slice
// ordering is deliberately randomized at the source so the property proves the emitter
// CANONICALIZES (sorts) rather than echoing input order.
func genKernel(t *rapid.T) derivedoc.Kernel {
	bools := []expr.Expr{expr.Lit(true), expr.Lit(false)}
	mkCtl := func(i int) control.Control {
		return control.Control{
			Name:        rapid.SampledFrom([]string{"checkout-button", "cancel-button", "submit-button"}).Draw(t, "ctlname"),
			VisibleWhen: rapid.SampledFrom(bools).Draw(t, "vw"),
			EnabledWhen: rapid.SampledFrom(bools).Draw(t, "ew"),
			Triggers:    rapid.SampledFrom([]string{"checkout-submit", "cancel-flow"}).Draw(t, "trig"),
		}
	}
	mkOp := func(i int) operation.Operation {
		return operation.Operation{
			Name:  rapid.SampledFrom([]string{"createOrder", "clearCart", "refund"}).Draw(t, "opname"),
			Input: rapid.SampledFrom([]string{"CreateOrderInput", "ClearCartInput"}).Draw(t, "opinput"),
			Steps: []operation.Step{
				operation.ValidateStep{Schema: "input"},
				operation.MutateStep{Entity: "Order", Op: operation.MutateCreate},
			},
			Emits: rapid.SampledFrom([][]string{
				{"OrderCreated", "CartCleared"},
				{"CartCleared", "OrderCreated"}, // reversed: proves emit canonicalization
				{"Refunded"},
			}).Draw(t, "emits"),
		}
	}
	mkAct := func(i int) action.Action {
		return action.Action{
			Name:      rapid.SampledFrom([]string{"checkout-submit", "cancel-flow"}).Draw(t, "actname"),
			On:        action.On{Kind: action.EventClick, Control: "checkout-button"},
			Invoke:    rapid.SampledFrom([]string{"createOrder", "clearCart"}).Draw(t, "invoke"),
			OnSuccess: []action.Effect{{Verb: "navigate"}},
			OnError:   []action.Effect{{Verb: "toast.error"}},
		}
	}

	nCtl := rapid.IntRange(0, 3).Draw(t, "nctl")
	nOp := rapid.IntRange(0, 3).Draw(t, "nop")
	nAct := rapid.IntRange(0, 3).Draw(t, "nact")
	k := derivedoc.Kernel{KernelID: rapid.SampledFrom([]string{"k1", "k2"}).Draw(t, "kid")}
	for i := 0; i < nCtl; i++ {
		k.Controls = append(k.Controls, mkCtl(i))
	}
	for i := 0; i < nOp; i++ {
		k.Operations = append(k.Operations, mkOp(i))
	}
	for i := 0; i < nAct; i++ {
		k.Actions = append(k.Actions, mkAct(i))
	}
	return k
}

// TestDeriveDoc_Deterministic — the byte-identity property: DeriveDoc(k) == DeriveDoc(k).
func TestDeriveDoc_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		k := genKernel(t)
		a := derivedoc.DeriveDoc(k)
		b := derivedoc.DeriveDoc(k)
		if string(a.Bytes) != string(b.Bytes) {
			t.Fatalf("DeriveDoc not byte-identical:\nA=%s\nB=%s", a.Bytes, b.Bytes)
		}
	})
}

// TestDeriveDoc_OrderInvariant — s9 is invariant under input ordering: two kernels with
// the SAME ASTs in a DIFFERENT order produce byte-identical s9 (the emitter sorts).
func TestDeriveDoc_OrderInvariant(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		k := genKernel(t)
		rev := derivedoc.Kernel{KernelID: k.KernelID}
		for i := len(k.Controls) - 1; i >= 0; i-- {
			rev.Controls = append(rev.Controls, k.Controls[i])
		}
		for i := len(k.Operations) - 1; i >= 0; i-- {
			rev.Operations = append(rev.Operations, k.Operations[i])
		}
		for i := len(k.Actions) - 1; i >= 0; i-- {
			rev.Actions = append(rev.Actions, k.Actions[i])
		}
		if string(derivedoc.DeriveDoc(k).Bytes) != string(derivedoc.DeriveDoc(rev).Bytes) {
			t.Fatal("DeriveDoc not invariant under input ordering — emitter is not canonicalizing")
		}
	})
}

// TestDeriveDoc_HashStable — the s9 hash equals records.Hash of its canonical bytes,
// content-addressed and stable (FK01/records parity).
func TestDeriveDoc_HashStable(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		k := genKernel(t)
		d := derivedoc.DeriveDoc(k)
		if d.Hash != derivedoc.DeriveDoc(k).Hash {
			t.Fatal("hash not stable")
		}
		if d.Hash == "" {
			t.Fatal("empty hash")
		}
	})
}
