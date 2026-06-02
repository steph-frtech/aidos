package changeset_test

// ChangeSet lifecycle fixture (cert_language: fixture, authority: above).
//
// reflects=changesets.changeset "add-order-discount" · test_kind=fixture · liveness=live.
//
// This is the Go interpreter of tests/archive/changeset_lifecycle.fixture.md (the lien porteur).
// It runs the KRD §98 "add order discount" envelope through state → command → events:
//   A open                 -> Opened,    DRAFT, applied_at == nil
//   B apply (complete)      -> Applied,   APPLIED, applied_at != nil
//   C apply (incomplete)    -> Blocked,   stays DRAFT, INCOMPLETE_CHANGESET + add_mirror_for_spec_delta
//   D edit an APPLIED       -> Blocked,   APPLIED_IS_IMMUTABLE  (THE done case)
//   E revert an APPLIED     -> Reverted,  new DRAFT B (reverts==A, inverse delta), A stays APPLIED
//   F apply the inverse B   -> Applied,   B APPLIED and A stamped REVERTED (not deleted)  (THE done case)
//   G discard a DRAFT       -> Discarded, removed (never status "FAILED")
//
// These rows ARE the done criteria: APPLIED is immutable; a revert is an append-only inverse ChangeSet.

import (
	"encoding/json"
	"testing"
	"time"

	cs "github.com/steph-frtech/aidos/back/archive/changeset"
)

// addOrderDiscountSpec is the §98 Kernel-plane delta.
func addOrderDiscountSpec() *cs.Delta {
	return &cs.Delta{Kind: "add", Target: "Order.discount", Body: json.RawMessage(`{"field":"discount","type":"Money"}`)}
}

// orderDiscountMirror is the §98 Mirror-plane delta (the fixture that proves the spec).
func orderDiscountMirror() *cs.Delta {
	return &cs.Delta{Kind: "add", Target: "Order.discount.fixture", Body: json.RawMessage(`{"fixture":"order-discount"}`)}
}

func TestFixture_A_Open_yields_DRAFT(t *testing.T) {
	c, err := cs.Open("add order discount", "phase-7", addOrderDiscountSpec(), orderDiscountMirror())
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if c.Status != cs.StatusDraft {
		t.Fatalf("row A: status = %q, want DRAFT", c.Status)
	}
	if c.AppliedAt != nil {
		t.Fatalf("row A: applied_at = %v, want nil", c.AppliedAt)
	}
	if c.ID == "" {
		t.Fatal("row A: id is empty, want content hash")
	}
}

func TestFixture_B_Apply_complete_yields_APPLIED(t *testing.T) {
	c, _ := cs.Open("add order discount", "phase-7", addOrderDiscountSpec(), orderDiscountMirror())
	at := time.Date(2026, 5, 31, 12, 0, 0, 0, time.UTC)
	applied, br := cs.Apply(c, at, cs.SpecHasMirror)
	if br != nil {
		t.Fatalf("row B: apply blocked unexpectedly: %v", br)
	}
	if applied.Status != cs.StatusApplied {
		t.Fatalf("row B: status = %q, want APPLIED", applied.Status)
	}
	if applied.AppliedAt == nil || !applied.AppliedAt.Equal(at) {
		t.Fatalf("row B: applied_at = %v, want %v", applied.AppliedAt, at)
	}
	if applied.ID != c.ID {
		t.Fatalf("row B: id changed on apply (%q -> %q); applying must not change identity", c.ID, applied.ID)
	}
}

func TestFixture_C_Apply_incomplete_is_Blocked(t *testing.T) {
	// spec_delta present, mirror_delta NONE — a monster.
	c, _ := cs.Open("add order discount", "phase-7", addOrderDiscountSpec(), nil)
	_, br := cs.Apply(c, time.Now(), cs.SpecHasMirror)
	if br == nil {
		t.Fatal("row C: apply of an incomplete envelope must be blocked")
	}
	if br.Code != cs.CodeIncompleteChangeSet {
		t.Fatalf("row C: block code = %q, want INCOMPLETE_CHANGESET", br.Code)
	}
	if c.Status != cs.StatusDraft {
		t.Fatalf("row C: source status = %q, want DRAFT (unchanged)", c.Status)
	}
	if !containsFix(br.HowToFix, "add_mirror_for_spec_delta") {
		t.Fatalf("row C: how_to_fix = %v, want it to contain add_mirror_for_spec_delta", br.HowToFix)
	}
}

