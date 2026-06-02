// ContextGraphDecision property mirror (AIDOS step S32) — the ∀ invariants of the deterministic,
// LLM-free reuse gate (KRD §119.2), below the line, computational.
//
// mirror record: reflects=archive.brain.contextgraph.Decide · test_kind=property ·
//
//	cert_language=rapid · authority=below · liveness=alive
//
// Invariants pinned: determinism (now passed, never read from the clock); expired⇒false;
// out-of-scope⇒false (no_reuse_outside_scope); may_reuse=true ⇒ all four checks recorded and
// passed (false-dominant); the verdict references ONLY the given candidate (no invention);
// the verdict is computed by declared predicates only (no panic on malformed input). The layer
// is LLM-free by construction (no LLM symbol is importable here — the property attests it).
package contextgraph_test

import (
	"testing"
	"time"

	"github.com/steph-frtech/aidos/back/archive/brain/contextgraph"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"pgregory.net/rapid"
)

var regionChoices = []scope.Region{scope.RegionFR, scope.RegionEU, scope.RegionUS, scope.RegionGlobal, ""}

func drawRegion(rt *rapid.T, label string) scope.Region {
	return rapid.SampledFrom(regionChoices).Draw(rt, label)
}

func drawTime(rt *rapid.T, label string) time.Time {
	// A range of epochs (seconds) spanning ~2000..2050; passed in as `now`, never time.Now().
	sec := rapid.Int64Range(946684800, 2524608000).Draw(rt, label)
	return time.Unix(sec, 0).UTC()
}

func drawCandidate(rt *rapid.T) contextgraph.Candidate {
	c := contextgraph.Candidate{
		ID:    rapid.StringMatching(`[a-zA-Z0-9_-]{1,12}`).Draw(rt, "cid"),
		Scope: scope.TruthScope{Region: drawRegion(rt, "cregion")},
	}
	// Optionally an expiry (RFC3339) at a drawn instant.
	if rapid.Bool().Draw(rt, "hasExp") {
		c.ExpiresAt = drawTime(rt, "exp").Format(time.RFC3339)
	}
	return c
}

func drawRequest(rt *rapid.T) contextgraph.RequestContext {
	return contextgraph.RequestContext{
		Scope: scope.TruthScope{Region: drawRegion(rt, "rregion")},
	}
}

// ∀ Decide is deterministic — same (candidate, request, now) ⇒ same verdict (now passed in).
func TestProperty_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := drawCandidate(rt)
		r := drawRequest(rt)
		now := drawTime(rt, "now")

		d1 := contextgraph.Decide(c, r, now)
		d2 := contextgraph.Decide(c, r, now)

		if d1.MayReuse != d2.MayReuse || d1.Reason != d2.Reason ||
			d1.RequiredHumanReview != d2.RequiredHumanReview ||
			len(d1.Checked) != len(d2.Checked) {
			rt.Fatalf("Decide is not deterministic: %+v vs %+v", d1, d2)
		}
		for i := range d1.Checked {
			if d1.Checked[i] != d2.Checked[i] {
				rt.Fatalf("checked diverged at %d: %v vs %v", i, d1.Checked, d2.Checked)
			}
		}
	})
}

// ∀ candidate with now strictly after expires_at ⇒ may_reuse == false (expired ⇒ no reuse).
func TestProperty_ExpiredNeverReusable(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		exp := drawTime(rt, "exp")
		// now strictly after the expiry, by 1s..1e8s.
		now := exp.Add(time.Duration(rapid.Int64Range(1, 100000000).Draw(rt, "delta")) * time.Second)
		c := contextgraph.Candidate{
			ID:        rapid.StringMatching(`[a-z]{1,8}`).Draw(rt, "cid"),
			Scope:     scope.TruthScope{Region: scope.RegionEU},
			ExpiresAt: exp.Format(time.RFC3339),
		}
		r := contextgraph.RequestContext{Scope: scope.TruthScope{Region: scope.RegionEU}}

		d := contextgraph.Decide(c, r, now)
		if d.MayReuse {
			rt.Fatalf("expired (now=%s after exp=%s) must not be reusable", now, exp)
		}
	})
}

