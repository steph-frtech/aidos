package main

// DB-level mirror (Testcontainers + real Postgres) for S12 completeness_runs.
// mirror record: reflects=runtime.completeness_runs, test_kind=property,
//               cert_language=testcontainers, liveness=alive, authority=below.
//
// Proves, against a throwaway real Postgres with the S02 + S05 + S06 + S12
// baselines:
//   - PgRunLog appends a completeness run + its findings and reads them back;
//   - PgCutSource reads the head mirrors ⋈ kernel cut, and the gate computes the
//     right verdict over real rows (orphan → block; living → pass);
//   - the agent role (aidos_agent) may INSERT + SELECT runtime.completeness_runs /
//     completeness_monster_findings but is DENIED UPDATE/DELETE/TRUNCATE there
//     (append-only audit log, below the waterline — §5 honesty);
//   - the agent role is DENIED INSERT into mirrors.mirror_record (the wall holds);
//   - the verdict CHECK rejects a third verdict (block|pass only).

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/mirror/completeness"
	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startStopPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	ctr, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("aidos"),
		postgres.WithUsername("aidos_owner"),
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

	for _, mig := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/mirror_record_baseline.sql",
		"../../migrations/completeness_runs_baseline.sql",
	} {
		sqlBytes, err := os.ReadFile(mig)
		if err != nil {
			t.Fatalf("read migration %s: %v", mig, err)
		}
		if _, err := pool.Exec(ctx, string(sqlBytes)); err != nil {
			t.Fatalf("apply migration %s: %v", mig, err)
		}
	}
	return pool
}

func runAsRole(ctx context.Context, pool *pgxpool.Pool, role, sql string, args ...any) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, "SET LOCAL ROLE "+pgx.Identifier{role}.Sanitize()); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, sql, args...)
	return err
}

func TestPgCompletenessRunRoundTrip(t *testing.T) {
	ctx := context.Background()
	pool := startStopPostgres(t)

	log := &PgRunLog{Pool: pool}
	run := CompletenessRun{
		RunID:        "cr-test-1",
		CutHash:      "deadbeef",
		Verdict:      completeness.VerdictBlock,
		MonsterCount: 1,
		Monsters: []records.Monster{
			{Reason: records.ReasonNoOrphanMirror, Kind: "control", MirrorID: "orphan-1"},
		},
	}
	if err := log.Record(ctx, run); err != nil {
		t.Fatalf("record completeness run: %v", err)
	}
	latest, err := log.Latest(ctx)
	if err != nil {
		t.Fatalf("latest: %v", err)
	}
	if latest.RunID != "cr-test-1" || latest.Verdict != completeness.VerdictBlock {
		t.Fatalf("latest run mismatch: %+v", latest)
	}
	if latest.MonsterCount != 1 || len(latest.Monsters) != 1 {
		t.Fatalf("expected 1 finding, got count=%d findings=%+v", latest.MonsterCount, latest.Monsters)
	}
}

