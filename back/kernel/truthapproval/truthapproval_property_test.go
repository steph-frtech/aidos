package truthapproval

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/authority"
	"pgregory.net/rapid"
)

// roleGen draws from a small fixed pool of well-formed roles.
var rolePool = []authority.Role{"product_owner", "security", "legal", "architecture_board", "design"}

func genGranted(t *rapid.T) []authority.Role {
	n := rapid.IntRange(0, len(rolePool)).Draw(t, "n")
	out := make([]authority.Role, 0, n)
	seen := map[authority.Role]bool{}
	for i := 0; i < n; i++ {
		r := rolePool[rapid.IntRange(0, len(rolePool)-1).Draw(t, "r")]
		if !seen[r] {
			seen[r] = true
			out = append(out, r)
		}
	}
	return out
}

// PROPERTY (reproducibility mirror): same input → same Approve verdict. Determinism is the
// reproducibility law (CLAUDE.md §6) — Approve is a pure function, no clock/rng/I/O.
func TestProperty_ApproveIsDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		granted := genGranted(t)
		head := rapid.SampledFrom([]string{"head-0", "head-1"}).Draw(t, "head")
		live := rapid.SampledFrom([]string{"head-0", "head-1"}).Draw(t, "live")
		p := baseProposal("alice", head, granted)
		d1 := Approve(graph(), p, live, appliedAt, nil)
		d2 := Approve(graph(), p, live, appliedAt, nil)
		if d1.Outcome != d2.Outcome || d1.NewHead != d2.NewHead {
			t.Fatalf("Approve is not deterministic: %+v vs %+v", d1, d2)
		}
	})
}

// PROPERTY (the wall always holds): Approve NEVER lands a write unless the gate admitted (or a
// recorded override) AND the head is fresh. No path silently writes truth.
func TestProperty_NoLandWithoutAdmissionAndFreshHead(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		granted := genGranted(t)
		head := rapid.SampledFrom([]string{"head-0", "head-1"}).Draw(t, "head")
		live := rapid.SampledFrom([]string{"head-0", "head-1"}).Draw(t, "live")
		p := baseProposal("alice", head, granted)
		d := Approve(graph(), p, live, appliedAt, nil)
		if d.Outcome == OutcomeApplied {
			// Landed ⇒ the gate admitted (all approvers, no veto) AND the head was fresh.
			if d.Admission.Decision != authority.DecisionAdmitted {
				t.Fatalf("landed without admission: %+v", d)
			}
			if head != live {
				t.Fatalf("landed on a stale head (last-write-wins!): proposed %q live %q", head, live)
			}
			if d.NewHead == "" {
				t.Fatalf("landed without a new head")
			}
		}
	})
}

// PROPERTY (anti-overwrite §9 — THE anchor): for ANY number of proposals submitted against the
// SAME starting head, at most ONE lands; every other is refused STALE_HEAD. Never last-write-wins.
func TestProperty_AtMostOneConcurrentWriteLands(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		k := rapid.IntRange(2, 6).Draw(t, "k")
		granted := []authority.Role{"product_owner", "security"} // admitted
		proposals := make([]Proposal, 0, k)
		for i := 0; i < k; i++ {
			p := baseProposal(Actor(rapid.SampledFrom([]string{"alice", "bob", "carol", "dan"}).Draw(t, "a")), "head-0", granted)
			p.Label = rapid.StringMatching(`[a-z]{3,8}`).Draw(t, "label") // distinct envelopes
			proposals = append(proposals, p)
		}
		decisions := ApplyConcurrent(graph(), "head-0", proposals, appliedAt)
		if got := AppliedCount(decisions); got > 1 {
			t.Fatalf("anti-overwrite violated: %d concurrent writes landed against the same head", got)
		}
		// Every non-applied decision against the same starting head is stale (or gate-refused, but
		// here all are admitted), and points at the moved head.
		for i, d := range decisions {
			if d.Outcome == OutcomeStaleHead && d.StaleAgainst == "" {
				t.Fatalf("decision %d stale but no head to re-run against", i)
			}
		}
	})
}

// PROPERTY (anti-Goodhart / the wall): a veto ALWAYS blocks unless a fully-recorded override is
// present — the gate cannot be satisfied by re-running the flow (no self-grant). An override is a
// recorded decision (provenance + ADR), never a silent bypass.
func TestProperty_VetoBlocksUnlessRecordedOverride(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		granted := append(genGranted(t), "legal") // legal veto always present
		p := baseProposal("alice", "head-0", granted)
		// No override ⇒ always blocked.
		d := Approve(graph(), p, "head-0", appliedAt, nil)
		if d.Outcome != OutcomeBlocked {
			t.Fatalf("a present veto must block without an override; got %s", d.Outcome)
		}
		// An override missing any field ⇒ still blocked (no silent bypass).
		partial := &OverrideRecord{By: "cto"} // no reason, no ADR
		d2 := Approve(graph(), p, "head-0", appliedAt, partial)
		if d2.Outcome != OutcomeBlocked {
			t.Fatalf("an unrecorded override must not bypass a veto; got %s", d2.Outcome)
		}
		// A fully-recorded override ⇒ lands AND carries the provenance.
		full := &OverrideRecord{By: "cto", Reason: "cleared", ADR: "ADR-0016"}
		d3 := Approve(graph(), p, "head-0", appliedAt, full)
		if d3.Outcome != OutcomeApplied || d3.Override == nil {
			t.Fatalf("a recorded override must land with provenance; got %s override=%+v", d3.Outcome, d3.Override)
		}
	})
}
