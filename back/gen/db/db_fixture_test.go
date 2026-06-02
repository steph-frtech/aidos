package db_test

// Fixture mirror (materialized from tests/runtime/db_projection.fixture.md):
//   reflects=gen.db.{EmitMigration,RequireMigration,DataTruthScope}
//   test_kind=schema-validation/fixture, cert_language=fixture, authority=above.
//
// These ARE the done criteria: the entity emits an expand-contract migration that
// dry-runs valid (half 1, see migration_dryrun_test.go for the Testcontainers leg) ∧ a
// historical-impact change requires a declared migration (half 2, §44.3).

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/gen/db"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/generators"
)

// Fixture A — additive change emits an EXPAND migration (ADD COLUMN), protected header +
// source_hash present, byte-identical re-emit.
func TestFixtureA_AdditiveEmitsExpand(t *testing.T) {
	prior := db.ExampleOrderPrior()
	got, br := db.EmitMigration(db.ExampleOrderNew(), &prior)
	if br != nil {
		t.Fatalf("emit blocked: %s", br.Code)
	}
	text := string(got.Bytes)
	if !strings.Contains(text, generators.ProtectedMarker) {
		t.Errorf("missing protected header marker; got:\n%s", text)
	}
	if !strings.Contains(text, "source: "+got.SourceHash) {
		t.Errorf("header source hash %q not present in:\n%s", got.SourceHash, text)
	}
	if got.Shape != "expand" {
		t.Errorf("additive change shape = %q, want expand", got.Shape)
	}
	if !strings.Contains(text, "ADD COLUMN") || !strings.Contains(text, "\"coupon\"") {
		t.Errorf("expand migration must ADD COLUMN coupon; got:\n%s", text)
	}
	// No in-place rewrite/drop of existing data.
	if strings.Contains(text, "DROP COLUMN") {
		t.Errorf("additive change must NOT drop a column; got:\n%s", text)
	}
	// source_hash == Hash(Canonicalize(SourceBody(new))) — S35/S02 reused.
	body, err := generators.SourceBody(db.ExampleOrderNew())
	if err != nil {
		t.Fatalf("source body: %v", err)
	}
	if want := records.Hash(body); got.SourceHash != want {
		t.Errorf("source_hash %q != Hash(Canonicalize(SourceBody)) %q", got.SourceHash, want)
	}
	// Byte-identical re-emit (determinism).
	again, _ := db.EmitMigration(db.ExampleOrderNew(), &prior)
	if string(again.Bytes) != text {
		t.Errorf("re-emit not byte-identical")
	}
}

// Fixture A' — no prior ⇒ the migration is the CREATE TABLE (the S35 EmitDDL shape).
func TestFixtureAPrime_NoPriorEmitsCreate(t *testing.T) {
	got, br := db.EmitMigration(db.ExampleOrderNew(), nil)
	if br != nil {
		t.Fatalf("emit blocked: %s", br.Code)
	}
	if got.Shape != "create" {
		t.Errorf("no-prior shape = %q, want create", got.Shape)
	}
	if !strings.Contains(string(got.Bytes), "CREATE TABLE") {
		t.Errorf("no-prior migration must CREATE TABLE; got:\n%s", string(got.Bytes))
	}
}

// Fixture B — a historical-impact change with NO declared migration is BLOCKED.
func TestFixtureB_HistoricalImpactRequiresMigration(t *testing.T) {
	required, br := db.RequireMigration(db.ExampleHistoricalChange())
	if !required {
		t.Errorf("historical-impact change must REQUIRE a migration")
	}
	if br == nil {
		t.Fatalf("historical-impact change with no scope must be BLOCKED")
	}
	if br.Code != blockreason.CodeHistoricalImpactRequiresMigration {
		t.Errorf("block code = %q, want HISTORICAL_IMPACT_REQUIRES_MIGRATION", br.Code)
	}
	if len(br.HowToFix) == 0 {
		t.Errorf("BlockReason must carry a non-empty how_to_fix (no prison)")
	}
}

// Fixture C — a declared DataTruthScope unblocks the historical-impact change, and the
// emitted narrowing migration is split expand→backfill→contract (never a single DROP).
func TestFixtureC_DeclaredScopeUnblocks(t *testing.T) {
	scope := db.ExampleDeclaredScope()
	c := db.ExampleHistoricalChange()
	c.Scope = &scope
	required, br := db.RequireMigration(c)
	if !required {
		t.Errorf("historical-impact change still requires a migration (now declared)")
	}
	if br != nil {
		t.Fatalf("a declared DataTruthScope must UNBLOCK the change; got %s", br.Code)
	}
	// The narrowing migration is split expand→backfill→contract (forward-only).
	prior := db.ExampleOrderPrior()
	got, ebr := db.EmitMigration(db.ExampleOrderNarrowed(), &prior)
	if ebr != nil {
		t.Fatalf("emit blocked: %s", ebr.Code)
	}
	if got.Shape != "expand_contract" {
		t.Errorf("narrowing change shape = %q, want expand_contract", got.Shape)
	}
	text := string(got.Bytes)
	for _, stage := range []string{"EXPAND", "BACKFILL", "CONTRACT"} {
		if !strings.Contains(text, stage) {
			t.Errorf("narrowing migration missing %s stage; got:\n%s", stage, text)
		}
	}
}

// Fixture D — a new-records-only change needs no historical migration.
func TestFixtureD_NewRecordsOnlyAllowed(t *testing.T) {
	required, br := db.RequireMigration(db.ExampleNewRecordsOnlyChange())
	if required {
		t.Errorf("new-records-only change must NOT require a historical migration")
	}
	if br != nil {
		t.Errorf("new-records-only change must be allowed; got %s", br.Code)
	}
}

// Fixture E — the DataTruthScope id is the content hash of its body (S02 reused).
func TestFixtureE_ScopeIDIsContentHash(t *testing.T) {
	scope := db.ExampleDeclaredScope()
	body, err := scope.CanonicalBody()
	if err != nil {
		t.Fatalf("canonical body: %v", err)
	}
	if want := records.Hash(body); scope.ID() != want {
		t.Errorf("scope.id %q != Hash(Canonicalize(body)) %q", scope.ID(), want)
	}
}

// Fixture F — an unknown migration strategy is rejected, not guessed.
func TestFixtureF_UnknownStrategyRejected(t *testing.T) {
	_, br := db.RequireMigration(db.ExampleUnknownStrategyChange())
	if br == nil {
		t.Fatalf("an unknown migration strategy must be BLOCKED")
	}
	if br.Code != blockreason.CodeUnknownMigrationStrategy {
		t.Errorf("block code = %q, want UNKNOWN_MIGRATION_STRATEGY", br.Code)
	}
}
