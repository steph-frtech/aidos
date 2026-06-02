package exploration_test

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/exploration"
	"pgregory.net/rapid"
)

// Reproducibility / invariant mirror (rapid, N1): reflects=runtime.exploration ·
// test_kind=invariant · cert_language=rapid · liveness=live · authority=below.
//
// The S28 invariants (KRD §75/§84/§118):
//
//   - the reachable Idea status set is EXACTLY {draft,grilled,spiking,harvested,
//     rejected} (closed — no invented sixth status), for any grill/harvest sequence;
//   - an Idea never carries a frozen version or a mirror (the Idea↔Truth distinction
//     holds for every reachable state — the type has no field, and the harvest
//     proposal's HasFrozenVersion/HasMirror are constant false);
//   - while spiking, EVERY write path is under /spike or is refused with
//     SPIKE_WRITE_ESCAPES_ZONE (confinement holds for all paths);
//   - harvest of a grilled|spiking idea ALWAYS yields harvested + a DRAFT (no-freeze,
//     no-mirror) proposal and never writes the kernel/mirror;
//   - a rejected idea is terminal and records its provenance;
//   - the engine is DETERMINISTIC: same input → same output.

var closedStatusSet = map[ideas.Status]bool{
	ideas.StatusDraft:     true,
	ideas.StatusGrilled:   true,
	ideas.StatusSpiking:   true,
	ideas.StatusHarvested: true,
	ideas.StatusRejected:  true,
}

func genIdea() *rapid.Generator[ideas.Idea] {
	return rapid.Custom(func(t *rapid.T) ideas.Idea {
		intent := rapid.StringMatching(`[a-z ]{1,40}`).Draw(t, "intent")
		source := rapid.SampledFrom([]ideas.ProvenanceSource{ideas.ProvenanceHuman, ideas.ProvenanceIncident}).Draw(t, "source")
		i, err := ideas.Capture(ideas.ProposesPolicy, intent, ideas.Provenance{Source: source, Detail: intent})
		if err != nil {
			t.Fatalf("capture: %v", err)
		}
		return i
	})
}

// TestGrillRoutingKeepsStatusSetClosed: any grill verdict over a draft yields a
// status in the closed set; provenance is preserved.
func TestGrillRoutingKeepsStatusSetClosed(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := genIdea().Draw(t, "idea")
		verdict := rapid.SampledFrom(exploration.Verdicts()).Draw(t, "verdict")
		out, err := exploration.Grill(in, verdict, "traced")
		if err != nil {
			t.Fatalf("Grill(%s) error: %v", verdict, err)
		}
		if !closedStatusSet[out.Status] {
			t.Fatalf("Grill(%s) reached status %q outside the closed set", verdict, out.Status)
		}
		if out.Provenance.Source != in.Provenance.Source {
			t.Fatalf("Grill dropped provenance: %q → %q", in.Provenance.Source, out.Provenance.Source)
		}
		// bad verdict is rejected AND terminal: re-grilling a rejected idea is illegal.
		if verdict == exploration.VerdictBad {
			if out.Status != ideas.StatusRejected {
				t.Fatalf("bad verdict reached %q, want rejected", out.Status)
			}
			if out.RejectReason == "" {
				t.Fatal("rejected idea has no traced reason")
			}
			if _, err := exploration.Grill(out, exploration.VerdictSharp, ""); err == nil {
				t.Fatal("a rejected idea was not terminal")
			}
		}
	})
}

// TestSpikeConfinementHoldsForAllPaths: a write under /spike is allowed; any other
// path is refused with SPIKE_WRITE_ESCAPES_ZONE.
func TestSpikeConfinementHoldsForAllPaths(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		path := rapid.StringMatching(`/[a-z]{1,8}(/[a-z]{1,8}){0,3}`).Draw(t, "path")
		w := exploration.SpikeWrite{Path: path}
		br := exploration.CheckSpikeWrite(w)
		confined := path == exploration.SpikePrefix || strings.HasPrefix(path, exploration.SpikePrefix+"/")
		if confined {
			if br != nil {
				t.Fatalf("confined path %q was refused with %q", path, br.Code)
			}
		} else {
			if br == nil {
				t.Fatalf("escaping path %q was allowed", path)
			}
			if br.Code != blockreason.CodeSpikeWriteEscapesZone {
				t.Fatalf("escaping path %q blocked with %q, want SPIKE_WRITE_ESCAPES_ZONE", path, br.Code)
			}
			if len(br.HowToFix) == 0 {
				t.Fatal("SPIKE_WRITE_ESCAPES_ZONE has an empty how_to_fix — the prison")
			}
		}
	})
}

// TestHarvestAlwaysDraftNeverWritesTruth: harvest of a grilled|spiking idea always
// yields harvested + a DRAFT (no-freeze, no-mirror) proposal; harvest never writes a
// truth schema.
func TestHarvestAlwaysDraftNeverWritesTruth(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := genIdea().Draw(t, "idea")
		in.Status = rapid.SampledFrom([]ideas.Status{ideas.StatusGrilled, ideas.StatusSpiking}).Draw(t, "from")
		discovered := rapid.StringMatching(`[a-z ]{0,30}`).Draw(t, "discovered")

		out, proposal, err := exploration.Harvest(in, discovered)
		if err != nil {
			t.Fatalf("Harvest error: %v", err)
		}
		if out.Status != ideas.StatusHarvested {
			t.Fatalf("status = %q, want harvested", out.Status)
		}
		if proposal.Kind != exploration.KindDraftTruth {
			t.Fatalf("proposal kind = %q, want draft-truth", proposal.Kind)
		}
		if proposal.HasFrozenVersion() || proposal.HasMirror() {
			t.Fatal("proposal carries a frozen version or a mirror — not a DRAFT Truth")
		}
		if proposal.IdeaID != out.ID {
			t.Fatal("proposal does not back-link to the harvested idea")
		}
		// harvest may never write a truth schema directly.
		for _, schema := range []string{"kernel", "mirrors", "fitness"} {
			if exploration.CheckHarvestWrite(schema) == nil {
				t.Fatalf("harvest allowed to write %q — the wall is breached", schema)
			}
			if exploration.CheckHarvestWrite(schema).Code != blockreason.CodeHarvestCannotFreeze {
				t.Fatalf("harvest write to %q not blocked with HARVEST_CANNOT_FREEZE", schema)
			}
		}
		// a non-truth schema is not harvest's concern.
		if exploration.CheckHarvestWrite("ideas") != nil {
			t.Fatal("harvest blocked a non-truth schema write")
		}
	})
}

// TestEngineIsDeterministic: same (idea, verdict) → identical routed idea.
func TestEngineIsDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := genIdea().Draw(t, "idea")
		verdict := rapid.SampledFrom(exploration.Verdicts()).Draw(t, "verdict")
		a, errA := exploration.Grill(in, verdict, "r")
		b, errB := exploration.Grill(in, verdict, "r")
		if (errA == nil) != (errB == nil) {
			t.Fatal("Grill not deterministic on the error path")
		}
		if errA == nil && a != b {
			t.Fatalf("Grill not deterministic: %+v vs %+v", a, b)
		}
	})
}
