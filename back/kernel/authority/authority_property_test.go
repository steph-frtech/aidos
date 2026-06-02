package authority_test

// Property mirror (∀) for the AuthorityGraph Decide/Validate functions.
// reflects=kernel.authority · test_kind=property · cert_language=rapid · liveness=live ·
// authority=below (the invariants are computational properties of the pure Decide/Validate
// — the admission RULE itself is the human's, above the line, pinned by the fixture).
// Run via `go test` (rapid is the frozen invariant slot, ADR 0003).
//
// The invariants are KRD §13.8 + ADR 0016:
//
//  1. TOTAL. ∀ graph, truth, approvals ⇒ Decide returns exactly one of
//     admitted | blocked | escalated (never a fourth, never a panic).
//  2. DETERMINISTIC. ∀ graph, truth, approvals ⇒ Decide(...) == Decide(...) (same verdict).
//  3. NO ADMISSION WITHOUT AUTHORITY. ∀ graph where a required approver is MISSING from
//     the granted set ⇒ Decide is NEVER admitted (a missing approver ⇒ blocked/escalated).
//  4. VETO DOMINATES. ∀ graph, ∀ granted that contains a veto role ⇒ Decide == blocked
//     with code VETOED, regardless of how many approvers are also granted.
//  5. OUT-OF-ENUM truth_kind ⇒ Validate returns a non-empty error (never silently admits).
//  6. CONTENT-ADDRESS TIE-IN (S02 substrate): a graph serialized into a kernel.authority_graph
//     body round-trips as id == version == Hash(Canonicalize(body)); changing a role list
//     yields a DIFFERENT version (a new row, never an in-place mutation — KRD §44.1 reauthorize).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/truthtyping"
	"pgregory.net/rapid"
)

// drawRole draws a role identifier from a small fixed pool (the §13.8 roles + a few more),
// so approvals/veto sets overlap meaningfully with the graph's lists.
func drawRole(rt *rapid.T) authority.Role {
	pool := []authority.Role{"legal", "product_owner", "security", "architecture_board", "design", "ops", "finance"}
	return pool[rapid.IntRange(0, len(pool)-1).Draw(rt, "role")]
}

func drawRoles(rt *rapid.T, label string) []authority.Role {
	n := rapid.IntRange(0, 4).Draw(rt, label+"-n")
	out := make([]authority.Role, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, drawRole(rt))
	}
	return out
}

// drawKnownTruthKind draws one of the seven KRD §13.4 truth kinds.
func drawKnownTruthKind(rt *rapid.T) string {
	kinds := truthtyping.Kinds()
	return string(kinds[rapid.IntRange(0, len(kinds)-1).Draw(rt, "kind")])
}

// drawGraph draws a well-formed-ish graph: known truth_kind, a non-empty approvers list,
// and veto/escalation lists drawn from the pool. It excludes roles from veto that are also
// approvers (so Validate's no-overlap rule does not pre-empt the Decide invariants).
func drawGraph(rt *rapid.T) authority.AuthorityGraph {
	approvers := drawRoles(rt, "approvers")
	if len(approvers) == 0 {
		approvers = []authority.Role{"legal"}
	}
	veto := drawRoles(rt, "veto")
	// drop any veto role that is also an approver (Validate forbids the overlap)
	filtered := veto[:0:0]
	for _, v := range veto {
		if !containsRole(approvers, v) {
			filtered = append(filtered, v)
		}
	}
	return authority.AuthorityGraph{
		Domain:     "checkout",
		TruthKind:  authority.TruthKind(drawKnownTruthKind(rt)),
		Approvers:  approvers,
		Veto:       filtered,
		Escalation: drawRoles(rt, "escalation"),
	}
}

func decisionIsKnown(d authority.Decision) bool {
	return d == authority.DecisionAdmitted ||
		d == authority.DecisionBlocked ||
		d == authority.DecisionEscalated
}

// TestDecideTotal — Decide always returns one of the three known decisions.
func TestDecideTotal(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := drawGraph(rt)
		truth := authority.Truth{Domain: g.Domain, TruthKind: g.TruthKind}
		granted := drawRoles(rt, "granted")
		d := authority.Decide(g, truth, granted)
		if !decisionIsKnown(d.Decision) {
			rt.Fatalf("Decide returned an unknown decision %q (graph %+v, granted %v)", d.Decision, g, granted)
		}
	})
}

// TestDecideDeterministic — same input ⇒ same verdict.
func TestDecideDeterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := drawGraph(rt)
		truth := authority.Truth{Domain: g.Domain, TruthKind: g.TruthKind}
		granted := drawRoles(rt, "granted")
		a := authority.Decide(g, truth, granted)
		b := authority.Decide(g, truth, granted)
		if a.Decision != b.Decision {
			rt.Fatalf("Decide diverged: %q vs %q (graph %+v, granted %v)", a.Decision, b.Decision, g, granted)
		}
	})
}

