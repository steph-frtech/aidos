package datamigrate_test

// S95 — data-migration-of-the-emitted-app REPRODUCIBILITY + NO-LOSS mirror (property, rapid).
// reflects=runtime.datamigrate · test_kind=property · liveness=live.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): Build is a PURE function — same Change → byte-identical
// Plan (same id, same steps, same backfill SQL). These properties pin:
//   - reproducibility: re-planning the same change yields the identical plan id + steps;
//   - no-loss invariant: every accepted plan stages backfill BEFORE contract (PreservesAllData);
//   - the breaking gate: a breaking change with NO/insufficient backfill is ALWAYS refused
//     with BREAKING_MIGRATION_NO_BACKFILL — never a Plan;
//   - content-address sensitivity: distinct change names → distinct plan ids (no collision).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/gen/db"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/datamigrate"
	"pgregory.net/rapid"
)

func scopeR() *db.DataTruthScope {
	return &db.DataTruthScope{
		AppliesTo: []db.AppliesTo{db.AppliesExistingRecords},
		Migration: db.Migration{Required: true, Strategy: db.StrategyExpandContract},
		Audit:     db.Audit{PreserveOldTruth: true},
	}
}

// renameChangeR draws a random valid rename change (with a declared backfill).
func renameChangeR(t *rapid.T) datamigrate.Change {
	ident := rapid.StringMatching(`[a-z]{3,8}`)
	return datamigrate.Change{
		Project: rapid.StringMatching(`app-[a-z0-9]{4}`).Draw(t, "project"),
		Kind:    datamigrate.KindRename,
		Rename: &datamigrate.RenameChange{
			Entity: ident.Draw(t, "entity"),
			From:   ident.Draw(t, "from"),
			To:     ident.Draw(t, "to"),
			Type:   "text",
		},
		Scope: scopeR(),
	}
}

// Prop 1 — reproducibility: Build(c) == Build(c) (id + steps byte-identical).
func TestProp_Reproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		c := renameChangeR(t)
		p1, br1 := datamigrate.Build(c)
		p2, br2 := datamigrate.Build(c)
		if br1 != nil || br2 != nil {
			t.Fatalf("valid change refused: %v / %v", br1, br2)
		}
		if p1.ID != p2.ID {
			t.Fatalf("non-reproducible id: %q vs %q", p1.ID, p2.ID)
		}
		if len(p1.Steps) != len(p2.Steps) {
			t.Fatalf("step count differs")
		}
		for i := range p1.Steps {
			if p1.Steps[i] != p2.Steps[i] {
				t.Fatalf("step %d differs: %+v vs %+v", i, p1.Steps[i], p2.Steps[i])
			}
		}
	})
}

// Prop 2 — no-loss: every ACCEPTED plan (any kind) stages backfill before contract.
func TestProp_NoLoss(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		kind := rapid.SampledFrom(datamigrate.ChangeKinds()).Draw(t, "kind")
		ident := rapid.StringMatching(`[a-z]{3,8}`)
		c := datamigrate.Change{Project: "app", Kind: kind, Scope: scopeR()}
		switch kind {
		case datamigrate.KindRename:
			c.Rename = &datamigrate.RenameChange{Entity: ident.Draw(t, "e"), From: ident.Draw(t, "f"), To: ident.Draw(t, "to"), Type: "text"}
		case datamigrate.KindSplit:
			c.Split = &datamigrate.SplitChange{Source: ident.Draw(t, "s"), NewEntity: ident.Draw(t, "ne"), Column: ident.Draw(t, "col"), Type: "text"}
		case datamigrate.KindCardinality:
			c.Cardinality = &datamigrate.CardinalityChange{Source: ident.Draw(t, "src"), Target: ident.Draw(t, "tgt"), Relation: ident.Draw(t, "rel"), From: ref.OneToMany, To: ref.ManyToMany}
		}
		p, br := datamigrate.Build(c)
		if br != nil {
			t.Fatalf("valid change refused: %v", br)
		}
		if !p.PreservesAllData {
			t.Fatalf("plan does not preserve all data: %+v", p.Steps)
		}
		// Structural check: a contract step must be preceded by a backfill step.
		seenBackfill := false
		for _, s := range p.Steps {
			if s.Stage == "backfill" {
				seenBackfill = true
			}
			if s.Stage == "contract" && !seenBackfill {
				t.Fatalf("contract before backfill: %+v", p.Steps)
			}
		}
	})
}

// Prop 3 — the breaking gate: a breaking change with NO backfill is ALWAYS refused.
func TestProp_BreakingNoBackfillAlwaysRefused(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		c := renameChangeR(t)
		c.Scope = nil // strip the backfill
		p, br := datamigrate.Build(c)
		if br == nil {
			t.Fatalf("breaking change with no backfill accepted: %+v", p)
		}
		if br.Code != blockreason.CodeBreakingMigrationNoBackfill {
			t.Fatalf("refusal code = %q, want %q", br.Code, blockreason.CodeBreakingMigrationNoBackfill)
		}
	})
}

// Prop 4 — content-address sensitivity: two renames differing in the target column name
// yield distinct plan ids (no collision).
func TestProp_HashSensitive(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		c1 := renameChangeR(t)
		c2 := c1
		c2.Rename = &datamigrate.RenameChange{Entity: c1.Rename.Entity, From: c1.Rename.From, To: c1.Rename.To + "x", Type: "text"}
		p1, br1 := datamigrate.Build(c1)
		p2, br2 := datamigrate.Build(c2)
		if br1 != nil || br2 != nil {
			t.Fatalf("refused: %v / %v", br1, br2)
		}
		if p1.ID == p2.ID {
			t.Fatalf("distinct changes share a plan id %q", p1.ID)
		}
	})
}
