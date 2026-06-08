// regen_property_test.go — the S78 REPRODUCIBILITY mirror (∀, rapid). It pins the TWO
// done-criteria of « Régénérer mon app » as properties over a randomly-drawn project:
//
//   - BYTE-STABLE: Regenerate(schema,…) twice → byte-identical artifacts (same path, bytes,
//     output_hash), and INVARIANT to input order (entities/async permuted → identical
//     bytes). A pure composition of pure emitters satisfies this by construction; an LLM
//     never could (determinism-first, CLAUDE.md §6/§8).
//
//   - REFUSES A HAND-EDIT: take the faithful ledger of a clean emission, mutate one emitted
//     file's bytes on disk, and assert Regenerate REFUSES with CodeGenFileHandEdited — and
//     never returns a (silently-overwriting) Plan.
//
//   - NO-DRIFT ⇒ NO-REFUSE: with the on-disk bytes EQUAL to the freshly-emitted bytes, the
//     gate passes and the plan is returned (the gate refuses only a real hand-edit, never a
//     faithful tree).
package regen

import (
	"math/rand"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
	"github.com/steph-frtech/aidos/back/kernel/entities/relemit"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"pgregory.net/rapid"
)

// genName draws a short lowercase identifier (a valid entity/attr/relation token).
func genName(t *rapid.T, label string) string {
	return rapid.StringMatching(`[a-z]{3,8}`).Draw(t, label)
}

// genSchema draws a small, VALID multi-entity project schema: 2–4 entities each with an
// id + 1–2 scalar attrs, plus 0–2 relations from a later entity to an earlier one (so the
// target is always declared), plus 0–1 async op. Mirrors relemit's own generator so the
// regen property covers the same source space the S74 emitter covers.
func genSchema(t *rapid.T) relemit.Schema {
	n := rapid.IntRange(2, 4).Draw(t, "n_entities")
	names := map[string]bool{}
	var ents []relemit.EntityRelations
	var order []string
	for i := 0; i < n; i++ {
		var name string
		for {
			name = genName(t, "entity")
			if !names[name] {
				break
			}
		}
		names[name] = true
		order = append(order, name)
		attrs := []entities.Attribute{
			{Name: "id", Type: entities.TypeInt, Required: true, Identifier: true},
		}
		extra := rapid.IntRange(1, 2).Draw(t, "n_attrs")
		used := map[string]bool{"id": true}
		for j := 0; j < extra; j++ {
			var an string
			for {
				an = genName(t, "attr")
				if !used[an] {
					break
				}
			}
			used[an] = true
			ty := rapid.SampledFrom(entities.ScalarTypes()).Draw(t, "type")
			attrs = append(attrs, entities.Attribute{Name: an, Type: ty, Required: rapid.Bool().Draw(t, "req")})
		}
		ents = append(ents, relemit.EntityRelations{Entity: entities.Entity{Name: name, Attributes: attrs}})
	}
	for i := 1; i < len(ents); i++ {
		nr := rapid.IntRange(0, 2).Draw(t, "n_rel")
		usedRel := map[string]bool{}
		for k := 0; k < nr; k++ {
			target := order[rapid.IntRange(0, i-1).Draw(t, "target_idx")]
			var rn string
			for {
				rn = genName(t, "rel")
				if !usedRel[rn] {
					break
				}
			}
			usedRel[rn] = true
			card := rapid.SampledFrom(ref.Cardinalities()).Draw(t, "card")
			sem := rapid.SampledFrom(ref.Semantics()).Draw(t, "sem")
			ents[i].Relations = append(ents[i].Relations, ref.Relation{
				Name: rn, Target: target, Cardinality: card, Semantic: sem, Required: rapid.Bool().Draw(t, "rel_req"),
			})
		}
	}
	s := relemit.Schema{Project: "proj", Entities: ents}
	if rapid.Bool().Draw(t, "has_async") {
		s.AsyncOps = []relemit.AsyncOp{{
			Name: "op" + genName(t, "op"),
			Async: operation.Async{
				Trigger: operation.AsyncTrigger{Kind: operation.TriggerQueue},
				Effects: []operation.Effect{{Kind: operation.TriggerQueue, Target: "q", Payload: map[string]any{"a": 1}}},
			},
		}}
	}
	return s
}

