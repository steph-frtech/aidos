// RealityMirror fixture mirror (AIDOS step S43) — the state→command→events proof of the
// external loop Incident → Learn → Idea (draft, incident:#NNNN) and the blocked direct
// edge Incident → Kernel (KRD §53/§67/§117/§1099).
//
// mirror record: reflects=incidents.incident "out-of-stock-during-checkout" ·
//
//	test_kind=fixture · cert_language=fixture · authority=above · liveness=alive
//
// It is the BEHAVIOUR spec (Mandat A): every loop edge is a fixture row; the canonical done
// cases are (a) /learn → a DRAFT idea carrying incident:#1043 verbatim with no version/mirror,
// the incident traced back via idea_id; and (b) to_kernel → Blocked with
// REALITY_CANNOT_DECLARE_TRUTH and NO kernel write. This fixture is a MEANS-test toward the
// human/reality red, not a new truth.
package reality_test

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/reality"
)

// canonicalIncident is the fixture's observed incident: createOrder fails 30% of the time
// because items go out-of-stock between add-to-cart and pay. taint [incident_derived],
// recurrence high — reality, never truth.
func canonicalIncident(t *testing.T) reality.Incident {
	t.Helper()
	inc, err := reality.Observe(reality.ObserveInput{
		Ref: "#1043",
		Signal: reality.Signal{
			Operation:  "createOrder",
			Error:      "30% fail",
			Recurrence: 312,
		},
		CauseSketch:    "item goes out-of-stock between add-to-cart and pay",
		Taint:          []firewall.Taint{firewall.TaintIncidentDerived},
		LinkedBranches: []string{"main"},
	})
	if err != nil {
		t.Fatalf("Observe: %v", err)
	}
	return inc
}

// Row 1 — given no incident, when observe ⇒ Observed; taint contains incident_derived;
// version==null, mirror==null, idea_id==null.
func TestFixture_Observe_IsRealityNotTruth(t *testing.T) {
	inc := canonicalIncident(t)

	// id is the content hash of the canonical body (S01 content-addressing).
	canon, err := inc.CanonicalBody()
	if err != nil {
		t.Fatalf("CanonicalBody: %v", err)
	}
	if want := records.Hash(canon); inc.ID != want {
		t.Fatalf("id is not the content hash: got %q want %q", inc.ID, want)
	}

	// An incident has NO freeze and NO mirror — the type makes them unrepresentable. We assert
	// the absence structurally: the canonical body carries no "version" and no "mirror" key.
	body := string(canon)
	if strings.Contains(body, `"version"`) {
		t.Errorf("an incident must have no version/freeze; body=%s", body)
	}
	if strings.Contains(body, `"mirror"`) {
		t.Errorf("an incident must have no mirror — it PROPOSES one, it is not one; body=%s", body)
	}

	// taint contains incident_derived.
	if !containsTaint(inc.Taint, firewall.TaintIncidentDerived) {
		t.Errorf("incident must carry the incident_derived taint: %v", inc.Taint)
	}
	// not yet learned.
	if inc.IdeaID != "" {
		t.Errorf("a freshly observed incident must not be learned yet: idea_id=%q", inc.IdeaID)
	}
}

// Row 2 — THE done case (a): /learn turns the incident into an IDEA DRAFT, nothing more.
func TestFixture_Learn_ProducesDraftIdeaWithProvenance(t *testing.T) {
	inc := canonicalIncident(t)
	cand, err := reality.Learn(inc)
	if err != nil {
		t.Fatalf("Learn: %v", err)
	}

	// It becomes a DRAFT idea (S27).
	if cand.Idea.Status != ideas.StatusDraft {
		t.Errorf("idea must be draft: %q", cand.Idea.Status)
	}
	// provenance is the incident reference, carried VERBATIM, source = incident.
	if cand.Idea.Provenance.Source != ideas.ProvenanceIncident {
		t.Errorf("idea provenance source must be incident: %q", cand.Idea.Provenance.Source)
	}
	if cand.Idea.Provenance.Detail != "#1043" {
		t.Errorf("idea provenance must carry the incident ref verbatim: got %q want #1043",
			cand.Idea.Provenance.Detail)
	}
	// intent reflects the missing-mirror behaviour (the cause sketch).
	if !strings.Contains(cand.Idea.Intent, "out-of-stock between add-to-cart and pay") {
		t.Errorf("idea intent must reflect the cause sketch: %q", cand.Idea.Intent)
	}
	// the createOrder operation pins proposes=operation (the signal pins it).
	if !cand.ProposesPinned || cand.Idea.Proposes != ideas.ProposesOperation {
		t.Errorf("a failing operation signal must pin proposes=operation: pinned=%v proposes=%q",
			cand.ProposesPinned, cand.Idea.Proposes)
	}
	// no kernel write occurred (promotion is the /goal flow, S27).
	if cand.WroteKernel {
		t.Error("Learn must NOT write the kernel (promotion is the /goal flow, S27)")
	}

	// the loop is traced back: incident.idea_id == idea.id.
	learned := reality.LearnedIncident(inc, cand)
	if learned.IdeaID != cand.Idea.ID {
		t.Errorf("incident.idea_id must trace back to the idea: got %q want %q",
			learned.IdeaID, cand.Idea.ID)
	}
}

