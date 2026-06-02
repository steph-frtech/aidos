// Property mirror (rapid, ∀, below the line, computational) for the RealityMirror
// (AIDOS step S43). reflects: runtime.reality.{Observe,Learn,ToIdea,ToKernel} ·
// test_kind: property · cert_language: rapid · authority: below · liveness: alive.
//
// It is the REPRODUCIBILITY mirror (CLAUDE.md §6 determinism-first): the reality functions
// are pure, total, deterministic over their inputs (same input ⇒ same output) and never
// panic. The invariants (KRD §53/§67/§117/§1099):
//
//	(1) Learn carries the incident ref VERBATIM as the idea provenance, and NEVER invents
//	    intent/proposes when the signal doesn't pin them (unset proposes ⇒ OpenQuestion);
//	(2) the produced idea never carries a version/freeze nor a mirror (unrepresentable);
//	(3) ToKernel ALWAYS returns REALITY_CANNOT_DECLARE_TRUTH and never writes the kernel —
//	    for EVERY incident, regardless of recurrence/taint;
//	(4) Observe is append-only-friendly: re-observing increments recurrence, never shrinks;
//	(5) id == content hash of the canonical body (content-addressing);
//	(6) the only outward edge is → the S27 idea (ToIdea); there is no path to kernel/mirrors.
package reality_test

import (
	"strings"
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/reality"
)

// genIncident draws an arbitrary Incident: any ref/operation/error, any recurrence, any
// subset of the closed taint enum (including the empty set — Observe guarantees
// incident_derived regardless), any cause sketch.
func genIncident(t *rapid.T) reality.Incident {
	all := firewall.Taints()
	taint := []firewall.Taint{}
	for _, tt := range all {
		if rapid.Bool().Draw(t, "include-"+string(tt)) {
			taint = append(taint, tt)
		}
	}
	inc, err := reality.Observe(reality.ObserveInput{
		Ref: "#" + rapid.StringMatching(`[0-9]{1,6}`).Draw(t, "ref"),
		Signal: reality.Signal{
			Operation:  rapid.StringMatching(`[a-zA-Z]{0,12}`).Draw(t, "operation"),
			Error:      rapid.String().Draw(t, "error"),
			Recurrence: rapid.IntRange(1, 100000).Draw(t, "recurrence"),
		},
		CauseSketch:    rapid.String().Draw(t, "cause"),
		Taint:          taint,
		LinkedBranches: rapid.SliceOfN(rapid.StringMatching(`[a-z][a-z0-9/-]{0,8}`), 0, 3).Draw(t, "branches"),
	})
	if err != nil {
		t.Fatalf("Observe: %v", err)
	}
	return inc
}

// Inv (5) — id is the content hash of the canonical body; Observe always tags incident_derived.
func TestProp_Observe_ContentAddressed_AndTainted(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		inc := genIncident(t)
		canon, err := inc.CanonicalBody()
		if err != nil {
			t.Fatalf("CanonicalBody: %v", err)
		}
		if want := records.Hash(canon); inc.ID != want {
			t.Fatalf("id is not the content hash: got %q want %q", inc.ID, want)
		}
		// incident_derived is guaranteed present (reality always carries the taint).
		found := false
		for _, tt := range inc.Taint {
			if tt == firewall.TaintIncidentDerived {
				found = true
			}
		}
		if !found {
			t.Fatalf("Observe must guarantee the incident_derived taint: %v", inc.Taint)
		}
		// no version/mirror key in the canonical body.
		body := string(canon)
		if strings.Contains(body, `"version"`) || strings.Contains(body, `"mirror"`) {
			t.Fatalf("an incident must carry no version and no mirror; body=%s", body)
		}
	})
}

