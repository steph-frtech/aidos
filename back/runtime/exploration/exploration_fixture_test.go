package exploration_test

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/exploration"
)

// Idea-status-machine fixture (state → command → events), interpreted in Go.
// reflects=runtime.exploration · test_kind=fixture · cert_language=fixture ·
// authority=above · liveness=live.
//
// The transitions of the §75 gesture machine over the lifecycle (KRD §118):
//
//	draft   --grill(sharp)--> grilled
//	draft   --grill(fuzzy)--> spiking
//	draft   --grill(bad)----> rejected (+ traced reason)
//	grilled --harvest-------> harvested (+ DraftTruthProposal)
//	spiking --harvest-------> harvested (+ DraftTruthProposal)
//
// Each transition emits the verdict + provenance and NO version/mirror is ever
// attached to an Idea (the Idea↔Truth distinction holds for every reachable state —
// the type has no field for them, and the proposal's HasFrozenVersion/HasMirror are
// constant false). Materialized source: conceptually stored in the `mirrors` schema,
// persisted to Postgres at S06 (bootstrap exception).

func mkIdea(status ideas.Status) ideas.Idea {
	i, err := ideas.Capture(
		ideas.ProposesPolicy,
		"sketched intent",
		ideas.Provenance{Source: ideas.ProvenanceHuman, Detail: "finalement je veux …"},
	)
	if err != nil {
		panic(err)
	}
	i.Status = status
	return i
}

func TestGrillRoutingFixture(t *testing.T) {
	cases := []struct {
		name    string
		verdict exploration.GrillVerdict
		want    ideas.Status
	}{
		{"sharp → grilled (skips spike)", exploration.VerdictSharp, ideas.StatusGrilled},
		{"fuzzy → spiking (floue branch)", exploration.VerdictFuzzy, ideas.StatusSpiking},
		{"bad → rejected (traced)", exploration.VerdictBad, ideas.StatusRejected},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in := mkIdea(ideas.StatusDraft)
			out, err := exploration.Grill(in, tc.verdict, "traced reason")
			if err != nil {
				t.Fatalf("Grill(%s) error: %v", tc.verdict, err)
			}
			if out.Status != tc.want {
				t.Fatalf("Grill(%s) status = %q, want %q", tc.verdict, out.Status, tc.want)
			}
			// The id (content address) is preserved across the transition — status is
			// metadata, not identity.
			if out.ID != in.ID {
				t.Fatalf("Grill changed the idea id: %q → %q", in.ID, out.ID)
			}
			// Provenance is carried, never dropped.
			if out.Provenance.Source != in.Provenance.Source {
				t.Fatalf("Grill dropped provenance: %q → %q", in.Provenance.Source, out.Provenance.Source)
			}
			if tc.verdict == exploration.VerdictBad && out.RejectReason == "" {
				t.Fatal("bad verdict did not trace a reason")
			}
		})
	}
}

func TestHarvestFixture(t *testing.T) {
	for _, from := range []ideas.Status{ideas.StatusGrilled, ideas.StatusSpiking} {
		t.Run(string(from)+" → harvested + DraftTruthProposal", func(t *testing.T) {
			in := mkIdea(from)
			out, proposal, err := exploration.Harvest(in, "retry with capped exponential backoff")
			if err != nil {
				t.Fatalf("Harvest from %s error: %v", from, err)
			}
			if out.Status != ideas.StatusHarvested {
				t.Fatalf("status = %q, want harvested", out.Status)
			}
			if proposal.Kind != exploration.KindDraftTruth {
				t.Fatalf("proposal kind = %q, want %q", proposal.Kind, exploration.KindDraftTruth)
			}
			if proposal.HasFrozenVersion() || proposal.HasMirror() {
				t.Fatal("proposal carries a frozen version or a mirror — it is not a DRAFT Truth")
			}
			if proposal.IdeaID != out.ID {
				t.Fatalf("proposal idea_id = %q, want %q (the harvested idea)", proposal.IdeaID, out.ID)
			}
			if proposal.Intent != "retry with capped exponential backoff" {
				t.Fatalf("proposal intent = %q, want the discovered intention", proposal.Intent)
			}
			if proposal.Provenance.Source != in.Provenance.Source {
				t.Fatal("proposal dropped provenance")
			}
		})
	}
}

func TestIllegalTransitionsAreRefused(t *testing.T) {
	// harvest from draft is illegal (must be grilled or spiking) — the lifecycle
	// refuses it; the engine surfaces the error, never silently performs it.
	if _, _, err := exploration.Harvest(mkIdea(ideas.StatusDraft), "x"); err == nil {
		t.Fatal("harvest from draft was allowed — the illegal transition was not refused")
	}
	// grill from a non-draft status is illegal.
	if _, err := exploration.Grill(mkIdea(ideas.StatusGrilled), exploration.VerdictSharp, ""); err == nil {
		t.Fatal("grill from grilled was allowed — the illegal transition was not refused")
	}
}
