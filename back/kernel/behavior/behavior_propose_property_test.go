package behavior_test

// S76 — the PROPOSE reproducibility mirror (rapid). The done-criteria say "l'expansion est un
// ChangeSet proposé, jamais une vérité appliquée" AND "code faisant autorité, source unique" — so
// Propose, like Expand, must be a PURE deterministic function: same record + attachment + parent
// phase ⇒ byte-identical DRAFT ChangeSet (same content-addressed id), ALWAYS DRAFT (never APPLIED).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/behavior"
	"pgregory.net/rapid"
)

func drawRecord(t *rapid.T) (behavior.Record, behavior.Attachment) {
	cat := behavior.Catalogue()
	k := cat[rapid.IntRange(0, len(cat)-1).Draw(t, "kind")]
	entity := rapid.StringMatching(`[A-Z][a-z]{0,8}`).Draw(t, "entity")
	owner := rapid.StringMatching(`[a-z]{1,8}`).Draw(t, "owner")
	ver := rapid.IntRange(1, 99).Draw(t, "version")
	tags := rapid.SliceOfN(rapid.StringMatching(`[a-z]{1,6}`), 0, 4).Draw(t, "tags")
	r := behavior.Record{Kind: k, Owner: owner, Version: ver, Tags: tags, Labels: map[string]string{"fr": "x"}}
	return r, behavior.Attachment{Behavior: k, Entity: entity}
}

func TestPropose_Deterministic_AlwaysDraft(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		r, a := drawRecord(t)
		p1, err1 := behavior.Propose(a, r, "phase-0")
		p2, err2 := behavior.Propose(a, r, "phase-0")
		if err1 != nil || err2 != nil {
			t.Fatalf("Propose errored on a valid record: %v / %v", err1, err2)
		}
		if p1.ChangeSet.ID != p2.ChangeSet.ID {
			t.Fatalf("non-deterministic Propose: changeset id %q != %q", p1.ChangeSet.ID, p2.ChangeSet.ID)
		}
		if p1.ChangeSet.Status != changeset.StatusDraft || p1.ChangeSet.AppliedAt != nil {
			t.Fatal("WALL: a proposed changeset must always be DRAFT and never APPLIED")
		}
		if p1.Expansion.WroteKernel {
			t.Fatal("WALL: the carried expansion wrote kernel truth")
		}
	})
}

func TestRecordID_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		r, _ := drawRecord(t)
		if behavior.RecordID(r) != behavior.RecordID(r) {
			t.Fatal("RecordID is not a stable content-address")
		}
	})
}
