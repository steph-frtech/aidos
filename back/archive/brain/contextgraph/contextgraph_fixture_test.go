// ContextGraphDecision fixture mirror (AIDOS step S32) — the state→command→events proof of the
// deterministic, LLM-free reuse gate of KRD §119.2. It IS the ContextGraphMirror: given
// {decision, region, date:expired} → expect {may_reuse:false}.
//
// mirror record: reflects=archive.brain.contextgraph.Decide · test_kind=fixture ·
//
//	cert_language=operation-dsl/go · authority=above · liveness=alive
//
// It is the BEHAVIOUR spec (Mandat A): each fixture row is state (a candidate + a request +
// a passed-in `now`) → command (Decide) → events (the verdict). The done cases are
// expired⇒may_reuse=false ("time" checked) and out-of-scope⇒may_reuse=false ("scope" checked,
// no_reuse_outside_scope). These are MEANS-tests toward the human red, not new truths.
package contextgraph_test

import (
	"testing"
	"time"

	"github.com/steph-frtech/aidos/back/archive/brain/contextgraph"
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
)

// fixedNow is the passed-in clock for the fixtures — never read from time.Now() (determinism).
func fixedNow(t *testing.T) time.Time {
	t.Helper()
	n, err := time.Parse(time.RFC3339, "2026-05-30T00:00:00Z")
	if err != nil {
		t.Fatalf("parse now: %v", err)
	}
	return n
}

func mustChecked(t *testing.T, d contextgraph.ContextGraphDecision, dim contextgraph.Dimension) {
	t.Helper()
	for _, c := range d.Checked {
		if c == dim {
			return
		}
	}
	t.Fatalf("expected %q in checked, got %v", dim, d.Checked)
}

// Row 1 — an EXPIRED decision is not reusable (THE done criterion, time). region EU,
// expires 2026-01-01, now 2026-05-30 ⇒ may_reuse=false, "time" checked, reason names the window.
func TestFixture_Expired_NotReusable(t *testing.T) {
	candidate := contextgraph.Candidate{
		ID:        "S15-eu-truth-pin",
		Scope:     scope.TruthScope{Region: scope.RegionEU},
		ExpiresAt: "2026-01-01T00:00:00Z",
	}
	request := contextgraph.RequestContext{Scope: scope.TruthScope{Region: scope.RegionEU}}

	d := contextgraph.Decide(candidate, request, fixedNow(t))

	if d.MayReuse {
		t.Fatalf("expired decision must NOT be reusable; got may_reuse=true")
	}
	mustChecked(t, d, contextgraph.DimTime)
	if d.Reason == "" {
		t.Fatalf("reason must name the expired time_window; got empty")
	}
}

// Row 2 — an OUT-OF-SCOPE decision is not reusable (THE done criterion, scope). candidate EU,
// request US ⇒ may_reuse=false, "scope" checked (no_reuse_outside_scope).
func TestFixture_OutOfScope_NotReusable(t *testing.T) {
	candidate := contextgraph.Candidate{
		ID:        "S15-eu-truth-pin",
		Scope:     scope.TruthScope{Region: scope.RegionEU},
		ExpiresAt: "2027-01-01T00:00:00Z",
	}
	request := contextgraph.RequestContext{Scope: scope.TruthScope{Region: scope.RegionUS}}

	d := contextgraph.Decide(candidate, request, fixedNow(t))

	if d.MayReuse {
		t.Fatalf("out-of-scope decision must NOT be reusable; got may_reuse=true")
	}
	mustChecked(t, d, contextgraph.DimScope)
	if d.Reason == "" {
		t.Fatalf("reason must name the scope mismatch; got empty")
	}
}

