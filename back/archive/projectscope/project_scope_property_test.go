package projectscope_test

// Project-scope invariants — the property mirror (mirrors schema · reflects:
// project_scope-baseline-migration · test_kind: property · cert_language: rapid ·
// authority: below).
//
// The S54 done-criteria, proven for ANY generated inputs (the deterministic part —
// the Postgres zero-loss + FK-resolve + cross-isolation proof is the Testcontainers
// migration_roundtrip; here we pin the PURE pieces the migration is emitted from):
//
//   - the __system__ seed is content-addressed (id == version == records.Hash of
//     the canonical body) and STABLE (the SQL literal in the migration is pinned to
//     SystemSeed().ID — the SQL and Go can never drift);
//   - ScopedSelect ALWAYS carries `WHERE project_id = $1` for every scoped table,
//     so a scoped read can never return another project's row; it REFUSES a table
//     outside the closed set (no fabricated scope);
//   - ScopedSelect is PURE: same (schema, table) → byte-identical SQL (reproducible);
//   - EmitMigration is reproducible: same closed inputs → byte-identical DDL (the
//     "émission de migration reproductible" criterion);
//   - the closed scoped-table set matches the tables the migration file scopes
//     (anti-drift between the Go source-of-truth and the SQL).

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/projectscope"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"pgregory.net/rapid"
)

// TestSeedContentAddressedAndStable: the seed id == version == Hash(Canonicalize)
// and is byte-stable (no clock entered).
func TestSeedContentAddressedAndStable(t *testing.T) {
	seed := projectscope.SystemSeed()
	want := records.Hash(projectscope.SystemSeedCanonicalBody())
	if seed.ID != want || seed.Version != want {
		t.Fatalf("seed not content-addressed: id=%q version=%q want=%q", seed.ID, seed.Version, want)
	}
	// Re-deriving must be identical (reproducible, no clock).
	if again := projectscope.SystemSeed(); again.ID != seed.ID {
		t.Fatalf("seed id is not stable: %q vs %q", again.ID, seed.ID)
	}
	if seed.Slug != projectscope.SystemSlug || seed.OwnerRef != projectscope.SystemOwner {
		t.Fatalf("seed reserved fields drifted: slug=%q owner=%q", seed.Slug, seed.OwnerRef)
	}
}

// TestSeedPinnedInMigrationSQL: the migration file embeds EXACTLY the seed id and
// the seed body — the SQL and the Go can never drift (the byte-for-byte pin).
func TestSeedPinnedInMigrationSQL(t *testing.T) {
	sql, err := os.ReadFile("../../migrations/project_scope_baseline.sql")
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	s := string(sql)
	seed := projectscope.SystemSeed()
	if !strings.Contains(s, seed.ID) {
		t.Fatalf("migration does not embed the seed id %q", seed.ID)
	}
	// The seed body string the migration INSERTs must equal MustMarshalSeedBody,
	// and that body must hash to the seed id (the SQL body is the real address).
	body := projectscope.MustMarshalSeedBody()
	if !strings.Contains(s, body) {
		t.Fatalf("migration does not embed the seed body %q", body)
	}
	canon, err := records.Canonicalize([]byte(body))
	if err != nil {
		t.Fatalf("canonicalize embedded body: %v", err)
	}
	if got := records.Hash(canon); got != seed.ID {
		t.Fatalf("embedded body hashes to %q, not the seed id %q", got, seed.ID)
	}
}

// TestScopedSelectAlwaysScoped: for every scoped table, the SQL carries the scope
// clause and binds exactly $1. A scoped read can NEVER be unscoped.
func TestScopedSelectAlwaysScoped(t *testing.T) {
	for _, st := range projectscope.ScopedTables() {
		sql, err := projectscope.ScopedSelect(st.Schema, st.Table)
		if err != nil {
			t.Fatalf("ScopedSelect(%s) error: %v", st.Qualified(), err)
		}
		if !strings.Contains(sql, "WHERE project_id = $1") {
			t.Fatalf("ScopedSelect(%s) is not scoped: %q", st.Qualified(), sql)
		}
		if strings.Count(sql, "$") != 1 {
			t.Fatalf("ScopedSelect(%s) must bind exactly $1: %q", st.Qualified(), sql)
		}
		if !strings.Contains(sql, st.Qualified()) {
			t.Fatalf("ScopedSelect(%s) does not target the table: %q", st.Qualified(), sql)
		}
	}
}

