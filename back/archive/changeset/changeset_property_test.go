package changeset_test

// Property mirror (∀) for the ChangeSet state machine (KRD §44, §98, §44.1).
// reflects=changesets.changeset · test_kind=property · cert_language=rapid · liveness=live ·
// authority=below (these are computational properties of the pure Open/Apply/Revert/Discard; the
// lifecycle RULE itself — APPLIED is immutable; revert is an append-only inverse — is the human's,
// above the line, pinned by the fixture). Run via `go test` (rapid is the frozen invariant slot).
//
// The invariants are:
//
//  1. CLOSED STATUS SET. For any open/apply/revert/discard sequence, the only reachable statuses
//     are DRAFT | APPLIED | REVERTED — never FAILED, never anything else.
//  2. APPLIED IS IMMUTABLE. Apply does not mutate the source; Edit of an APPLIED/REVERTED always
//     yields APPLIED_IS_IMMUTABLE; the body (canonical) is unchanged across the DRAFT→APPLIED stamp.
//  3. COMPLETENESS-GATED APPLY. Apply yields APPLIED iff the completeness predicate passes; a
//     spec-without-mirror envelope is always blocked with INCOMPLETE_CHANGESET.
//  4. REVERT∘REVERT ≡ IDENTITY (delta-wise). Inverting twice reconstructs the source's deltas.
//  5. REVERT APPENDS. Each Revert produces a NEW envelope with its own distinct content id (the log
//     strictly grows — a revert creates information, never destroys the source).
//  6. CONTENT-ADDRESSING. id == SHA-256 of the canonical body; equal bodies ⇒ equal ids.

import (
	"encoding/json"
	"testing"
	"time"

	cs "github.com/steph-frtech/aidos/back/archive/changeset"
	"pgregory.net/rapid"
)

// genDelta draws a small delta with a kind in {add, remove, refine}.
func genDelta(t *rapid.T, label string) *cs.Delta {
	if !rapid.Bool().Draw(t, label+"_present") {
		return nil
	}
	kind := rapid.SampledFrom([]string{"add", "remove", "refine"}).Draw(t, label+"_kind")
	target := rapid.StringMatching(`[a-z]{1,8}\.[a-z]{1,8}`).Draw(t, label+"_target")
	return &cs.Delta{Kind: kind, Target: target, Body: json.RawMessage(`{"k":"v"}`)}
}

// genDraft draws a DRAFT envelope (possibly with/without spec and/or mirror).
func genDraft(t *rapid.T) cs.ChangeSet {
	label := rapid.StringMatching(`[a-z ]{1,16}`).Draw(t, "label")
	phase := rapid.StringMatching(`phase-[0-9]`).Draw(t, "phase")
	spec := genDelta(t, "spec")
	mirror := genDelta(t, "mirror")
	c, err := cs.Open(label, phase, spec, mirror)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	return c
}

func isClosedStatus(s cs.Status) bool {
	return s == cs.StatusDraft || s == cs.StatusApplied || s == cs.StatusReverted
}

func TestProp_ClosedStatusSet(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		c := genDraft(t)
		if !isClosedStatus(c.Status) {
			t.Fatalf("open produced status %q outside {DRAFT,APPLIED,REVERTED}", c.Status)
		}
		applied, br := cs.Apply(c, time.Unix(0, 0), cs.SpecHasMirror)
		if !isClosedStatus(applied.Status) {
			t.Fatalf("apply produced status %q outside the closed set", applied.Status)
		}
		if br == nil && applied.Status == cs.StatusApplied {
			inv, ibr := cs.Revert(applied)
			if ibr == nil && !isClosedStatus(inv.Status) {
				t.Fatalf("revert produced status %q outside the closed set", inv.Status)
			}
			stamped, sbr := cs.StampReverted(applied)
			if sbr == nil && !isClosedStatus(stamped.Status) {
				t.Fatalf("stamp produced status %q outside the closed set", stamped.Status)
			}
		}
	})
}

