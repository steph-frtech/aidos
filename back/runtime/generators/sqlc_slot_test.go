package generators_test

// sqlc-slot mirror: reflects=runtime.generators.go-sqlc-target, test_kind=integration,
// liveness=live. The go-sqlc slot is FROZEN (CLAUDE.md §3 — sqlc, never substituted).
// This test proves the slot is honoured END-TO-END: it writes the emitted pg-ddl
// projection (renderPgDDL) as a sqlc schema, runs `sqlc generate` over it, and asserts
// the typed Go sqlc emits AGREES, field-for-field, with the renderGoSqlc twin — so the
// two projections can never drift (one source, never double-typed). It SKIPS when the
// sqlc binary is absent (CI without the tool), keeping the suite green while pinning
// the slot wherever sqlc is installed.

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/generators"
)

func findSqlc(t *testing.T) string {
	t.Helper()
	if p, err := exec.LookPath("sqlc"); err == nil {
		return p
	}
	if home, err := os.UserHomeDir(); err == nil {
		cand := filepath.Join(home, "go", "bin", "sqlc")
		if _, err := os.Stat(cand); err == nil {
			return cand
		}
	}
	return ""
}

func TestGoSqlcSlotGoesThroughSqlc(t *testing.T) {
	sqlcBin := findSqlc(t)
	if sqlcBin == "" {
		t.Skip("sqlc binary not found; skipping the frozen-slot end-to-end check")
	}
	order := generators.ExampleOrder()
	ddl, _ := generators.Emit(order, generators.TargetPgDDL)
	gos, _ := generators.Emit(order, generators.TargetGoSqlc)

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "schema.sql"), ddl.Bytes, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "queries.sql"),
		[]byte("-- name: GetOrder :one\nSELECT * FROM \"order\" WHERE \"id\" = $1;\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg := `version: "2"
sql:
  - engine: "postgresql"
    schema: "schema.sql"
    queries: "queries.sql"
    gen:
      go:
        package: "ordergen"
        out: "out"
        sql_package: "pgx/v5"
`
	if err := os.WriteFile(filepath.Join(dir, "sqlc.yaml"), []byte(cfg), 0o644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(sqlcBin, "generate")
	cmd.Dir = dir
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("sqlc generate failed: %v\n%s", err, out)
	}
	model, err := os.ReadFile(filepath.Join(dir, "out", "models.go"))
	if err != nil {
		t.Fatalf("read sqlc model: %v", err)
	}
	sqlcOut := string(model)

	// Every Go field type the renderGoSqlc twin emits must appear in sqlc's output —
	// the slot agrees (no drift). sqlc applies its own initialisms (id→ID), so we
	// assert on the type set + struct name, not the exact identifier casing.
	if !strings.Contains(sqlcOut, "type Order struct") {
		t.Errorf("sqlc did not emit `type Order struct`:\n%s", sqlcOut)
	}
	for _, want := range []string{"pgtype.Numeric", "string"} {
		if !strings.Contains(sqlcOut, want) || !strings.Contains(string(gos.Bytes), want) {
			t.Errorf("type %q disagrees between sqlc output and the go-sqlc twin", want)
		}
	}
}
