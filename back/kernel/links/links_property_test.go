package links_test

// Property mirror (∀) for the versioned-links Validate/Resolve functions.
// reflects=kernel.links · test_kind=property · cert_language=rapid · liveness=live ·
// authority=below (the invariants are computational properties of the pure Validate/Resolve
// — the staleness RULE itself is the human's, above the line, pinned by the fixture).
// Run via `go test` (rapid is the frozen invariant slot, ADR 0003).
//
// The invariants are KRD §41–§42:
//
//  1. CLOSED-KIND + PINNED VALIDATION. Validate accepts iff kind ∈ the six-set ∧ from/to are
//     pinned id@version refs (id non-empty AND version non-empty); else it errors.
//  2. DETERMINISTIC. ∀ link, heads ⇒ Resolve(...) == Resolve(...) (same status).
//  3. STATUS RANGE. ∀ link, heads ⇒ Resolve ∈ {green, stale, absent} (never a fourth).
//  4. GREEN ⇔ HEAD. Resolve == green  iff  heads[link.to.id] exists ∧ == link.to.version.
//  5. ABSENT ⇒ RED. heads[link.to.id] missing ⇒ Resolve == absent (a link to an absent
//     version is ALWAYS red).
//  6. NEVER PANICS. ∀ link, heads ⇒ Resolve returns a status, never crashes (even on a
//     malformed/absent target).
//  7. CONTENT-ADDRESS TIE-IN (S02 substrate): a link serialized into a kernel.link body
//     round-trips as id == version == Hash(Canonicalize(body)); changing the pinned `to`
//     version yields a DIFFERENT version (a new row, never an in-place mutation).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"pgregory.net/rapid"
)

// genKind draws a link kind: either one of the six valid kinds or an out-of-set kind.
func genKind(t *rapid.T) links.Kind {
	valid := links.Kinds()
	choices := make([]string, 0, len(valid)+3)
	for _, k := range valid {
		choices = append(choices, string(k))
	}
	choices = append(choices, "depends_on", "uses", "")
	return links.Kind(rapid.SampledFrom(choices).Draw(t, "kind"))
}

// genRef draws a ref whose id/version may be empty (to exercise the pinned check).
func genRef(t *rapid.T, label string) links.Ref {
	id := rapid.SampledFrom([]string{"createOrder", "checkout-submit", "a", ""}).Draw(t, label+".id")
	ver := rapid.SampledFrom([]string{"v1", "v2", "v3", ""}).Draw(t, label+".version")
	return links.Ref{ID: id, Version: ver}
}

// TestValidate_ClosedKindAndPinned — Validate accepts iff kind ∈ the six-set ∧ from/to are
// pinned id@version refs.
func TestValidate_ClosedKindAndPinned(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		l := links.Link{Kind: genKind(t), From: genRef(t, "from"), To: genRef(t, "to")}
		err := links.Validate(l)
		wantOK := links.IsKnownKind(l.Kind) && l.From.IsPinned() && l.To.IsPinned()
		if wantOK && err != nil {
			t.Fatalf("Validate should accept a closed-kind pinned link %+v, got %v", l, err)
		}
		if !wantOK && err == nil {
			t.Fatalf("Validate should reject %+v (kindKnown=%v fromPinned=%v toPinned=%v)",
				l, links.IsKnownKind(l.Kind), l.From.IsPinned(), l.To.IsPinned())
		}
	})
}

// genHeads draws a heads map over the candidate target ids.
func genHeads(t *rapid.T) links.Heads {
	h := links.Heads{}
	for _, id := range []string{"createOrder", "checkout-submit", "a"} {
		if rapid.Bool().Draw(t, "has-"+id) {
			h[id] = rapid.SampledFrom([]string{"v1", "v2", "v3"}).Draw(t, "head-"+id)
		}
	}
	return h
}

// TestResolve_DeterministicAndRanged — Resolve is deterministic and status ∈ {green,stale,absent}.
func TestResolve_DeterministicAndRanged(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		l := links.Link{Kind: links.KindBinds, From: genRef(t, "from"), To: genRef(t, "to")}
		heads := genHeads(t)
		s1 := links.Resolve(l, heads)
		s2 := links.Resolve(l, heads)
		if s1 != s2 {
			t.Fatalf("Resolve must be deterministic: %q != %q", s1, s2)
		}
		switch s1 {
		case links.StatusGreen, links.StatusStale, links.StatusAbsent:
		default:
			t.Fatalf("status out of range: %q", s1)
		}
	})
}

// TestResolve_GreenIffHead — Resolve == green iff head exists ∧ head == pinned version;
// a missing head ⇒ absent (always red).
func TestResolve_GreenIffHead(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		l := links.Link{Kind: links.KindBinds, From: genRef(t, "from"), To: genRef(t, "to")}
		heads := genHeads(t)
		s := links.Resolve(l, heads)
		head, present := heads[l.To.ID]
		switch {
		case !present:
			if s != links.StatusAbsent {
				t.Fatalf("missing head ⇒ absent, got %q", s)
			}
		case head == l.To.Version:
			if s != links.StatusGreen {
				t.Fatalf("head == pinned version ⇒ green, got %q", s)
			}
		default:
			if s != links.StatusStale {
				t.Fatalf("head != pinned version ⇒ stale, got %q", s)
			}
		}
	})
}

// TestResolve_NeverPanics — a malformed/absent target yields a status, never a crash.
func TestResolve_NeverPanics(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		l := links.Link{Kind: genKind(t), From: genRef(t, "from"), To: genRef(t, "to")}
		heads := genHeads(t)
		_ = links.Resolve(l, heads) // must not panic
	})
}

// TestContentAddress_TieIn — a link serialized into a kernel.link body round-trips as
// id == version == Hash(Canonicalize(body)); changing the pinned `to` version yields a
// different version (a new row).
func TestContentAddress_TieIn(t *testing.T) {
	l := links.Link{
		Kind: links.KindBinds,
		From: links.Ref{ID: "checkout-submit", Version: "v1"},
		To:   links.Ref{ID: "createOrder", Version: "v3"},
	}
	body, err := links.SerializeLinkBody(l)
	if err != nil {
		t.Fatalf("serialize: %v", err)
	}
	rec, err := records.NewRecord(records.KindLink, body)
	if err != nil {
		t.Fatalf("NewRecord: %v", err)
	}
	if rec.ID != rec.Version {
		t.Fatalf("content-address: id (%q) must equal version (%q)", rec.ID, rec.Version)
	}

	l2 := l
	l2.To.Version = "v2" // a different pinned version
	body2, err := links.SerializeLinkBody(l2)
	if err != nil {
		t.Fatalf("serialize l2: %v", err)
	}
	rec2, err := records.NewRecord(records.KindLink, body2)
	if err != nil {
		t.Fatalf("NewRecord l2: %v", err)
	}
	if rec2.ID == rec.ID {
		t.Fatalf("changing the pinned version must yield a different content address; both = %q", rec.ID)
	}
}