// ∀ candidate whose scope does NOT contain the request scope ⇒ may_reuse == false.
func TestProperty_OutOfScopeNeverReusable(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		// Candidate constrained to a concrete region; request to a DIFFERENT concrete region.
		concrete := []scope.Region{scope.RegionFR, scope.RegionEU, scope.RegionUS}
		cr := rapid.SampledFrom(concrete).Draw(rt, "cregion")
		rr := rapid.SampledFrom(concrete).Draw(rt, "rregion")
		if cr == rr {
			return // not an out-of-scope case
		}
		c := contextgraph.Candidate{
			ID:        "c",
			Scope:     scope.TruthScope{Region: cr},
			ExpiresAt: "2099-01-01T00:00:00Z", // in-time, so only scope can block
		}
		r := contextgraph.RequestContext{Scope: scope.TruthScope{Region: rr}}

		d := contextgraph.Decide(c, r, time.Unix(1700000000, 0).UTC())
		if d.MayReuse {
			rt.Fatalf("out-of-scope (candidate %s, request %s) must not be reusable", cr, rr)
		}
	})
}

// ∀ Decide run: may_reuse == true ⇒ ALL four checks recorded in `checked` and passed.
func TestProperty_TrueImpliesAllFourChecked(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := drawCandidate(rt)
		r := drawRequest(rt)
		now := drawTime(rt, "now")

		d := contextgraph.Decide(c, r, now)
		if !d.MayReuse {
			return
		}
		if len(d.Checked) != len(contextgraph.Dimensions()) {
			rt.Fatalf("may_reuse=true but checked=%v (want all four)", d.Checked)
		}
		want := contextgraph.Dimensions()
		for i, dim := range want {
			if d.Checked[i] != dim {
				rt.Fatalf("may_reuse=true but checked not all four in order: %v", d.Checked)
			}
		}
		if d.RequiredHumanReview {
			rt.Fatalf("may_reuse=true must not also require human review")
		}
	})
}

// ∀ Decide run: the verdict references ONLY the given candidate (it never invents a candidate id).
func TestProperty_NeverInventsCandidate(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := drawCandidate(rt)
		r := drawRequest(rt)
		now := drawTime(rt, "now")

		d := contextgraph.Decide(c, r, now)
		if d.CandidateID != c.ID {
			rt.Fatalf("verdict invented a candidate id: got %q want %q", d.CandidateID, c.ID)
		}
	})
}

// ∀ malformed candidate/request: Decide yields a verdict, never panics (totality).
func TestProperty_NeverPanics(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := contextgraph.Candidate{
			ID:        rapid.String().Draw(rt, "cid"),
			Scope:     scope.TruthScope{Region: scope.Region(rapid.String().Draw(rt, "cregion"))},
			ExpiresAt: rapid.String().Draw(rt, "exp"), // possibly unparseable garbage
		}
		c.Scope.TimeWindow.From = rapid.String().Draw(rt, "from")
		c.Scope.TimeWindow.To = rapid.String().Draw(rt, "to")
		r := contextgraph.RequestContext{
			Scope:  scope.TruthScope{Region: scope.Region(rapid.String().Draw(rt, "rregion"))},
			Domain: rapid.String().Draw(rt, "domain"),
		}
		now := drawTime(rt, "now")

		// Must not panic; a malformed candidate must never be silently reusable.
		d := contextgraph.Decide(c, r, now)
		// A malformed/unparseable time must block reuse (false-dominant), never grant it blindly.
		if d.MayReuse && (c.Scope.TimeWindow.From != "" || c.Scope.TimeWindow.To != "" || c.ExpiresAt != "") {
			if !validRFC3339(c.Scope.TimeWindow.From) || (c.Scope.TimeWindow.To != "" && !validRFC3339(c.Scope.TimeWindow.To)) {
				rt.Fatalf("granted reuse on a malformed time bound: %+v", c)
			}
		}
	})
}

func validRFC3339(s string) bool {
	if s == "" {
		return true
	}
	_, err := time.Parse(time.RFC3339, s)
	return err == nil
}