// Row 3 — the idea STILL carries no version and no mirror (the ideas.Idea type makes both
// unrepresentable). We assert the absence on the persisted-shape JSON.
func TestFixture_Learn_IdeaHasNoVersionNoMirror(t *testing.T) {
	inc := canonicalIncident(t)
	cand, err := reality.Learn(inc)
	if err != nil {
		t.Fatalf("Learn: %v", err)
	}
	canon, err := ideas.Canonicalize(cand.Idea)
	if err != nil {
		t.Fatalf("Canonicalize idea: %v", err)
	}
	body := string(canon)
	if strings.Contains(body, `"version"`) {
		t.Errorf("the learned idea must carry no version/freeze; body=%s", body)
	}
	if strings.Contains(body, `"mirror"`) {
		t.Errorf("the learned idea must carry no mirror; body=%s", body)
	}
}

// Row 4 — the ONLY outward edge: ToIdea hands the candidate to the S27 idea-intake door.
func TestFixture_ToIdea_IsTheOnlyOutwardEdge(t *testing.T) {
	inc := canonicalIncident(t)
	cand, err := reality.Learn(inc)
	if err != nil {
		t.Fatalf("Learn: %v", err)
	}
	idea := reality.ToIdea(cand)
	if idea.ID != cand.Idea.ID {
		t.Errorf("ToIdea must hand the candidate idea to S27: got %q want %q", idea.ID, cand.Idea.ID)
	}
	if idea.Status != ideas.StatusDraft {
		t.Errorf("the outward idea must be a draft: %q", idea.Status)
	}
}

// Row 5 — THE done case (b): the direct Incident → Kernel edge is refused at the wall.
func TestFixture_ToKernel_BlockedTheDoneCase(t *testing.T) {
	inc := canonicalIncident(t)
	br := reality.ToKernel(inc)

	// Blocked: a BlockReason is ALWAYS returned for the direct edge (never a kernel write).
	if br == nil {
		t.Fatal("the direct Incident → Kernel edge must be Blocked (got nil — a kernel write would occur)")
	}
	if string(br.Code) != "REALITY_CANNOT_DECLARE_TRUTH" {
		t.Fatalf("block_reason.code: got %q want REALITY_CANNOT_DECLARE_TRUTH", br.Code)
	}
	// how_to_fix names the full mandatory flow.
	joined := strings.Join(br.HowToFix, " | ")
	if !strings.Contains(joined, "incident_then_learn_then_mirror_then_goal_then_approval") {
		t.Errorf("how_to_fix must name the full flow; got %v", br.HowToFix)
	}
	if len(br.HowToFix) == 0 {
		t.Error("a BlockReason with an empty how_to_fix is a prison (forbidden)")
	}
}

// Row 6 — when the signal does NOT pin a proposes kind, it is left UNSET with an
// OpenQuestion — never a guessed kind (CLAUDE.md §8 honesty).
func TestFixture_Learn_UnpinnedProposesIsOpenQuestionNotAGuess(t *testing.T) {
	// A budget-breach incident with no operation reference: the signal does not pin a kind.
	inc, err := reality.Observe(reality.ObserveInput{
		Ref: "#2099",
		Signal: reality.Signal{
			Operation:  "", // no operation pins the kind
			Error:      "p99 latency budget breached: 1.8s > 1.0s",
			Recurrence: 47,
		},
		CauseSketch: "checkout fan-out grew unbounded after the catalog merge",
		Taint:       []firewall.Taint{firewall.TaintIncidentDerived},
	})
	if err != nil {
		t.Fatalf("Observe: %v", err)
	}
	cand, err := reality.Learn(inc)
	if err != nil {
		t.Fatalf("Learn: %v", err)
	}
	if cand.ProposesPinned {
		t.Error("a signal with no operation must NOT pin a proposes kind")
	}
	if cand.Idea.Proposes != "" {
		t.Errorf("unpinned proposes must be left UNSET (not guessed): got %q", cand.Idea.Proposes)
	}
	if cand.OpenQuestion == "" {
		t.Error("an unpinned proposes must surface an OpenQuestion, never a silent guess")
	}
}

func containsTaint(ts []firewall.Taint, want firewall.Taint) bool {
	for _, t := range ts {
		if t == want {
			return true
		}
	}
	return false
}
