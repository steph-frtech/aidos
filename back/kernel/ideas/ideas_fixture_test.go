package ideas_test

// Idea lifecycle fixture — the BDD mirror (mirrors schema · reflects: ideas.idea
// "order-discount-idea" · test_kind: fixture · cert_language: fixture · authority:
// above). Materialized here for the runner (the mirrors-schema persistence is
// back-filled at S06). It encodes the KRD §116/§118 lifecycle as state → command →
// events:
//
//	capture (human provenance) -> Captured, status draft, version==∅, mirror==∅
//	grill  -> Grilled
//	spike  -> Spiking            (the "floue ?" branch — exploration, ratchet OFF)
//	harvest-> Harvested
//	promote{mirror:none} -> Blocked, status stays harvested (NO kernel write),
//	                        block_reason.code == NO_MIRROR_NO_KERNEL,
//	                        how_to_fix contains write_mirror_run_goal_freeze  (THE done case)
//	promote{mirror:real} -> Promoted, a kernel truth proposal via the /goal flow
//	                        whose provenance points back to the idea
//	reject -> Rejected, idea still present (traced, append-only)
//
// THE done criterion: you cannot write an idea into the kernel directly; promotion
// requires a mirror. The Idea type carries NO version and NO mirror field by
// construction — the fixture asserts that absence structurally.

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
)

// captureOrderDiscount captures the canonical "order-discount-idea" from a human
// utterance — the §117 human on-ramp. Reused across rows.
func captureOrderDiscount(t *testing.T) ideas.Idea {
	t.Helper()
	i, err := ideas.Capture(
		ideas.ProposesPolicy,
		"give regulars a discount",
		ideas.Provenance{Source: ideas.ProvenanceHuman, Detail: "finalement je veux une remise"},
	)
	if err != nil {
		t.Fatalf("capture: %v", err)
	}
	return i
}

// Row 1 — capture: a draft idea with no freeze and no mirror.
func TestFixture_Capture_Draft_NoFreezeNoMirror(t *testing.T) {
	i := captureOrderDiscount(t)

	if i.Status != ideas.StatusDraft {
		t.Fatalf("status = %q, want draft", i.Status)
	}
	if i.ID == "" {
		t.Fatal("captured idea has no content-addressed id")
	}
	// version==∅ and mirror==∅: the Idea TYPE has no such fields — the absence is
	// structural. We assert the JSON body never serializes a version or a mirror key.
	b, err := ideas.Canonicalize(i)
	if err != nil {
		t.Fatalf("canonicalize: %v", err)
	}
	body := string(b)
	if strings.Contains(body, "\"version\"") {
		t.Fatalf("idea body carries a version (an idea has no freeze): %s", body)
	}
	if strings.Contains(body, "\"mirror\"") {
		t.Fatalf("idea body carries a mirror (an idea has no mirror): %s", body)
	}
}

// Row 2 — grill: draft -> grilled.
func TestFixture_Grill(t *testing.T) {
	i := captureOrderDiscount(t)
	g, err := ideas.Grill(i)
	if err != nil {
		t.Fatalf("grill: %v", err)
	}
	if g.Status != ideas.StatusGrilled {
		t.Fatalf("status = %q, want grilled", g.Status)
	}
	if g.ID != i.ID {
		t.Fatalf("grill changed the content-addressed id %q -> %q", i.ID, g.ID)
	}
}

// Row 3 — spike: grilled -> spiking (the floue branch).
func TestFixture_Spike(t *testing.T) {
	i, _ := ideas.Grill(captureOrderDiscount(t))
	s, err := ideas.Spike(i)
	if err != nil {
		t.Fatalf("spike: %v", err)
	}
	if s.Status != ideas.StatusSpiking {
		t.Fatalf("status = %q, want spiking", s.Status)
	}
}

// Row 4 — harvest: spiking -> harvested.
func TestFixture_Harvest_FromSpiking(t *testing.T) {
	i, _ := ideas.Grill(captureOrderDiscount(t))
	i, _ = ideas.Spike(i)
	h, err := ideas.Harvest(i)
	if err != nil {
		t.Fatalf("harvest: %v", err)
	}
	if h.Status != ideas.StatusHarvested {
		t.Fatalf("status = %q, want harvested", h.Status)
	}
}