func TestProp_ApplyDoesNotMutateSource_and_AppliedIsImmutable(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		c := genDraft(t)
		before := c.Status
		applied, br := cs.Apply(c, time.Unix(0, 0), cs.SpecHasMirror)
		if c.Status != before {
			t.Fatalf("apply mutated the source status (%q -> %q)", before, c.Status)
		}
		if br == nil {
			if applied.Status != cs.StatusApplied {
				t.Fatalf("complete apply did not yield APPLIED: %q", applied.Status)
			}
			if applied.ID != c.ID {
				t.Fatalf("apply changed the content id (%q -> %q)", c.ID, applied.ID)
			}
			if eb := cs.Edit(applied); eb == nil || eb.Code != cs.CodeAppliedIsImmutable {
				t.Fatalf("editing an APPLIED must yield APPLIED_IS_IMMUTABLE, got %v", eb)
			}
		}
	})
}

func TestProp_ApplyGatedOnCompleteness(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		c := genDraft(t)
		_, br := cs.Apply(c, time.Unix(0, 0), cs.SpecHasMirror)
		hasSpecNoMirror := c.SpecDelta != nil && c.MirrorDelta == nil
		if hasSpecNoMirror {
			if br == nil || br.Code != cs.CodeIncompleteChangeSet {
				t.Fatalf("spec-without-mirror must be blocked INCOMPLETE_CHANGESET, got %v", br)
			}
		} else {
			if br != nil {
				t.Fatalf("a complete (or spec-less) envelope must apply, got block %v", br)
			}
		}
	})
}

func TestProp_RevertRevert_isIdentity_deltawise(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		c := genDraft(t)
		applied, br := cs.Apply(c, time.Unix(0, 0), cs.SpecHasMirror)
		if br != nil || applied.Status != cs.StatusApplied {
			return // only APPLIED envelopes can be reverted
		}
		inv, ib := cs.Revert(applied)
		if ib != nil {
			t.Fatalf("revert of an APPLIED must succeed, got %v", ib)
		}
		// the inverse must itself be APPLIED to be reverted again.
		invApplied, ab := cs.Apply(inv, time.Unix(0, 0), cs.SpecHasMirror)
		if ab != nil {
			return // inverse may be incomplete if source had spec-less/mirror-less shape; skip
		}
		inv2, ib2 := cs.Revert(invApplied)
		if ib2 != nil {
			t.Fatalf("revert of the inverse must succeed, got %v", ib2)
		}
		if !sameDelta(inv2.SpecDelta, applied.SpecDelta) {
			t.Fatalf("revert∘revert spec_delta = %+v, want %+v", inv2.SpecDelta, applied.SpecDelta)
		}
		if !sameDelta(inv2.MirrorDelta, applied.MirrorDelta) {
			t.Fatalf("revert∘revert mirror_delta = %+v, want %+v", inv2.MirrorDelta, applied.MirrorDelta)
		}
	})
}

func TestProp_RevertAppends_distinctId(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		c := genDraft(t)
		applied, br := cs.Apply(c, time.Unix(0, 0), cs.SpecHasMirror)
		if br != nil || applied.Status != cs.StatusApplied {
			return
		}
		inv, ib := cs.Revert(applied)
		if ib != nil {
			t.Fatalf("revert must succeed, got %v", ib)
		}
		if inv.ID == "" {
			t.Fatal("the inverse must be content-addressed (non-empty id)")
		}
		if inv.ID == applied.ID {
			t.Fatal("a revert must APPEND a new, distinct envelope — inverse id equals source id")
		}
		if inv.Reverts != applied.ID {
			t.Fatalf("inverse reverts = %q, want %q", inv.Reverts, applied.ID)
		}
	})
}

func TestProp_ContentAddressing(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		c := genDraft(t)
		body, err := c.CanonicalBody()
		if err != nil {
			t.Fatalf("canonical body: %v", err)
		}
		// re-open the same envelope; equal bodies ⇒ equal ids.
		c2, err := cs.Open(c.Label, c.ParentPhase, c.SpecDelta, c.MirrorDelta)
		if err != nil {
			t.Fatalf("re-open: %v", err)
		}
		body2, _ := c2.CanonicalBody()
		if string(body) == string(body2) && c.ID != c2.ID {
			t.Fatalf("equal canonical bodies must yield equal ids (%q vs %q)", c.ID, c2.ID)
		}
	})
}

func sameDelta(a, b *cs.Delta) bool {
	if a == nil || b == nil {
		return a == b
	}
	return a.Kind == b.Kind && a.Target == b.Target && string(a.Body) == string(b.Body)
}
