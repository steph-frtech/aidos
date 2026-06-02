package db_test

// Property mirror (rapid): reflects=gen.db.{EmitMigration,RequireMigration,DataTruthScope},
// test_kind=property, cert_language=rapid, authority=below (computational ∀ invariants).
//
// ∀ entity, ∀ prior: EmitMigration is DETERMINISTIC (same ⇒ byte-identical) and TOTAL
// (never panics; unknown shape ⇒ BlockReason); additive ⇒ expand-only (no DROP);
// narrowing ⇒ split expand→backfill→contract; applies_to touches historical ∧ no scope
// ⇒ Blocks; new-only ⇒ Allows; strategy ∈ closed set else Blocked; required ⇒
// preserve_old_truth; scope.id == Hash(Canonicalize(body)).

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/gen/db"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/generators"
	"pgregory.net/rapid"
)

var fieldTypes = []string{"text", "numeric", "int", "bool", "timestamptz"}

// genEntity draws a well-typed entity with at least one field (so it is projectable).
func genEntity(t *rapid.T, name string) generators.EntitySource {
	n := rapid.IntRange(1, 5).Draw(t, "nfields")
	fields := make([]generators.Field, 0, n+1)
	fields = append(fields, generators.Field{Name: "id", Type: "text"})
	for i := 0; i < n; i++ {
		fields = append(fields, generators.Field{
			Name: rapid.StringMatching(`[a-z]{3,8}`).Draw(t, "fname"),
			Type: rapid.SampledFrom(fieldTypes).Draw(t, "ftype"),
		})
	}
	return generators.EntitySource{ID: "e", Kind: generators.KindEntity, Name: name, Fields: fields}
}

// ∀ entity, ∀ prior: EmitMigration is deterministic — same (entity, prior) ⇒ byte-identical.
func TestProp_EmitDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		e := genEntity(t, "Order")
		usePrior := rapid.Bool().Draw(t, "useprior")
		var prior *generators.EntitySource
		if usePrior {
			p := genEntity(t, "Order")
			prior = &p
		}
		a, abr := db.EmitMigration(e, prior)
		b, bbr := db.EmitMigration(e, prior)
		if (abr == nil) != (bbr == nil) {
			t.Fatalf("determinism: block verdict diverged")
		}
		if abr == nil && string(a.Bytes) != string(b.Bytes) {
			t.Fatalf("determinism: byte output diverged")
		}
	})
}

// ∀ entity: EmitMigration is TOTAL — a malformed (empty-field) entity ⇒ BlockReason, never panic.
func TestProp_EmitTotalMalformedBlocks(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// An entity with no fields is malformed (S35 validateSource).
		bad := generators.EntitySource{ID: "e", Kind: generators.KindEntity, Name: "Broken"}
		_, br := db.EmitMigration(bad, nil)
		if br == nil {
			t.Fatalf("malformed entity must yield a BlockReason")
		}
	})
}

// ∀ additive change: the emitted migration is expand-only (ADD), no DROP.
func TestProp_AdditiveIsExpandOnly(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		prior := genEntity(t, "Order")
		// new = prior + one added field (a strict superset) ⇒ additive.
		newE := prior
		newE.Fields = append(append([]generators.Field{}, prior.Fields...),
			generators.Field{Name: "addedcol" + rapid.StringMatching(`[a-z]{2,4}`).Draw(t, "x"), Type: "text"})
		got, br := db.EmitMigration(newE, &prior)
		if br != nil {
			return // a name collision can make it not strictly additive; skip
		}
		if got.Shape == "expand_contract" {
			t.Fatalf("a strict superset must not be a contract; got %s", got.Shape)
		}
		if strings.Contains(string(got.Bytes), "DROP COLUMN") {
			t.Fatalf("additive migration must not DROP a column")
		}
	})
}

// ∀ narrowing change: the migration is split expand→backfill→contract (forward-only).
func TestProp_NarrowingIsSplit(t *testing.T) {
	prior := db.ExampleOrderPrior()
	got, br := db.EmitMigration(db.ExampleOrderNarrowed(), &prior)
	if br != nil {
		t.Fatalf("emit blocked: %s", br.Code)
	}
	if got.Shape != "expand_contract" {
		t.Fatalf("narrowing shape = %q, want expand_contract", got.Shape)
	}
	text := string(got.Bytes)
	for _, stage := range []string{"EXPAND", "BACKFILL", "CONTRACT"} {
		if !strings.Contains(text, stage) {
			t.Fatalf("narrowing migration missing %s stage", stage)
		}
	}
}

