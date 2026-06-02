package db_test

// Re-emit byte-equality guard (S37): the materialized back/gen/db/order.sql on disk MUST
// equal what EmitMigration renders from the same entity source. A hand-edit of the
// generated migration (forbidden, CLAUDE.md §4/§9) is caught here — gen/ never drifts
// from its source. reflects=back/gen/db materialization, test_kind=integration
// (filesystem), liveness=live, authority=below.

import (
	"os"
	"testing"

	"github.com/steph-frtech/aidos/back/gen/db"
)

func TestMaterializedMigrationMatchesEmit(t *testing.T) {
	art, br := db.EmitMigration(db.ExampleOrderNew(), nil)
	if br != nil {
		t.Fatalf("EmitMigration BlockReason: %s", br.Code)
	}
	onDisk, err := os.ReadFile("order.sql")
	if err != nil {
		t.Skipf("materialized migration not present (run materialize-db): %v", err)
	}
	if string(onDisk) != string(art.Bytes) {
		t.Fatal("back/gen/db/order.sql drifted from EmitMigration output — gen/ is generated-only, never hand-edited")
	}
}