// TestNoAdmissionWithoutAuthority — a missing required approver ⇒ never admitted.
func TestNoAdmissionWithoutAuthority(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := drawGraph(rt)
		truth := authority.Truth{Domain: g.Domain, TruthKind: g.TruthKind}
		granted := drawRoles(rt, "granted")
		// is some required approver missing from granted?
		missing := false
		for _, a := range g.Approvers {
			if !containsRole(granted, a) {
				missing = true
				break
			}
		}
		if missing {
			d := authority.Decide(g, truth, granted)
			if d.Decision == authority.DecisionAdmitted {
				rt.Fatalf("a missing required approver must NEVER be admitted (graph %+v, granted %v)", g, granted)
			}
		}
	})
}

// TestVetoDominates — any granted veto role ⇒ blocked with code VETOED, regardless of approvers.
func TestVetoDominates(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := drawGraph(rt)
		if len(g.Veto) == 0 {
			return // no veto to test
		}
		truth := authority.Truth{Domain: g.Domain, TruthKind: g.TruthKind}
		// grant every approver AND a veto role — veto must still dominate.
		granted := append([]authority.Role{}, g.Approvers...)
		granted = append(granted, g.Veto[0])
		d := authority.Decide(g, truth, granted)
		if d.Decision != authority.DecisionBlocked {
			rt.Fatalf("a granted veto must block regardless of approvers (graph %+v): got %q", g, d.Decision)
		}
		if d.BlockReason == nil || d.BlockReason.Code != authority.CodeVetoed {
			rt.Fatalf("a vetoed block must carry code VETOED, got %+v", d.BlockReason)
		}
	})
}

// TestValidateRejectsOutOfEnumTruthKind — an out-of-§13.4-enum truth_kind ⇒ Validate errors.
func TestValidateRejectsOutOfEnumTruthKind(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		bad := authority.TruthKind(rapid.StringMatching(`[a-z]{3,8}`).Draw(rt, "bad"))
		if truthtyping.IsKnownKind(truthtyping.TruthKind(bad)) {
			return // drew a real one by chance
		}
		g := authority.AuthorityGraph{
			Domain:    "checkout",
			TruthKind: bad,
			Approvers: []authority.Role{"legal"},
		}
		if err := authority.Validate(g); err == nil {
			rt.Fatalf("an out-of-enum truth_kind %q must fail Validate", bad)
		}
	})
}

// TestValidateRejectsApproverVetoOverlap — a role in both approvers and veto ⇒ Validate errors.
func TestValidateRejectsApproverVetoOverlap(t *testing.T) {
	g := authority.AuthorityGraph{
		Domain:    "checkout",
		TruthKind: "regulatory",
		Approvers: []authority.Role{"legal"},
		Veto:      []authority.Role{"legal"},
	}
	if err := authority.Validate(g); err == nil {
		t.Fatalf("a role in both approvers and veto must fail Validate (self-contradicting graph)")
	}
}

// TestValidateRejectsEmptyApprovers — a graph with no approver could never admit (a monster).
func TestValidateRejectsEmptyApprovers(t *testing.T) {
	g := authority.AuthorityGraph{Domain: "checkout", TruthKind: "regulatory"}
	if err := authority.Validate(g); err == nil {
		t.Fatalf("an empty approvers list must fail Validate")
	}
}

// TestContentAddressTieIn — a graph rides INSIDE a content-addressed body: serializing it
// round-trips as id == version == Hash(Canonicalize(body)); changing a role list yields a
// DIFFERENT version (a new row, never an in-place mutation — KRD §44.1 reauthorize).
func TestContentAddressTieIn(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := drawGraph(rt)
		body, err := authority.SerializeGraphBody(g)
		if err != nil {
			rt.Fatalf("serialize graph into a body: %v", err)
		}
		rec, err := records.NewRecord(records.KindTruth, body)
		if err != nil {
			rt.Fatalf("NewRecord over a graph body: %v", err)
		}
		if err := records.Validate(rec); err != nil {
			rt.Fatalf("graph record must satisfy the content-address invariant: %v", err)
		}
		want := records.Hash(rec.Body)
		if rec.ID != want || rec.Version != want {
			rt.Fatalf("id == version == Hash must hold: id=%q version=%q want=%q", rec.ID, rec.Version, want)
		}
		// Changing the approvers list changes the version (a reauthorize, never in-place).
		g2 := g
		g2.Approvers = append(append([]authority.Role{}, g.Approvers...), "finance_extra")
		body2, _ := authority.SerializeGraphBody(g2)
		rec2, err := records.NewRecord(records.KindTruth, body2)
		if err != nil {
			rt.Fatalf("NewRecord over the reauthorized body: %v", err)
		}
		if rec2.Version == rec.Version {
			rt.Fatalf("an authority change MUST yield a new version (got the same %q)", rec.Version)
		}
	})
}