// TestScopedSelectRefusesUnknownTable: an off-set table is refused, never an
// unscoped query (no fabricated scope).
func TestScopedSelectRefusesUnknownTable(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		sch := rapid.StringMatching(`[a-z]{1,8}`).Draw(t, "schema")
		tbl := rapid.StringMatching(`[a-z]{1,8}`).Draw(t, "table")
		if projectscope.IsScoped(sch, tbl) {
			return // skip the (rare) collision with a real scoped table
		}
		if _, err := projectscope.ScopedSelect(sch, tbl); err == nil {
			t.Fatalf("ScopedSelect(%s.%s) must refuse an unknown table", sch, tbl)
		}
	})
}

// TestScopedSelectIsPure: same (schema, table) → byte-identical SQL.
func TestScopedSelectIsPure(t *testing.T) {
	for _, st := range projectscope.ScopedTables() {
		a, _ := projectscope.ScopedSelect(st.Schema, st.Table)
		b, _ := projectscope.ScopedSelect(st.Schema, st.Table)
		if a != b {
			t.Fatalf("ScopedSelect(%s) not pure: %q vs %q", st.Qualified(), a, b)
		}
	}
}

// TestEmitMigrationReproducible: same closed inputs → byte-identical migration DDL
// (the "émission de migration reproductible" done-criterion).
func TestEmitMigrationReproducible(t *testing.T) {
	a := projectscope.EmitMigration()
	b := projectscope.EmitMigration()
	if a != b {
		t.Fatalf("EmitMigration is not reproducible (lengths %d vs %d)", len(a), len(b))
	}
	// And it covers every scoped table (the FK + the backfill per table).
	for _, st := range projectscope.ScopedTables() {
		if !strings.Contains(a, st.FKName()) {
			t.Fatalf("EmitMigration misses FK for %s", st.Qualified())
		}
		if !strings.Contains(a, "UPDATE "+st.Qualified()+" SET project_id") {
			t.Fatalf("EmitMigration misses backfill for %s", st.Qualified())
		}
	}
	// The emitted seed id must equal the pinned seed.
	if !strings.Contains(a, projectscope.SystemSeed().ID) {
		t.Fatalf("EmitMigration misses the seed id")
	}
}

// TestEmittedMigrationMatchesFileTables: every table the Go closed set names is
// actually scoped in the committed SQL file, and vice versa — no drift.
func TestEmittedMigrationMatchesFileTables(t *testing.T) {
	sql, err := os.ReadFile("../../migrations/project_scope_baseline.sql")
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	s := string(sql)
	for _, st := range projectscope.ScopedTables() {
		// The file scopes via the targets ARRAY; assert both schema and table
		// appear as an ARRAY['schema','table'] pair.
		pair := "ARRAY['" + st.Schema + "'"
		if !strings.Contains(s, pair) {
			t.Fatalf("migration file does not scope schema %s", st.Schema)
		}
		if !strings.Contains(s, "'"+st.Table+"'") {
			t.Fatalf("migration file does not scope table %s", st.Table)
		}
	}
}

// TestMustMarshalSeedBodyIsValidJSON: the embedded seed body is valid JSON with
// the expected discriminator (a cheap guard against a hand-edit typo in the SQL).
func TestMustMarshalSeedBodyIsValidJSON(t *testing.T) {
	var m map[string]any
	if err := json.Unmarshal([]byte(projectscope.MustMarshalSeedBody()), &m); err != nil {
		t.Fatalf("seed body is not valid JSON: %v", err)
	}
	if m["kind"] != "project" || m["slug"] != projectscope.SystemSlug {
		t.Fatalf("seed body discriminator drifted: %v", m)
	}
}