// TestPgCutSourceAndGateOverRealPostgres seeds a real kernel layer + mirror rows
// and proves the gate blocks/passes over the head cut PgCutSource reads.
func TestPgCutSourceAndGateOverRealPostgres(t *testing.T) {
	ctx := context.Background()
	pool := startStopPostgres(t)

	// A real control layer @v1 + its living fixture mirror → complete cut → PASS.
	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.layer (id, body, version) VALUES ($1, $2::jsonb, $3)`,
		"checkout-button", `{"kind":"control"}`, "v1"); err != nil {
		t.Fatalf("seed layer: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO mirrors.mirror_record
		   (id, reflects_layer_id, reflects_version, test_kind, cert_language, authority, liveness, content_hash, version)
		 VALUES ('live-1','checkout-button','v1','fixture','fixture','above','alive','live-1','live-1')`); err != nil {
		t.Fatalf("seed living mirror: %v", err)
	}

	src := &PgCutSource{Pool: pool}
	cut, err := src.Load(ctx)
	if err != nil {
		t.Fatalf("load cut: %v", err)
	}
	if d := completeness.Check(cut); d.Verdict != completeness.VerdictPass {
		t.Fatalf("complete cut over real rows must PASS, got %+v", d)
	}

	// Append an orphan mirror reflecting a vanished @version → BLOCK.
	if _, err := pool.Exec(ctx,
		`INSERT INTO mirrors.mirror_record
		   (id, reflects_layer_id, reflects_version, test_kind, cert_language, authority, liveness, content_hash, version)
		 VALUES ('orphan-1','checkout-button','v0','fixture','fixture','above','dead','orphan-1','orphan-1')`); err != nil {
		t.Fatalf("seed orphan mirror: %v", err)
	}
	cut, _ = src.Load(ctx)
	d := completeness.Check(cut)
	if d.Verdict != completeness.VerdictBlock {
		t.Fatalf("orphan over real rows must BLOCK, got %+v", d)
	}
	if d.BlockReason == nil || d.BlockReason.Code != completeness.CodeMonster {
		t.Fatalf("expected MONSTER, got %+v", d.BlockReason)
	}
}

func TestCompletenessRunsAppendOnlyForAgent(t *testing.T) {
	ctx := context.Background()
	pool := startStopPostgres(t)

	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.completeness_runs (run_id, cut_hash, verdict, monster_count)
		 VALUES ('r0','h0','pass',0)`); err != nil {
		t.Fatalf("seed run: %v", err)
	}

	// The agent CAN append a run.
	if err := runAsRole(ctx, pool, "aidos_agent",
		`INSERT INTO runtime.completeness_runs (run_id, cut_hash, verdict, monster_count)
		 VALUES ('r1','h1','block',2)`); err != nil {
		t.Fatalf("agent INSERT into runtime.completeness_runs must be allowed: %v", err)
	}

	destructive := []struct{ name, sql string }{
		{"UPDATE", "UPDATE runtime.completeness_runs SET verdict = 'pass' WHERE run_id = 'r0'"},
		{"DELETE", "DELETE FROM runtime.completeness_runs WHERE run_id = 'r0'"},
		{"TRUNCATE", "TRUNCATE runtime.completeness_runs"},
	}
	for _, d := range destructive {
		t.Run(d.name, func(t *testing.T) {
			err := runAsRole(ctx, pool, "aidos_agent", d.sql)
			if err == nil {
				t.Fatalf("%s on runtime.completeness_runs must be denied for the agent", d.name)
			}
			if !strings.Contains(strings.ToLower(err.Error()), "permission denied") {
				t.Fatalf("%s denied for the wrong reason: %v", d.name, err)
			}
		})
	}
}

func TestWallHoldsForStopHook(t *testing.T) {
	ctx := context.Background()
	pool := startStopPostgres(t)

	err := runAsRole(ctx, pool, "aidos_agent",
		`INSERT INTO mirrors.mirror_record
		   (id, reflects_layer_id, reflects_version, test_kind, cert_language, authority, liveness, content_hash, version)
		 VALUES ('x','y','v1','fixture','fixture','above','alive','x','x')`)
	if err == nil {
		t.Fatalf("WALL BREACH: agent INSERT into mirrors.mirror_record succeeded")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission denied") {
		t.Fatalf("agent INSERT into mirrors.mirror_record denied for the wrong reason: %v", err)
	}
}

func TestCompletenessVerdictCheckConstraint(t *testing.T) {
	ctx := context.Background()
	pool := startStopPostgres(t)

	_, err := pool.Exec(ctx,
		`INSERT INTO runtime.completeness_runs (run_id, cut_hash, verdict, monster_count)
		 VALUES ('rx','hx','warn',0)`)
	if err == nil {
		t.Fatalf("a third verdict 'warn' must violate the CHECK constraint")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "constraint") {
		t.Fatalf("expected a constraint violation, got: %v", err)
	}
}
