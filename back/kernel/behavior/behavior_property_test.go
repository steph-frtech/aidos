package behavior_test

// CE04 — the behavior-macro EXPANSION reproducibility + idempotence mirror (RED FIRST,
// rapid). It pins the three load-bearing properties of the §24.6 done-criteria, on every
// catalogue behavior × arbitrary already-present shapes:
//
//   - DETERMINISM: same Attachment ⇒ byte-identical Expansion (same pieces, same
//     ExpansionID). The expansion is a pure function, not a learned/LLM judgment.
//   - IDEMPOTENCE: expanding a fresh attachment, then RE-attaching the same behavior to the
//     entity ALREADY CARRYING that first expansion's pieces, yields NOTHING new — the merged
//     shape is invariant under re-expansion (no duplicate columns, no duplicate policies).
//   - THE WALL: every expansion WroteKernel=false; the dry-run creates no truth (freezing
//     goes via /goal). ExpansionID is always a content-address (non-empty).
//
// These are the EXACT clauses of CE04's done-criteria: "l'expansion est déterministe (même
// behavior→même expansion) ∧ idempotente ∧ ne crée aucune vérité hors /goal."

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/behavior"
	"pgregory.net/rapid"
)

// drawAttachment draws an arbitrary valid attachment: a catalogue behavior, a non-empty
// entity name, and an arbitrary (possibly overlapping) already-present shape.
func drawAttachment(t *rapid.T) behavior.Attachment {
	cat := behavior.Catalogue()
	b := cat[rapid.IntRange(0, len(cat)-1).Draw(t, "behavior_idx")]
	entity := rapid.StringMatching(`[A-Z][a-z]{0,8}`).Draw(t, "entity")
	names := rapid.SliceOfN(rapid.StringMatching(`[a-z_]{1,10}`), 0, 6)
	return behavior.Attachment{
		Behavior: b,
		Entity:   entity,
		Existing: behavior.Shape{
			Attributes: names.Draw(t, "attrs"),
			Relations:  names.Draw(t, "rels"),
			Operations: names.Draw(t, "ops"),
			Policies:   names.Draw(t, "pols"),
			Fixtures:   names.Draw(t, "fixs"),
		},
	}
}

func TestExpand_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		a := drawAttachment(t)
		e1, err1 := behavior.Expand(a)
		e2, err2 := behavior.Expand(a)
		if err1 != nil || err2 != nil {
			t.Fatalf("Expand errored on a valid attachment: %v / %v", err1, err2)
		}
		if !reflect.DeepEqual(e1, e2) {
			t.Fatalf("non-deterministic expansion: %+v != %+v", e1, e2)
		}
		if e1.ExpansionID == "" || e1.ExpansionID != e2.ExpansionID {
			t.Fatalf("ExpansionID not a stable content-address: %q vs %q", e1.ExpansionID, e2.ExpansionID)
		}
	})
}

func TestExpand_Idempotent(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		a := drawAttachment(t)
		// Fresh expansion (whatever the existing shape already covered).
		first, err := behavior.Expand(a)
		if err != nil {
			t.Fatalf("Expand errored: %v", err)
		}
		// Re-attach the SAME behavior to the entity ALREADY carrying first's pieces (merge the
		// emitted names into the existing shape). A second expansion must emit NOTHING new.
		merged := a
		for _, x := range first.Attributes {
			merged.Existing.Attributes = append(merged.Existing.Attributes, x.Name)
		}
		for _, x := range first.Relations {
			merged.Existing.Relations = append(merged.Existing.Relations, x.Name)
		}
		for _, x := range first.Operations {
			merged.Existing.Operations = append(merged.Existing.Operations, x.Name)
		}
		for _, x := range first.Policies {
			merged.Existing.Policies = append(merged.Existing.Policies, x.Name)
		}
		for _, x := range first.Fixtures {
			merged.Existing.Fixtures = append(merged.Existing.Fixtures, x.Name)
		}
		second, err := behavior.Expand(merged)
		if err != nil {
			t.Fatalf("re-Expand errored: %v", err)
		}
		if n := behavior.PieceCount(second); n != 0 {
			t.Fatalf("idempotence broken: re-expansion emitted %d new pieces, want 0", n)
		}
	})
}

func TestExpand_WritesNoKernelTruth(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		a := drawAttachment(t)
		e, err := behavior.Expand(a)
		if err != nil {
			t.Fatalf("Expand errored: %v", err)
		}
		if e.WroteKernel {
			t.Fatal("WALL VIOLATION: expansion reports WroteKernel=true — the dry-run must write no truth (freeze via /goal)")
		}
		if e.ExpansionID == "" {
			t.Fatal("expansion has no content-address id")
		}
	})
}