// Row 3 — an in-time, in-scope, in-authority decision IS reusable.
func TestFixture_InTimeInScopeInAuthority_Reusable(t *testing.T) {
	candidate := contextgraph.Candidate{
		ID:        "S15-eu-truth-pin",
		Scope:     scope.TruthScope{Region: scope.RegionEU},
		ExpiresAt: "2027-01-01T00:00:00Z",
		Authority: authority.AuthorityGraph{
			Domain:    "checkout",
			TruthKind: authority.TruthKind("behavioral"),
			Approvers: []authority.Role{"legal"},
		},
	}
	request := contextgraph.RequestContext{
		Scope:  scope.TruthScope{Region: scope.RegionEU},
		Domain: "checkout",
	}

	d := contextgraph.Decide(candidate, request, fixedNow(t))

	if !d.MayReuse {
		t.Fatalf("in-time/in-scope/in-authority decision MUST be reusable; got may_reuse=false reason=%q", d.Reason)
	}
	if d.RequiredHumanReview {
		t.Fatalf("a clean reuse must not require human review")
	}
	// All four declared dimensions are recorded when reuse is granted (false-dominant ⇒ true).
	for _, dim := range contextgraph.Dimensions() {
		mustChecked(t, d, dim)
	}
}

// Row 4 — an authority no longer holding for the request domain requires human review.
func TestFixture_AuthorityNoLongerHolds_RequiresHumanReview(t *testing.T) {
	candidate := contextgraph.Candidate{
		ID:        "S16-authority-pin",
		Scope:     scope.TruthScope{Region: scope.RegionEU},
		ExpiresAt: "2027-01-01T00:00:00Z",
		Authority: authority.AuthorityGraph{
			Domain:    "checkout",
			TruthKind: authority.TruthKind("behavioral"),
			Approvers: []authority.Role{"legal"},
		},
	}
	request := contextgraph.RequestContext{
		Scope:  scope.TruthScope{Region: scope.RegionEU},
		Domain: "payouts", // a domain the candidate's authority does NOT own
	}

	d := contextgraph.Decide(candidate, request, fixedNow(t))

	if !d.RequiredHumanReview {
		t.Fatalf("an authority that no longer holds must set required_human_review")
	}
	if d.MayReuse {
		t.Fatalf("required_human_review implies reuse is not auto-granted")
	}
	mustChecked(t, d, contextgraph.DimAuthority)
}

// Row 5 — a declared reuse condition that fails blocks reuse.
func TestFixture_FailingCondition_BlocksReuse(t *testing.T) {
	candidate := contextgraph.Candidate{
		ID:         "S15-eu-truth-pin",
		Scope:      scope.TruthScope{Region: scope.RegionEU},
		ExpiresAt:  "2027-01-01T00:00:00Z",
		Conditions: []contextgraph.Condition{{Key: "channel", Equals: "web"}},
	}
	// The request fact does NOT satisfy the condition (channel=mobile).
	request := contextgraph.RequestContext{
		Scope: scope.TruthScope{Region: scope.RegionEU},
		Facts: map[string]string{"channel": "mobile"},
	}

	d := contextgraph.Decide(candidate, request, fixedNow(t))

	if d.MayReuse {
		t.Fatalf("a failing declared condition must block reuse; got may_reuse=true")
	}
	mustChecked(t, d, contextgraph.DimConditions)
}

// Row 6 — the recorded decision id is the content hash of its body (S01/S02 reused).
func TestFixture_DecisionID_IsContentHash(t *testing.T) {
	candidate := contextgraph.Candidate{
		ID:        "S15-eu-truth-pin",
		Scope:     scope.TruthScope{Region: scope.RegionEU},
		ExpiresAt: "2027-01-01T00:00:00Z",
		Authority: authority.AuthorityGraph{
			Domain:    "checkout",
			TruthKind: authority.TruthKind("behavioral"),
			Approvers: []authority.Role{"legal"},
		},
	}
	request := contextgraph.RequestContext{Scope: scope.TruthScope{Region: scope.RegionEU}, Domain: "checkout"}

	d := contextgraph.Decide(candidate, request, fixedNow(t))
	withID, err := d.ComputeID()
	if err != nil {
		t.Fatalf("ComputeID: %v", err)
	}

	canon, err := d.CanonicalBody()
	if err != nil {
		t.Fatalf("CanonicalBody: %v", err)
	}
	if want := records.Hash(canon); withID.ID != want {
		t.Fatalf("decision id is not the content hash: got %q want %q", withID.ID, want)
	}
}
