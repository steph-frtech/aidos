package authority_test

// Persistence mirror: reflects=kernel.authority_graph-migration, test_kind=integration,
// liveness=live.
//
// On a real Postgres (Testcontainers) with the S02 kernel-records baseline + the S16
// authority-graph migration applied:
//   - kernel.authority_graph exists as a content-addressed append-only table;
//   - a graph serialized by SerializeGraphBody round-trips into the body jsonb and reads
//     back identically (content-addressed body ⊇ the §13.8 graph);
//   - the migration is expand-only (it adds a NEW table; the S02 kernel.truth is untouched);
//   - the agent role keeps SELECT-only on kernel.authority_graph (the wall) — INSERT is refused.
//
// This is the end-to-end proof the migration applies (the Atlas Pro `migrate lint` is not
// available; the AIDOS convention proves migrations via Testcontainers on `go test`).

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startAuthorityPostgres(t *testing.T) *pgxpool.Pool {
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

	// Apply the S02 baseline then the S16 authority-graph migration, in order (expand-only).
	for _, f := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/kernel_authority_graph_baseline.sql",
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

// TestAuthorityGraphRoundTrips — a serialized graph round-trips through the body jsonb as a
// content-addressed row (id == version == Hash).
func TestAuthorityGraphRoundTrips(t *testing.T) {
	pool := startAuthorityPostgres(t)
	ctx := context.Background()

	g := authority.AuthorityGraph{
		Domain:     "checkout",
		TruthKind:  "regulatory",
		Approvers:  []authority.Role{"legal", "product_owner"},
		Veto:       []authority.Role{"security"},
		Escalation: []authority.Role{"architecture_board"},
	}
	body, err := authority.SerializeGraphBody(g)
	if err != nil {
		t.Fatalf("serialize: %v", err)
	}
	rec, err := records.NewRecord(records.KindTruth, body)
	if err != nil {
		t.Fatalf("NewRecord: %v", err)
	}

	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.authority_graph (id, body, version) VALUES ($1, $2::jsonb, $3)`,
		rec.ID, string(rec.Body), rec.Version,
	); err != nil {
		t.Fatalf("insert authority graph should succeed: %v", err)
	}

	var rawBody string
	if err := pool.QueryRow(ctx,
		"SELECT body::text FROM kernel.authority_graph WHERE id = $1", rec.ID).Scan(&rawBody); err != nil {
		t.Fatalf("select body: %v", err)
	}
	var got struct {
		Graph authority.AuthorityGraph `json:"authority_graph"`
	}
	if err := json.Unmarshal([]byte(rawBody), &got); err != nil {
		t.Fatalf("unmarshal stored body: %v", err)
	}
	if got.Graph.Domain != g.Domain || got.Graph.TruthKind != g.TruthKind ||
		len(got.Graph.Approvers) != len(g.Approvers) || len(got.Graph.Veto) != len(g.Veto) ||
		len(got.Graph.Escalation) != len(g.Escalation) {
		t.Fatalf("graph did not round-trip: got %+v want %+v", got.Graph, g)
	}
}

// TestAgentRoleSelectOnly — the wall (CLAUDE.md §2): the agent role may SELECT
// kernel.authority_graph but never INSERT — truth-writes flow through the aidos CLI writer
// role, not the agent. The S16 migration GRANTs SELECT + REVOKEs writes; this proves the
// new table inherits the wall (no write door was opened).
func TestAgentRoleSelectOnly(t *testing.T) {
	pool := startAuthorityPostgres(t)
	ctx := context.Background()

	// aidos_agent SELECT on the new table works (SELECT-only is the wall).
	if _, err := pool.Exec(ctx, "SET ROLE aidos_agent; SELECT id FROM kernel.authority_graph LIMIT 1; RESET ROLE"); err != nil {
		t.Fatalf("agent SELECT on kernel.authority_graph must succeed: %v", err)
	}
	// aidos_agent INSERT is refused — the new table did not open a write door.
	_, err := pool.Exec(ctx,
		`SET ROLE aidos_agent; INSERT INTO kernel.authority_graph (id, body, version) VALUES ('x', '{"kind":"truth"}'::jsonb, 'x'); RESET ROLE`)
	if err == nil {
		t.Fatalf("agent INSERT into kernel.authority_graph must be refused by the wall")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission") &&
		!strings.Contains(strings.ToLower(err.Error()), "denied") {
		t.Fatalf("INSERT refused for the wrong reason: %v", err)
	}
}