// Row 5 — THE done case: promote a harvested idea WITHOUT a mirror is Blocked; the
// idea stays harvested (no kernel write); NO_MIRROR_NO_KERNEL with the fix path.
func TestFixture_PromoteWithoutMirror_Blocked(t *testing.T) {
	i, _ := ideas.Grill(captureOrderDiscount(t))
	i, _ = ideas.Harvest(i)

	promo, br := ideas.Promote(i, "")
	if promo != nil {
		t.Fatal("promote without a mirror produced a Promotion — the wall did not hold")
	}
	if br == nil {
		t.Fatal("promote without a mirror returned no BlockReason")
	}
	if string(br.Code) != "NO_MIRROR_NO_KERNEL" {
		t.Fatalf("block code = %q, want NO_MIRROR_NO_KERNEL", br.Code)
	}
	found := false
	for _, fix := range br.HowToFix {
		if strings.Contains(fix, "write_mirror_run_goal_freeze") {
			found = true
		}
	}
	if !found {
		t.Fatalf("how_to_fix does not contain write_mirror_run_goal_freeze: %v", br.HowToFix)
	}
	// The idea STAYS harvested — Promote never mutated it (no kernel write).
	if i.Status != ideas.StatusHarvested {
		t.Fatalf("idea status after blocked promote = %q, want harvested (no kernel write)", i.Status)
	}
}

// Row 6 — promote WITH a mirror = /goal = freeze: a Promotion whose provenance
// points back to the idea. The kernel freeze is the aidos CLI role via /goal, not
// asserted here (this step proves the gate, not the downstream kernel write).
func TestFixture_PromoteWithMirror_Promoted(t *testing.T) {
	i, _ := ideas.Grill(captureOrderDiscount(t))
	i, _ = ideas.Harvest(i)

	promo, br := ideas.Promote(i, "mirror:order-discount-red-bdd")
	if br != nil {
		t.Fatalf("promote with a mirror was blocked: %v", br)
	}
	if promo == nil {
		t.Fatal("promote with a mirror produced no Promotion")
	}
	if promo.ProvenanceIdeaID != i.ID {
		t.Fatalf("promotion provenance = %q, want back-link to idea %q", promo.ProvenanceIdeaID, i.ID)
	}
	if promo.MirrorRef == "" {
		t.Fatal("promotion carries no mirror reference")
	}
}

// Row 7 — reject: grilled -> rejected, traced (the idea remains; reason recorded).
func TestFixture_Reject_Traced(t *testing.T) {
	i, _ := ideas.Grill(captureOrderDiscount(t))
	r, err := ideas.Reject(i, "duplicates existing policy")
	if err != nil {
		t.Fatalf("reject: %v", err)
	}
	if r.Status != ideas.StatusRejected {
		t.Fatalf("status = %q, want rejected", r.Status)
	}
	if r.RejectReason != "duplicates existing policy" {
		t.Fatalf("reject reason = %q, not traced", r.RejectReason)
	}
	if r.ID != i.ID {
		t.Fatalf("reject changed the id %q -> %q (the idea must remain the same record)", i.ID, r.ID)
	}
}

// Harvest-direct (grilled -> harvested, no spike) and harvest-via-spike are
// indistinguishable for promotion: both still need the mirror.
func TestFixture_HarvestDirect_StillNeedsMirror(t *testing.T) {
	i, _ := ideas.Grill(captureOrderDiscount(t))
	h, err := ideas.Harvest(i) // direct, no spike
	if err != nil {
		t.Fatalf("harvest direct: %v", err)
	}
	if _, br := ideas.Promote(h, ""); br == nil || string(br.Code) != "NO_MIRROR_NO_KERNEL" {
		t.Fatal("harvest-direct idea promoted without a mirror — the wall must hold for every idea")
	}
}

// Illegal transitions are blocked by the state machine (the mirror blocks them).
func TestFixture_IllegalTransitions_Blocked(t *testing.T) {
	draft := captureOrderDiscount(t)
	if _, err := ideas.Spike(draft); err == nil {
		t.Error("spike from draft was not blocked")
	}
	if _, err := ideas.Harvest(draft); err == nil {
		t.Error("harvest from draft was not blocked")
	}
	// promote from a non-harvested status is blocked at the gate.
	if _, br := ideas.Promote(draft, "mirror:x"); br == nil {
		t.Error("promote from draft was not blocked")
	}
}