// faithfulLedger builds the ledger a clean emission leaves: one entry per artifact, with
// the SourceHash + OutputHash the emitter recorded. A regeneration over a faithful ledger
// and faithful disk must refuse NOTHING and report everything Unchanged.
func faithfulLedger(arts []relemit.Artifact) []LedgerEntry {
	out := make([]LedgerEntry, 0, len(arts))
	for _, a := range arts {
		out = append(out, LedgerEntry{Path: a.Path, SourceHash: a.SourceHash, OutputHash: a.OutputHash})
	}
	return out
}

// faithfulDisk builds the on-disk state a clean emission leaves: one file per artifact with
// the EMITTED bytes verbatim.
func faithfulDisk(arts []relemit.Artifact) []DiskFile {
	out := make([]DiskFile, 0, len(arts))
	for _, a := range arts {
		out = append(out, DiskFile{Path: a.Path, Bytes: append([]byte(nil), a.Bytes...)})
	}
	return out
}

// TestRegenerate_ByteStable — the same project schema regenerated twice yields byte-
// identical artifacts (path, bytes, output_hash). The done-criterion: « la régénération
// est byte-stable ».
func TestRegenerate_ByteStable(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		s := genSchema(t)
		p1, br1 := Regenerate(s, nil, nil)
		p2, br2 := Regenerate(s, nil, nil)
		if br1 != nil || br2 != nil {
			t.Fatalf("clean regeneration must not refuse: %v / %v", br1, br2)
		}
		if len(p1.Artifacts) != len(p2.Artifacts) {
			t.Fatalf("artifact count diverged: %d vs %d", len(p1.Artifacts), len(p2.Artifacts))
		}
		for i := range p1.Artifacts {
			a, b := p1.Artifacts[i], p2.Artifacts[i]
			if a.Path != b.Path {
				t.Fatalf("path diverged at %d: %q vs %q", i, a.Path, b.Path)
			}
			if string(a.Bytes) != string(b.Bytes) {
				t.Fatalf("bytes diverged for %q (not byte-stable)", a.Path)
			}
			if a.OutputHash != b.OutputHash {
				t.Fatalf("output_hash diverged for %q: %q vs %q", a.Path, a.OutputHash, b.OutputHash)
			}
		}
	})
}

// TestRegenerate_OrderInvariant — permuting the entities/async of the input schema yields
// byte-identical artifacts (the emitter canonicalises before rendering). Project source
// ORDER is not semantic.
func TestRegenerate_OrderInvariant(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		s := genSchema(t)
		base, br := Regenerate(s, nil, nil)
		if br != nil {
			t.Fatalf("clean regeneration refused: %v", br)
		}
		// Permute entities + async deterministically from a drawn seed.
		seed := rapid.Int64().Draw(t, "seed")
		rng := rand.New(rand.NewSource(seed))
		perm := relemit.Schema{Project: s.Project}
		perm.Entities = append(perm.Entities, s.Entities...)
		rng.Shuffle(len(perm.Entities), func(i, j int) {
			perm.Entities[i], perm.Entities[j] = perm.Entities[j], perm.Entities[i]
		})
		perm.AsyncOps = append(perm.AsyncOps, s.AsyncOps...)
		rng.Shuffle(len(perm.AsyncOps), func(i, j int) {
			perm.AsyncOps[i], perm.AsyncOps[j] = perm.AsyncOps[j], perm.AsyncOps[i]
		})
		permuted, br2 := Regenerate(perm, nil, nil)
		if br2 != nil {
			t.Fatalf("permuted regeneration refused: %v", br2)
		}
		if len(base.Artifacts) != len(permuted.Artifacts) {
			t.Fatalf("artifact count diverged under permutation")
		}
		for i := range base.Artifacts {
			if string(base.Artifacts[i].Bytes) != string(permuted.Artifacts[i].Bytes) {
				t.Fatalf("bytes diverged under input permutation for %q", base.Artifacts[i].Path)
			}
		}
	})
}