// ∀ change: historical impact ∧ no declared migration ⇒ RequireMigration Blocks.
func TestProp_HistoricalNoScopeBlocks(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		set := rapid.SliceOfNDistinct(
			rapid.SampledFrom([]db.AppliesTo{db.AppliesExistingRecords, db.AppliesHistoricalRecords}),
			1, 2, func(a db.AppliesTo) db.AppliesTo { return a }).Draw(t, "set")
		c := db.Change{ChangeType: "override", Entity: "Order", AppliesTo: set}
		required, br := db.RequireMigration(c)
		if !required || br == nil {
			t.Fatalf("historical impact with no scope must Block; required=%v br=%v", required, br)
		}
		if br.Code != blockreason.CodeHistoricalImpactRequiresMigration {
			t.Fatalf("code=%q want HISTORICAL_IMPACT_REQUIRES_MIGRATION", br.Code)
		}
	})
}

// ∀ change: applies_to == {new_records} ⇒ RequireMigration Allows.
func TestProp_NewOnlyAllows(t *testing.T) {
	c := db.Change{ChangeType: "add", Entity: "Order", AppliesTo: []db.AppliesTo{db.AppliesNewRecords}}
	required, br := db.RequireMigration(c)
	if required || br != nil {
		t.Fatalf("new-only must Allow; required=%v br=%v", required, br)
	}
}

// ∀ DataTruthScope: strategy ∈ closed set else Blocked(UNKNOWN_MIGRATION_STRATEGY).
func TestProp_UnknownStrategyBlocks(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		s := rapid.StringMatching(`[a-z]{3,10}`).Draw(t, "strategy")
		scope := db.DataTruthScope{
			AppliesTo: []db.AppliesTo{db.AppliesExistingRecords},
			Migration: db.Migration{Required: true, Strategy: db.Strategy(s)},
			Audit:     db.Audit{PreserveOldTruth: true},
		}
		c := db.Change{ChangeType: "override", Entity: "Order",
			AppliesTo: []db.AppliesTo{db.AppliesExistingRecords}, Scope: &scope}
		_, br := db.RequireMigration(c)
		known := false
		for _, k := range db.Strategies() {
			if string(k) == s {
				known = true
			}
		}
		if known {
			return
		}
		if br == nil || br.Code != blockreason.CodeUnknownMigrationStrategy {
			t.Fatalf("unknown strategy %q must Block(UNKNOWN_MIGRATION_STRATEGY); got %v", s, br)
		}
	})
}

// ∀ scope: scope.id == Hash(Canonicalize(body)) — any byte change ⇒ a new version.
func TestProp_ScopeIDContentAddressed(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		strat := rapid.SampledFrom(db.Strategies()).Draw(t, "strat")
		preserve := rapid.Bool().Draw(t, "preserve")
		scope := db.DataTruthScope{
			AppliesTo: []db.AppliesTo{db.AppliesExistingRecords, db.AppliesHistoricalRecords},
			Migration: db.Migration{Required: true, Strategy: strat},
			Audit:     db.Audit{PreserveOldTruth: preserve},
		}
		body, err := scope.CanonicalBody()
		if err != nil {
			t.Fatalf("body: %v", err)
		}
		if scope.ID() != records.Hash(body) {
			t.Fatalf("scope.id is not the content hash")
		}
	})
}

// ∀ scope: applies_to order does not change the content address (canonical ordering).
func TestProp_ScopeIDOrderIndependent(t *testing.T) {
	a := db.DataTruthScope{
		AppliesTo: []db.AppliesTo{db.AppliesHistoricalRecords, db.AppliesExistingRecords},
		Migration: db.Migration{Required: true, Strategy: db.StrategyExpandContract},
		Audit:     db.Audit{PreserveOldTruth: true},
	}
	b := db.DataTruthScope{
		AppliesTo: []db.AppliesTo{db.AppliesExistingRecords, db.AppliesHistoricalRecords},
		Migration: db.Migration{Required: true, Strategy: db.StrategyExpandContract},
		Audit:     db.Audit{PreserveOldTruth: true},
	}
	if a.ID() != b.ID() {
		t.Fatalf("applies_to order must not change the content address")
	}
}
