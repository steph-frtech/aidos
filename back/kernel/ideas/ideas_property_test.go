package ideas_test

// Idea lifecycle invariants — the property mirror (mirrors schema · reflects:
// ideas.idea · test_kind: property · cert_language: rapid · authority: below).
// For ANY sequence of capture/grill/spike/harvest/reject/promote commands:
//
//   - reachable statuses are EXACTLY {draft, grilled, spiking, harvested, rejected};
//   - an Idea NEVER carries a version/freeze nor a mirror field (the type makes it
//     unrepresentable; the canonical body never serializes either key);
//   - Promote succeeds ONLY IF a non-empty mirror is supplied AND the idea is
//     harvested (no mirror ⇒ BlockReason, no kernel write — the wall holds for
//     EVERY idea, not just the canonical one);
//   - Reject is append-only (the rejected idea remains; its id is unchanged);
//   - id == content hash of the canonical body (content-addressing, reusing S01/S02);
//   - the functions are deterministic, total and never panic.

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"pgregory.net/rapid"
)

var allStatuses = map[ideas.Status]bool{
	ideas.StatusDraft:     true,
	ideas.StatusGrilled:   true,
	ideas.StatusSpiking:   true,
	ideas.StatusHarvested: true,
	ideas.StatusRejected:  true,
}

func genProposes(t *rapid.T) ideas.Proposes {
	ks := ideas.ProposesKinds()
	return ks[rapid.IntRange(0, len(ks)-1).Draw(t, "proposes")]
}

func genProvenance(t *rapid.T) ideas.Provenance {
	srcs := []ideas.ProvenanceSource{ideas.ProvenanceHuman, ideas.ProvenanceIncident}
	return ideas.Provenance{
		Source: srcs[rapid.IntRange(0, 1).Draw(t, "src")],
		Detail: rapid.String().Draw(t, "detail"),
	}
}

// applyCommand applies one random gesture to the idea, never panicking. Illegal
// transitions return an error and leave the idea unchanged (the caller keeps prev).
func applyCommand(t *rapid.T, i ideas.Idea) ideas.Idea {
	cmd := rapid.IntRange(0, 5).Draw(t, "cmd")
	var next ideas.Idea
	var err error
	switch cmd {
	case 0:
		next, err = ideas.Grill(i)
	case 1:
		next, err = ideas.Spike(i)
	case 2:
		next, err = ideas.Harvest(i)
	case 3:
		next, err = ideas.Reject(i, rapid.String().Draw(t, "reason"))
	case 4:
		// promote with no mirror — must always be refused (no status change).
		_, br := ideas.Promote(i, "")
		if br == nil {
			t.Fatalf("promote with no mirror was NOT blocked for status %q", i.Status)
		}
		return i
	default:
		// promote with a mirror — allowed only when harvested.
		promo, br := ideas.Promote(i, "mirror:"+rapid.StringN(1, 8, 8).Draw(t, "ref"))
		if i.Status == ideas.StatusHarvested {
			if br != nil || promo == nil {
				t.Fatalf("promote(harvested, mirror) was blocked")
			}
			if promo.ProvenanceIdeaID != i.ID {
				t.Fatalf("promotion provenance does not back-link the idea")
			}
		} else if br == nil {
			t.Fatalf("promote(%q, mirror) was NOT blocked (only harvested may promote)", i.Status)
		}
		return i
	}
	if err != nil {
		return i // illegal transition — unchanged
	}
	return next
}

func TestProperty_LifecycleInvariants(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		idea, err := ideas.Capture(genProposes(t), rapid.String().Draw(t, "intent"), genProvenance(t))
		if err != nil {
			t.Fatalf("capture failed: %v", err)
		}
		startID := idea.ID

		// id == content hash of the canonical body (content-addressing).
		cb, err := ideas.Canonicalize(idea)
		if err != nil {
			t.Fatalf("canonicalize: %v", err)
		}
		if idea.ID != records.Hash(cb) {
			t.Fatalf("id %q != content hash %q", idea.ID, records.Hash(cb))
		}

		n := rapid.IntRange(0, 12).Draw(t, "steps")
		rejectedSeen := false
		for k := 0; k < n; k++ {
			prev := idea
			idea = applyCommand(t, idea)

			// reachable statuses are exactly the closed set.
			if !allStatuses[idea.Status] {
				t.Fatalf("unreachable status %q", idea.Status)
			}
			// the canonical body never carries a version or a mirror key.
			b, err := ideas.Canonicalize(idea)
			if err != nil {
				t.Fatalf("canonicalize step %d: %v", k, err)
			}
			body := string(b)
			if strings.Contains(body, "\"version\"") || strings.Contains(body, "\"mirror\"") {
				t.Fatalf("idea body carries version/mirror: %s", body)
			}
			// the content-addressed identity is stable across lifecycle moves: the
			// sketch {proposes,intent,provenance} never changes, so id is invariant.
			if idea.ID != startID {
				t.Fatalf("idea id drifted %q -> %q (status is metadata, not identity)", startID, idea.ID)
			}
			// Reject is append-only / terminal: once rejected, it stays rejected.
			if rejectedSeen && idea.Status != ideas.StatusRejected {
				t.Fatalf("a rejected idea left the rejected lane: %q (reject is traced, not undone)", idea.Status)
			}
			if idea.Status == ideas.StatusRejected {
				rejectedSeen = true
			}
			_ = prev
		}
	})
}

// determinism: the same sketch always canonicalizes to the same bytes and the same id.
func TestProperty_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		p := genProposes(t)
		intent := rapid.String().Draw(t, "intent")
		prov := genProvenance(t)

		a, err1 := ideas.Capture(p, intent, prov)
		b, err2 := ideas.Capture(p, intent, prov)
		if err1 != nil || err2 != nil {
			t.Fatalf("capture errors: %v %v", err1, err2)
		}
		if a.ID != b.ID {
			t.Fatalf("non-deterministic id: %q != %q", a.ID, b.ID)
		}
		ca, _ := ideas.Canonicalize(a)
		cb, _ := ideas.Canonicalize(b)
		if string(ca) != string(cb) {
			t.Fatalf("non-deterministic canonical body")
		}
		// key-order independence: a body with reordered keys hashes the same.
		reordered, _ := json.Marshal(map[string]any{
			"provenance": map[string]any{"detail": prov.Detail, "source": string(prov.Source)},
			"intent":     intent,
			"proposes":   string(p),
		})
		rc, err := records.Canonicalize(reordered)
		if err != nil {
			t.Fatalf("canonicalize reordered: %v", err)
		}
		if records.Hash(rc) != a.ID {
			t.Fatalf("content address not key-order independent")
		}
	})
}