func TestFixture_D_Edit_APPLIED_is_immutable(t *testing.T) {
	c, _ := cs.Open("add order discount", "phase-7", addOrderDiscountSpec(), orderDiscountMirror())
	applied, _ := cs.Apply(c, time.Now(), cs.SpecHasMirror)
	br := cs.Edit(applied)
	if br == nil {
		t.Fatal("row D: editing an APPLIED envelope must be blocked (immutable)")
	}
	if br.Code != cs.CodeAppliedIsImmutable {
		t.Fatalf("row D: block code = %q, want APPLIED_IS_IMMUTABLE", br.Code)
	}
}

func TestFixture_E_Revert_appends_inverse_source_stays_APPLIED(t *testing.T) {
	a, _ := cs.Open("add order discount", "phase-7", addOrderDiscountSpec(), orderDiscountMirror())
	a, _ = cs.Apply(a, time.Now(), cs.SpecHasMirror)

	b, br := cs.Revert(a)
	if br != nil {
		t.Fatalf("row E: revert blocked unexpectedly: %v", br)
	}
	if b.Status != cs.StatusDraft {
		t.Fatalf("row E: inverse status = %q, want DRAFT", b.Status)
	}
	if b.Reverts != a.ID {
		t.Fatalf("row E: inverse reverts = %q, want %q", b.Reverts, a.ID)
	}
	if b.SpecDelta == nil || b.SpecDelta.Kind != "remove" {
		t.Fatalf("row E: inverse spec_delta = %+v, want kind=remove (negation of add)", b.SpecDelta)
	}
	if b.ID == a.ID {
		t.Fatal("row E: inverse must have its own content-addressed id, distinct from the source")
	}
	// source unchanged, still APPLIED, immutable.
	if a.Status != cs.StatusApplied {
		t.Fatalf("row E: source status = %q, want APPLIED (revert must not mutate the source)", a.Status)
	}
}

func TestFixture_F_ApplyInverse_stamps_source_REVERTED(t *testing.T) {
	a, _ := cs.Open("add order discount", "phase-7", addOrderDiscountSpec(), orderDiscountMirror())
	a, _ = cs.Apply(a, time.Now(), cs.SpecHasMirror)
	b, _ := cs.Revert(a)

	// the inverse must itself be complete (spec+mirror both negated) and apply.
	bApplied, br := cs.Apply(b, time.Now(), cs.SpecHasMirror)
	if br != nil {
		t.Fatalf("row F: applying the inverse blocked unexpectedly: %v", br)
	}
	if bApplied.Status != cs.StatusApplied {
		t.Fatalf("row F: inverse status = %q, want APPLIED", bApplied.Status)
	}
	// applying the inverse stamps the source REVERTED — not deleted.
	stamped, br := cs.StampReverted(a)
	if br != nil {
		t.Fatalf("row F: stamping source blocked unexpectedly: %v", br)
	}
	if stamped.Status != cs.StatusReverted {
		t.Fatalf("row F: source status = %q, want REVERTED", stamped.Status)
	}
	if stamped.ID != a.ID {
		t.Fatalf("row F: stamping must not change the source id (%q -> %q)", a.ID, stamped.ID)
	}
}

func TestFixture_G_Discard_removes_a_DRAFT_no_FAILED(t *testing.T) {
	c, _ := cs.Open("add order discount", "phase-7", addOrderDiscountSpec(), orderDiscountMirror())
	if br := cs.Discard(c); br != nil {
		t.Fatalf("row G: discarding a DRAFT must be allowed: %v", br)
	}
	// an APPLIED cannot be discarded (append-only, immutable).
	applied, _ := cs.Apply(c, time.Now(), cs.SpecHasMirror)
	if br := cs.Discard(applied); br == nil {
		t.Fatal("row G: discarding an APPLIED must be refused (append-only)")
	}
	// No FAILED status anywhere in the closed set.
	for _, s := range cs.Statuses() {
		if s == "FAILED" {
			t.Fatal("row G: FAILED must never be a reachable status")
		}
	}
}

func containsFix(fixes []string, want string) bool {
	for _, f := range fixes {
		if f == want {
			return true
		}
	}
	return false
}
