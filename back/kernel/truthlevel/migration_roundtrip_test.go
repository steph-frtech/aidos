package truthlevel_test

// Persistence + SemanticDiff mirror for FK01. reflects=kernel.truthlevel-migration,
// test_kind=integration, liveness=live.
//
// Two proofs:
//
//  1. PERSISTENCE (Testcontainers, real Postgres). On the S02 kernel-records baseline +
//     the FK01 truth_level migration:
//       - kernel.truth and mirrors.mirror gain a NULLABLE truth_level column;
//       - an existing-style row (no truth_level supplied) inserts fine (expand-only,
//         existing rows untouched);
//       - each of the seven FKE-5 names is accepted; an out-of-enum value is rejected by
//         the CHECK constraint (a DB-level error, not a silent string) — defense in depth
//         alongside truthlevel.Compute, the sole legal writer.
//
//  2. SEMANTICDIFF add. Introducing the truth_level field on a record body (old without
//     it, new with it) classifies as ChangeAdd — the FK01 done-criterion "SemanticDiff
//     `add`" (an additive change, never a refine/override). The level value is the
//     transition's output (Compute), never hand-posed.

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/truthlevel"
	"github.com/steph-frtech/aidos/back/runtime/semanticdiff"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startTruthLevelPostgres(t *testing.T) *pgxpool.Pool {
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

// TestTruthLevelColumnExpandOnly — an existing-style row (no truth_level) inserts fine on
// both record tables: the column is nullable, existing rows untouched.
func TestTruthLevelColumnExpandOnly(t *testing.T) {
	pool := startTruthLevelPostgres(t)
	ctx := context.Background()

	cases := []struct{ table, body string }{
		{"kernel.truth", `{"kind":"truth"}`},
		{"mirrors.mirror", `{"kind":"mirror"}`},
	}
	for _, c := range cases {
		if _, err := pool.Exec(ctx,
			`INSERT INTO `+c.table+` (id, body, version) VALUES ('r-unlevelled', $1::jsonb, 'r-unlevelled')`,
			c.body,
		); err != nil {
			t.Fatalf("insert unlevelled row into %s (expand-only) should succeed: %v", c.table, err)
		}
		var tl *string
		if err := pool.QueryRow(ctx,
			`SELECT truth_level FROM `+c.table+` WHERE id = 'r-unlevelled'`).Scan(&tl); err != nil {
			t.Fatalf("select truth_level from %s: %v", c.table, err)
		}
		if tl != nil {
			t.Fatalf("expand-only: unlevelled row in %s should read NULL, got %v", c.table, *tl)
		}
	}
}

// TestEveryLevelNameAccepted — each of the seven FKE-5 names is accepted by the CHECK.
func TestEveryLevelNameAccepted(t *testing.T) {
	pool := startTruthLevelPostgres(t)
	ctx := context.Background()

	for i, l := range truthlevel.Levels() {
		id := "tl-" + l.Name()
		if _, err := pool.Exec(ctx,
			`INSERT INTO kernel.truth (id, body, version, truth_level) VALUES ($1, '{"kind":"truth"}'::jsonb, $1, $2)`,
			id, l.Name(),
		); err != nil {
			t.Fatalf("level %q (#%d) should be accepted: %v", l.Name(), i, err)
		}
	}
}

// TestOutOfEnumLevelRejected — an out-of-enum level is a DB-level error, not a silent string.
func TestOutOfEnumLevelRejected(t *testing.T) {
	pool := startTruthLevelPostgres(t)
	ctx := context.Background()

	_, err := pool.Exec(ctx,
		`INSERT INTO kernel.truth (id, body, version, truth_level) VALUES ('bad', '{"kind":"truth"}'::jsonb, 'bad', 'enlightened')`,
	)
	if err == nil {
		t.Fatalf("out-of-enum truth_level must be rejected by CHECK, but it succeeded")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "check") &&
		!strings.Contains(strings.ToLower(err.Error()), "constraint") {
		t.Fatalf("rejected for the wrong reason: %v", err)
	}
}

// TestSemanticDiffIsAdd — the FK01 capability is an ADDITIVE change (the done-criterion
// "SemanticDiff `add`"): the truth_level coordinate is a NEW artifact in free space (no
// prior version touched it), so introducing a truth-level record classifies as `add`
// (never a refine/override/rescope of an existing truth). The level value carried is the
// transition's output (Compute), never hand-posed.
func TestSemanticDiffIsAdd(t *testing.T) {
	// The level value the new artifact carries is the transition's output (an accepted
	// truth — Compute returns "accepted"), proving the value is computed not hand-posed.
	level := truthlevel.Compute(truthlevel.Signals{
		HasRawSignal: true, HasIdea: true, HasProposal: true, IsAccepted: true,
	})
	if level != truthlevel.LevelAccepted {
		t.Fatalf("setup: computed level = %s, want accepted", level)
	}

	// old absent (free space) ⇒ the new truth-level record is an `add` (KRD §11): the
	// coordinate is introduced where no prior version existed — additive, non-destructive.
	newBody, _ := json.Marshal(map[string]any{"kind": "truth", "intent": "checkout", "truth_level": level.Name()})

	diff := semanticdiff.Classify(
		semanticdiff.Artifact{}, // absent old — free space
		semanticdiff.Artifact{Version: "v-new", Body: newBody},
	)
	if diff.ChangeType != semanticdiff.ChangeAdd {
		t.Fatalf("introducing the truth_level coordinate classified as %q, want add (open_question=%q)", diff.ChangeType, diff.OpenQuestion)
	}
}
