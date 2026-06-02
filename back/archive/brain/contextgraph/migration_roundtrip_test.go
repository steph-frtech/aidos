package contextgraph_test

// Persistence mirror: reflects=context.context_graph_decision-migration · test_kind=integration ·
// liveness=live.
//
// On a real Postgres (Testcontainers) with the S32 context-graph-decision migration applied:
//   - the `context` schema + context.context_graph_decision table exist (KRD §119.2);
//   - a content-addressed decision row (id = Hash(Canonicalize(body)), S01/S02) inserts and reads
//     back identically — a decision is a ROW, never an UPDATE (a re-evaluation is a NEW row);
//   - the four-dimension `checked` CHECK refuses an invented fifth dimension (defense in depth);
//   - the false-dominant CHECK refuses a may_reuse=true row that did not evaluate all four checks;
//   - the agent DB role keeps SELECT-ONLY on the table (the wall, CLAUDE.md §2): INSERT is REFUSED
//     — context.* is a TRUTH schema above the waterline, written only by the aidos writer role.
//
// This is the end-to-end proof the migration applies (Atlas Pro `migrate lint` is unavailable;
// the AIDOS convention proves migrations via Testcontainers on `go test`).

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/archive/brain/contextgraph"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startDecisionPostgres(t *testing.T) *pgxpool.Pool {
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
		t.Skipf("testcontainers unavailable (skipping integration mirror): %v", err)
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

	// Apply the prior truth-schema baselines (so the wall re-assertion in the S32 migration —
	// REVOKE ... ON ALL TABLES IN SCHEMA kernel/mirrors/fitness — has its schemas to act on),
	// then the S32 context-graph-decision migration, in order (expand-only).
	for _, f := range []string{
		"../../../migrations/kernel_records_baseline.sql",
		"../../../migrations/mirror_record_baseline.sql",
		"../../../migrations/wall_grants_baseline.sql",
		"../../../migrations/context_graph_decision_baseline.sql",
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

// recordRow builds and inserts a decision row (owner role) and returns the verdict + its id.
func decideAndBody(t *testing.T) (contextgraph.ContextGraphDecision, string) {
	t.Helper()
	now, _ := time.Parse(time.RFC3339, "2026-05-30T00:00:00Z")
	c := contextgraph.Candidate{
		ID:        "S15-eu-truth-pin",
		Scope:     scope.TruthScope{Region: scope.RegionEU},
		ExpiresAt: "2026-01-01T00:00:00Z", // expired ⇒ blocked ⇒ row need not satisfy all-four
	}
	d := contextgraph.Decide(c, contextgraph.RequestContext{Scope: scope.TruthScope{Region: scope.RegionEU}}, now)
	d, err := d.ComputeID()
	if err != nil {
		t.Fatalf("ComputeID: %v", err)
	}
	canon, err := d.CanonicalBody()
	if err != nil {
		t.Fatalf("CanonicalBody: %v", err)
	}
	return d, string(canon)
}

// TestDecisionRowRoundTrips — a content-addressed decision row inserts (owner) and reads back.
func TestDecisionRowRoundTrips(t *testing.T) {
	pool := startDecisionPostgres(t)
	ctx := context.Background()

	d, _ := decideAndBody(t)
	checked := make([]string, len(d.Checked))
	for i, c := range d.Checked {
		checked[i] = string(c)
	}

	if _, err := pool.Exec(ctx,
		`INSERT INTO context.context_graph_decision
		 (id, candidate_id, may_reuse, reason, checked, required_human_review, request_ctx, decided_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,now())`,
		d.ID, d.CandidateID, d.MayReuse, d.Reason, checked, d.RequiredHumanReview, `{"scope":{"region":"EU"}}`,
	); err != nil {
		t.Fatalf("insert decision row (owner) should succeed: %v", err)
	}

	var gotMayReuse bool
	var gotChecked []string
	if err := pool.QueryRow(ctx,
		"SELECT may_reuse, checked FROM context.context_graph_decision WHERE id = $1", d.ID).
		Scan(&gotMayReuse, &gotChecked); err != nil {
		t.Fatalf("select decision: %v", err)
	}
	if gotMayReuse != d.MayReuse {
		t.Fatalf("may_reuse roundtrip: got %v want %v", gotMayReuse, d.MayReuse)
	}
	if !contains(gotChecked, "time") {
		t.Fatalf("checked roundtrip lost the time dimension: %v", gotChecked)
	}
}

// TestInventedDimensionRefused — the four-dimension CHECK refuses a fifth dimension.
func TestInventedDimensionRefused(t *testing.T) {
	pool := startDecisionPostgres(t)
	ctx := context.Background()

	_, err := pool.Exec(ctx,
		`INSERT INTO context.context_graph_decision
		 (id, candidate_id, may_reuse, reason, checked, required_human_review, request_ctx, decided_at)
		 VALUES ('x','c',false,'r',ARRAY['time','vibes']::text[],false,'{}'::jsonb,now())`,
	)
	if err == nil {
		t.Fatalf("an invented dimension ('vibes') must be refused by the CHECK constraint")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "chk") &&
		!strings.Contains(strings.ToLower(err.Error()), "constraint") {
		t.Fatalf("expected a CHECK-constraint violation, got: %v", err)
	}
}

// TestTrueWithoutAllFourRefused — the false-dominant CHECK refuses may_reuse=true with <4 checked.
func TestTrueWithoutAllFourRefused(t *testing.T) {
	pool := startDecisionPostgres(t)
	ctx := context.Background()

	_, err := pool.Exec(ctx,
		`INSERT INTO context.context_graph_decision
		 (id, candidate_id, may_reuse, reason, checked, required_human_review, request_ctx, decided_at)
		 VALUES ('y','c',true,'r',ARRAY['time']::text[],false,'{}'::jsonb,now())`,
	)
	if err == nil {
		t.Fatalf("may_reuse=true with fewer than four checked dimensions must be refused (false-dominant)")
	}
}

// TestAgentRoleIsSelectOnly — the wall: the agent role cannot INSERT into the truth table.
func TestAgentRoleIsSelectOnly(t *testing.T) {
	pool := startDecisionPostgres(t)
	ctx := context.Background()

	// Seed one row as the owner so a SELECT has something to read.
	d, _ := decideAndBody(t)
	checked := make([]string, len(d.Checked))
	for i, c := range d.Checked {
		checked[i] = string(c)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO context.context_graph_decision
		 (id, candidate_id, may_reuse, reason, checked, required_human_review, request_ctx, decided_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,now())`,
		d.ID, d.CandidateID, d.MayReuse, d.Reason, checked, d.RequiredHumanReview, `{}`,
	); err != nil {
		t.Fatalf("owner seed insert: %v", err)
	}

	// As the agent role: SELECT works, INSERT is refused (the wall).
	if _, err := pool.Exec(ctx, "SET ROLE aidos_agent"); err != nil {
		t.Fatalf("set role: %v", err)
	}
	var n int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM context.context_graph_decision").Scan(&n); err != nil {
		t.Fatalf("agent SELECT should succeed (read the ledger): %v", err)
	}
	_, err := pool.Exec(ctx,
		`INSERT INTO context.context_graph_decision
		 (id, candidate_id, may_reuse, reason, checked, required_human_review, request_ctx, decided_at)
		 VALUES ('z','c',false,'r',ARRAY['time']::text[],false,'{}'::jsonb,now())`,
	)
	if err == nil {
		t.Fatalf("the wall: the agent role must NOT be able to INSERT into context.context_graph_decision")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission denied") {
		t.Fatalf("expected a permission-denied (the wall), got: %v", err)
	}
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}