// Inv (1)+(2) — Learn carries the ref verbatim, never invents proposes (unset ⇒ OpenQuestion),
// and the idea never carries a version/freeze nor a mirror.
func TestProp_Learn_ProvenanceVerbatim_NoInventedProposes_NoFreeze(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		inc := genIncident(t)
		cand, err := reality.Learn(inc)
		if err != nil {
			t.Fatalf("Learn: %v", err)
		}
		// provenance verbatim.
		if cand.Idea.Provenance.Source != ideas.ProvenanceIncident {
			t.Fatalf("provenance source must be incident: %q", cand.Idea.Provenance.Source)
		}
		if cand.Idea.Provenance.Detail != inc.Ref {
			t.Fatalf("provenance detail must be the incident ref verbatim: got %q want %q",
				cand.Idea.Provenance.Detail, inc.Ref)
		}
		// it is a draft.
		if cand.Idea.Status != ideas.StatusDraft {
			t.Fatalf("learned idea must be draft: %q", cand.Idea.Status)
		}
		// proposes is NEVER invented: pinned ⇔ a non-empty proposes ⇔ no OpenQuestion.
		if cand.ProposesPinned {
			if cand.Idea.Proposes == "" {
				t.Fatalf("pinned proposes must be set")
			}
			if cand.OpenQuestion != "" {
				t.Fatalf("a pinned proposes must carry no OpenQuestion: %q", cand.OpenQuestion)
			}
		} else {
			if cand.Idea.Proposes != "" {
				t.Fatalf("unpinned proposes must be left UNSET (not guessed): %q", cand.Idea.Proposes)
			}
			if cand.OpenQuestion == "" {
				t.Fatalf("an unpinned proposes must surface an OpenQuestion")
			}
		}
		// the idea carries no version and no mirror.
		canon, err := ideas.Canonicalize(cand.Idea)
		if err != nil {
			t.Fatalf("Canonicalize idea: %v", err)
		}
		body := string(canon)
		if strings.Contains(body, `"version"`) || strings.Contains(body, `"mirror"`) {
			t.Fatalf("the learned idea must carry no version and no mirror; body=%s", body)
		}
		// Learn never writes the kernel.
		if cand.WroteKernel {
			t.Fatalf("Learn must never write the kernel")
		}
		// determinism: the same incident yields the same idea id.
		cand2, err := reality.Learn(inc)
		if err != nil {
			t.Fatalf("Learn (replay): %v", err)
		}
		if cand2.Idea.ID != cand.Idea.ID {
			t.Fatalf("Learn must be deterministic: %q != %q", cand2.Idea.ID, cand.Idea.ID)
		}
	})
}

// Inv (3) — ToKernel ALWAYS blocks with REALITY_CANNOT_DECLARE_TRUTH for EVERY incident.
func TestProp_ToKernel_AlwaysBlocks(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		inc := genIncident(t)
		br := reality.ToKernel(inc)
		if br == nil {
			t.Fatalf("ToKernel must ALWAYS block (got nil — a kernel write would occur)")
		}
		if string(br.Code) != "REALITY_CANNOT_DECLARE_TRUTH" {
			t.Fatalf("ToKernel code: got %q want REALITY_CANNOT_DECLARE_TRUTH", br.Code)
		}
		if len(br.HowToFix) == 0 {
			t.Fatalf("a BlockReason with an empty how_to_fix is a prison (forbidden)")
		}
	})
}

// Inv (4) — re-observing the same incident with a higher recurrence never shrinks the
// recurrence; Observe is deterministic (same input ⇒ same id).
func TestProp_Observe_RecurrenceNeverShrinks_AndDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		inc := genIncident(t)
		// re-observe identical input ⇒ identical id (content-addressed, deterministic).
		inc2, err := reality.Observe(reality.ObserveInput{
			Ref:            inc.Ref,
			Signal:         inc.Signal,
			CauseSketch:    inc.CauseSketch,
			Taint:          inc.Taint,
			LinkedBranches: inc.LinkedBranches,
		})
		if err != nil {
			t.Fatalf("Observe (replay): %v", err)
		}
		if inc2.ID != inc.ID {
			t.Fatalf("Observe must be deterministic: %q != %q", inc2.ID, inc.ID)
		}
		// a higher recurrence is monotone (append-only): the new count is >= the old.
		bump := rapid.IntRange(0, 1000).Draw(t, "bump")
		incNext, err := reality.Observe(reality.ObserveInput{
			Ref:            inc.Ref,
			Signal:         reality.Signal{Operation: inc.Signal.Operation, Error: inc.Signal.Error, Recurrence: inc.Signal.Recurrence + bump},
			CauseSketch:    inc.CauseSketch,
			Taint:          inc.Taint,
			LinkedBranches: inc.LinkedBranches,
		})
		if err != nil {
			t.Fatalf("Observe (bump): %v", err)
		}
		if incNext.Signal.Recurrence < inc.Signal.Recurrence {
			t.Fatalf("recurrence must never shrink: %d < %d", incNext.Signal.Recurrence, inc.Signal.Recurrence)
		}
	})
}
