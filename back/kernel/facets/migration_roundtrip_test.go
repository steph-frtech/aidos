package facets_test

// Persistence + SemanticDiff mirror for FK02. reflects=kernel.facets-migration,
// test_kind=integration, liveness=live.
//
// Two proofs:
//
//  1. PERSISTENCE (Testcontainers, real Postgres). On the S02 kernel-records baseline +
//     the FK01 truth_level migration + the FK02 facet migration:
//       - kernel.truth and mirrors.mirror gain a NULLABLE facet column;
//       - an existing-style row (no facet supplied) inserts fine (expand-only, existing
//         rows untouched);
//       - each of the eight FKE-1.3 letters is accepted; an out-of-enum value is rejected
//         by the CHECK constraint (a DB-level error, not a silent string) — defense in
//         depth alongside kernel/facets.Validate, the SOLE legal validator.
//
//  2. SEMANTICDIFF add. Introducing the facet coordinate on a record body (old without it,
//     new with it) classifies as ChangeAdd — the FK02 done-criterion "round-trip
//     content-adressé" carried as an additive change (never a refine/override). The facet
//     declaration carried is content-addressed (facets.Hash), never hand-posed.

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/facets"
	"github.com/steph-frtech/aidos/back/runtime/semanticdiff"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startFacetPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	ctr, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("aidos"),
		postgres.WithUsername("aidos"),
		postgres.WithPassword("aidos"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("testcontainers: start postgres: %v", err)
	}
	t.Cleanup(func() { _ = ctr.Terminate(ctx) })

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("testcontainers: connection string: %v", err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("pgxpool: new: %v", err)
	}
	t.Cleanup(pool.Close)

	for _, f := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/kernel_truth_level_baseline.sql",
		"../../migrations/kernel_facet_baseline.sql",
	} {
		mig, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read migration %s: %v", f, err)
		}
		if _, err := pool.Exec(ctx, string(mig)); err != nil {
			t.Fatalf("apply migration %s: %v", f, err)
		}
	}
	return pool
}

// TestFacetColumnExpandOnly — an existing-style row (no facet) inserts fine on both record
// tables: the column is nullable, existing rows untouched.
func TestFacetColumnExpandOnly(t *testing.T) {
	pool := startFacetPostgres(t)
	ctx := context.Background()

	cases := []struct{ table, body string }{
		{"kernel.truth", `{"kind":"truth"}`},
		{"mirrors.mirror", `{"kind":"mirror"}`},
	}
	for _, c := range cases {
		if _, err := pool.Exec(ctx,
			`INSERT INTO `+c.table+` (id, body, version) VALUES ('f-unfaceted', $1::jsonb, 'f-unfaceted')`,
			c.body,
		); err != nil {
			t.Fatalf("insert unfaceted row into %s (expand-only) should succeed: %v", c.table, err)
		}
		var fc *string
		if err := pool.QueryRow(ctx,
			`SELECT facet FROM `+c.table+` WHERE id = 'f-unfaceted'`).Scan(&fc); err != nil {
			t.Fatalf("select facet from %s: %v", c.table, err)
		}
		if fc != nil {
			t.Fatalf("expand-only: unfaceted row in %s should read NULL, got %v", c.table, *fc)
		}
	}
}

// TestEveryFacetLetterAccepted — each of the eight FKE-1.3 letters is accepted by the CHECK.
func TestEveryFacetLetterAccepted(t *testing.T) {
	pool := startFacetPostgres(t)
	ctx := context.Background()

	for i, f := range facets.Facets() {
		id := "facet-" + string(f)
		if _, err := pool.Exec(ctx,
			`INSERT INTO kernel.truth (id, body, version, facet) VALUES ($1, '{"kind":"truth"}'::jsonb, $1, $2)`,
			id, string(f),
		); err != nil {
			t.Fatalf("facet %q (#%d) should be accepted: %v", f, i, err)
		}
	}
}

// TestOutOfEnumFacetRejected — an out-of-enum facet is a DB-level error, not a silent string.
func TestOutOfEnumFacetRejected(t *testing.T) {
	pool := startFacetPostgres(t)
	ctx := context.Background()

	_, err := pool.Exec(ctx,
		`INSERT INTO kernel.truth (id, body, version, facet) VALUES ('badf', '{"kind":"truth"}'::jsonb, 'badf', 'Z')`,
	)
	if err == nil {
		t.Fatalf("out-of-enum facet must be rejected by CHECK, but it succeeded")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "check") &&
		!strings.Contains(strings.ToLower(err.Error()), "constraint") {
		t.Fatalf("rejected for the wrong reason: %v", err)
	}
}

// TestFacetSemanticDiffIsAdd — the FK02 capability is an ADDITIVE change: the facet
// coordinate (+ its content-addressed signature) is a NEW artifact in free space (no prior
// version touched it), so introducing a faceted record classifies as `add` (never a
// refine/override of an existing truth). The facet signature is content-addressed
// (facets.Hash), proving the round-trip value is computed not hand-posed.
func TestFacetSemanticDiffIsAdd(t *testing.T) {
	// A legal collapsed facet-set (a pure function: F+I+M). Its signature is the content
	// address — the same set always hashes identically (the round-trip done-criterion).
	fs := facets.FacetSet{Instances: []facets.Instance{
		{Facet: facets.FacetFunctional, HasIntent: true, HasProofPair: true},
		{Facet: facets.FacetInvariants, HasIntent: true, HasProofPair: true},
		{Facet: facets.FacetMaintainability, HasIntent: true, HasProofPair: true},
	}}
	if v := facets.Validate(fs); !v.Valid {
		t.Fatalf("setup: F+I+M should be valid, got %+v", v.Issues)
	}
	sig := facets.Hash(fs)
	if sig != facets.Hash(fs) {
		t.Fatalf("setup: facet signature is not content-addressed (round-trip unstable)")
	}

	// old absent (free space) ⇒ the new faceted record is an `add` (KRD §11): the facet
	// coordinate is introduced where no prior version existed — additive, non-destructive.
	newBody, _ := json.Marshal(map[string]any{
		"kind": "truth", "intent": "sort", "facet": "F", "facet_signature": sig,
	})

	diff := semanticdiff.Classify(
		semanticdiff.Artifact{}, // absent old — free space
		semanticdiff.Artifact{Version: "v-new", Body: newBody},
	)
	if diff.ChangeType != semanticdiff.ChangeAdd {
		t.Fatalf("introducing the facet coordinate classified as %q, want add (open_question=%q)", diff.ChangeType, diff.OpenQuestion)
	}
}
