// Command materialize-db is the /project gesture for the db projection (S37): it emits
// the db-projection migration of the example Order entity to disk under back/gen/db/,
// carrying the protected header. It READS the entity source (here the in-repo example,
// the agent-side SELECT-only mirror of the kernel) and writes ONLY gen/ files BELOW the
// wall — it writes no truth. Re-running it is a no-op diff when no source changed
// (byte-identical, the determinism contract). gen/db is generated-only (CLAUDE.md
// §4/§9): to change the migration, change the SOURCE (the entity) and re-emit, never
// edit the output. The re-emit byte-equality guard (db_materialized_test.go) catches drift.
//
// The materialized artifact is the CREATE migration of the entity's current head
// (Order@new) — the faithful db projection of the entity (KRD line 532). The expand /
// expand-contract diffs are computed on demand against a prior head (EmitMigration with
// a non-nil prior); they are the forward-only ledger, not a single generated file.
//
// Usage (from back/): go run ./gen/db/cmd/materialize-db -root ..
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/steph-frtech/aidos/back/gen/db"
)

func main() {
	root := flag.String("root", "..", "repo root the relative artifact path resolves against (back/gen/db)")
	flag.Parse()

	art, br := db.EmitMigration(db.ExampleOrderNew(), nil)
	if br != nil {
		fmt.Fprintf(os.Stderr, "blocked: %s\n%s\n", br.Code, br.Explanation)
		os.Exit(1)
	}
	dst := filepath.Join(*root, art.Path)
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "mkdir %s: %v\n", dst, err)
		os.Exit(1)
	}
	if err := os.WriteFile(dst, art.Bytes, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "write %s: %v\n", dst, err)
		os.Exit(1)
	}
	fmt.Printf("materialized %s (source: %s, shape: %s)\n", art.Path, art.SourceHash, art.Shape)
}