// TestRegenerate_RefusesHandEdit — with a faithful ledger, mutating ONE emitted file's
// on-disk bytes makes Regenerate refuse with CodeGenFileHandEdited and return an empty
// plan (no silent overwrite). The done-criterion: « refuse si un fichier généré est
// hand-edité ».
func TestRegenerate_RefusesHandEdit(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		s := genSchema(t)
		arts, br := relemit.EmitAll(s)
		if br != nil {
			t.Fatalf("EmitAll refused a valid schema: %v", br)
		}
		ledger := faithfulLedger(arts)
		disk := faithfulDisk(arts)
		// Hand-edit exactly one file (drawn index) by appending a byte — its hash now
		// diverges from the recorded OutputHash.
		idx := rapid.IntRange(0, len(disk)-1).Draw(t, "edit_idx")
		disk[idx].Bytes = append(disk[idx].Bytes, byte('X'))
		// Sanity: the edit really drifted (it is not the recorded hash anymore).
		if !Drifted(ledger[idx].OutputHash, disk[idx].Bytes) {
			t.Fatalf("the constructed hand-edit did not drift (test setup bug)")
		}
		plan, refusal := Regenerate(s, ledger, disk)
		if refusal == nil {
			t.Fatalf("a hand-edited gen/ file must refuse the regeneration, got nil")
		}
		if refusal.Code != blockreason.CodeGenFileHandEdited {
			t.Fatalf("wrong refusal code: %q (want GEN_FILE_HAND_EDITED)", refusal.Code)
		}
		if len(refusal.HowToFix) == 0 {
			t.Fatalf("a BlockReason with no how_to_fix is a prison (forbidden)")
		}
		if len(plan.Artifacts) != 0 {
			t.Fatalf("a refused regeneration must return an EMPTY plan (no partial overwrite)")
		}
	})
}

// TestRegenerate_FaithfulTree_NoRefuse — when the on-disk bytes EQUAL the emitted bytes and
// the ledger is faithful, the gate passes: no refusal, every artifact classified Unchanged
// (the gate refuses a real hand-edit, never a faithful tree — no false positive).
func TestRegenerate_FaithfulTree_NoRefuse(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		s := genSchema(t)
		arts, br := relemit.EmitAll(s)
		if br != nil {
			t.Fatalf("EmitAll refused a valid schema: %v", br)
		}
		ledger := faithfulLedger(arts)
		disk := faithfulDisk(arts)
		plan, refusal := Regenerate(s, ledger, disk)
		if refusal != nil {
			t.Fatalf("a faithful tree must not refuse, got %q", refusal.Code)
		}
		if len(plan.Unchanged) != len(arts) {
			t.Fatalf("a faithful tree must be all-Unchanged: %d/%d", len(plan.Unchanged), len(arts))
		}
		if len(plan.Stale) != 0 || len(plan.Fresh) != 0 {
			t.Fatalf("a faithful tree has no stale/fresh files")
		}
	})
}

// TestRegenerate_StaleBySourceHash — when the ledger's SourceHash for a path differs from
// the freshly-emitted artifact's SourceHash (the source moved), the path is classified
// Stale; a never-recorded path is Fresh. Staleness is detected by source-hash, per the
// done-criterion.
func TestRegenerate_StaleBySourceHash(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		s := genSchema(t)
		arts, br := relemit.EmitAll(s)
		if br != nil {
			t.Fatalf("EmitAll refused: %v", br)
		}
		// A ledger whose every SourceHash is a DIFFERENT (impossible) value ⇒ every path is
		// stale. OutputHash is set to the faithful value so the hand-edit gate passes (disk
		// is faithful too).
		ledger := make([]LedgerEntry, 0, len(arts))
		for _, a := range arts {
			ledger = append(ledger, LedgerEntry{
				Path:       a.Path,
				SourceHash: records.Hash([]byte("moved-" + a.SourceHash)),
				OutputHash: a.OutputHash,
			})
		}
		disk := faithfulDisk(arts)
		plan, refusal := Regenerate(s, ledger, disk)
		if refusal != nil {
			t.Fatalf("a faithful (un-edited) tree must not refuse, got %q", refusal.Code)
		}
		if len(plan.Stale) != len(arts) {
			t.Fatalf("every moved-source path must be stale: %d/%d", len(plan.Stale), len(arts))
		}
		// And an empty ledger ⇒ everything Fresh.
		freshPlan, _ := Regenerate(s, nil, disk)
		if len(freshPlan.Fresh) != len(arts) {
			t.Fatalf("an empty ledger must classify every path Fresh: %d/%d", len(freshPlan.Fresh), len(arts))
		}
	})
}
