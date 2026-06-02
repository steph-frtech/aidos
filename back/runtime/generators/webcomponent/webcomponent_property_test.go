package webcomponent_test

// Property mirror (∀, rapid, below the line) — the web-projection emitter invariants.
//
//	mirrors schema · reflects: runtime.generators.webcomponent.Emit · test_kind: property
//	· cert_language: rapid/go · authority: below · liveness: live
//
// ∀ over generated control labels / views / invoke refs (the AST-pinned fields, never
// invented): Emit is deterministic; source_hash == Hash(Canonicalize(c.body ⊕ a.body));
// bytes always start with the protected header carrying the source hash; an orphan
// trigger/bind ⇒ a BlockReason (never a panic, never an invented bind).

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/runtime/generators/webcomponent"
	"pgregory.net/rapid"
)

// genBoundPair builds a well-formed control bound to its action, varying only the
// AST-pinned scalar fields (view, label, invoke) — never inventing structure.
func genBoundPair(t *rapid.T) (control.Control, action.Action) {
	c := control.CheckoutButton()
	a := action.CheckoutSubmit()
	c.View = rapid.StringMatching(`[a-z][a-z0-9]{0,8}`).Draw(t, "view")
	c.Label = rapid.StringMatching(`[a-z][a-z.]{0,12}`).Draw(t, "label")
	a.Invoke = rapid.StringMatching(`[A-Za-z][A-Za-z0-9@.]{0,16}`).Draw(t, "invoke")
	return c, a
}

func TestPropDeterminism(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		c, a := genBoundPair(t)
		a1, br1 := webcomponent.Emit(c, a, webcomponent.TargetTSNext)
		a2, br2 := webcomponent.Emit(c, a, webcomponent.TargetTSNext)
		if br1 != nil || br2 != nil {
			t.Fatalf("unexpected BlockReason: %+v / %+v", br1, br2)
		}
		if string(a1.Bytes) != string(a2.Bytes) {
			t.Fatalf("non-deterministic emit")
		}
	})
}

func TestPropSourceHashMatchesCombinedBody(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		c, a := genBoundPair(t)
		art, br := webcomponent.Emit(c, a, webcomponent.TargetTSNext)
		if br != nil {
			t.Fatalf("unexpected BlockReason: %+v", br)
		}
		want, brh := webcomponent.SourceHash(c, a)
		if brh != nil {
			t.Fatalf("SourceHash BlockReason: %+v", brh)
		}
		if art.SourceHash != want {
			t.Fatalf("source_hash = %q, want %q", art.SourceHash, want)
		}
	})
}

func TestPropProtectedHeader(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		c, a := genBoundPair(t)
		art, br := webcomponent.Emit(c, a, webcomponent.TargetTSNext)
		if br != nil {
			t.Fatalf("unexpected BlockReason: %+v", br)
		}
		header := "// " + webcomponent.ProtectedMarker + ". source: " + art.SourceHash
		if !strings.HasPrefix(string(art.Bytes), header) {
			t.Fatalf("bytes must start with the protected header carrying the source hash")
		}
	})
}

func TestPropOrphanTriggerBlocks(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		c, a := genBoundPair(t)
		// Break the bind: the control triggers a name the action does not carry.
		c.Triggers = rapid.StringMatching(`x[a-z]{1,6}`).Draw(t, "badTrigger")
		_, br := webcomponent.Emit(c, a, webcomponent.TargetTSNext)
		if br == nil {
			t.Fatalf("an orphan trigger must yield a BlockReason, never a silent emit")
		}
		if len(br.HowToFix) == 0 {
			t.Fatalf("BlockReason must carry a non-empty how_to_fix")
		}
	})
}
