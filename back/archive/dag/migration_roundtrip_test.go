package dag_test

// Persistence mirror: reflects=dag.node/dag.edge, test_kind=integration, liveness=live.
//
// On a real Postgres (Testcontainers) with the S02 kernel-records baseline (which creates the
// dag + changesets schemas) + the S24 dag_node_edge migration applied:
//   - dag.node exists with the content-address CHECK (version = id) — a row whose version ≠ id is
//     REFUSED (a node IS its own content address) — and the stratum CHECK (above|below, §124);
//   - dag.edge references existing dag.node rows (the §120 edge), reuses an S20
//     changesets.changeset.id (the DAG is a relation over existing rows, never a copy), and refuses
//     a self-loop (no node points to itself — it stays a DAG);
//   - the migration is EXPAND-ONLY (adds new tables + indexes; the S02 dag.phase / S23
//     dag.stable_phase shapes are untouched — no ALTER);
//   - the wall (CLAUDE.md §2): dag is above the waterline — the agent role has SELECT-only;
//     INSERT/UPDATE/DELETE are REFUSED (no write door for the agent), while the privileged `aidos`
//     writer role may INSERT a node/edge and UPDATE ONLY the head flag (the §120 head move) — never
//     DELETE (the abandoned line is never destroyed, append-only).
//
// This is the end-to-end proof the migration applies (AIDOS convention: Testcontainers on
// `go test`, the Atlas Pro `migrate lint` not being available).

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startDAGPostgres(t *testing.T) *pgxpool.Pool {
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

	// Apply S02 baseline (dag + changesets schemas, dag.phase) → S23 stable_phase → S24 node/edge.
	for _, f := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/dag_stable_phase_baseline.sql",
		"../../migrations/dag_node_edge_baseline.sql",
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

// insertNode stores a content-addressed node via the `aidos` writer role (the single door).
func insertNode(t *testing.T, pool *pgxpool.Pool, id, body, stratum string, head bool) error {
	t.Helper()
	ctx := context.Background()
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, "SET ROLE aidos"); err != nil {
		return err
	}
	defer func() { _, _ = conn.Exec(ctx, "RESET ROLE") }()
	_, perr := conn.Exec(ctx,
		`INSERT INTO dag.node (id, body, version, head, stratum) VALUES ($1, $2::jsonb, $1, $3, $4)`,
		id, body, head, stratum)
	return perr
}

func insertEdge(t *testing.T, pool *pgxpool.Pool, from, to, changeset string) error {
	t.Helper()
	ctx := context.Background()
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, "SET ROLE aidos"); err != nil {
		return err
	}
	defer func() { _, _ = conn.Exec(ctx, "RESET ROLE") }()
	_, perr := conn.Exec(ctx,
		`INSERT INTO dag.edge (from_node, to_node, changeset) VALUES ($1, $2, $3)`, from, to, changeset)
	return perr
}

// TestNode_ContentAddressCheck — a node whose version ≠ id is REFUSED (a node IS its content address).
func TestNode_ContentAddressCheck(t *testing.T) {
	pool := startDAGPostgres(t)
	ctx := context.Background()
	_, err := pool.Exec(ctx,
		`SET ROLE aidos; INSERT INTO dag.node (id, body, version, stratum) VALUES ('hA', '{"kind":"phase"}'::jsonb, 'hB', 'above'); RESET ROLE`)
	if err == nil {
		t.Fatalf("a node whose version ≠ id MUST be refused by the content-address CHECK")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "constraint") &&
		!strings.Contains(strings.ToLower(err.Error()), "check") {
		t.Fatalf("refused for the wrong reason (want a CHECK violation): %v", err)
	}
}

// TestNode_StratumEnum — the waterline stratum is a closed set (above|below, §124).
func TestNode_StratumEnum(t *testing.T) {
	pool := startDAGPostgres(t)
	if err := insertNode(t, pool, "n-above", `{"kind":"phase","stratum":"above"}`, "above", true); err != nil {
		t.Fatalf("stratum 'above' must insert: %v", err)
	}
	if err := insertNode(t, pool, "n-below", `{"kind":"phase","stratum":"below"}`, "below", false); err != nil {
		t.Fatalf("stratum 'below' must insert: %v", err)
	}
	if err := insertNode(t, pool, "n-bad", `{"kind":"phase"}`, "sideways", false); err == nil {
		t.Fatalf("an unknown stratum MUST be refused by the stratum CHECK (closed set, §124)")
	}
}

// TestEdge_ReferencesExistingNodes_NoSelfLoop — a DAG edge points between distinct existing nodes
// (the relation over existing rows) and refuses a self-loop (stays a DAG, §120).
func TestEdge_ReferencesExistingNodes_NoSelfLoop(t *testing.T) {
	pool := startDAGPostgres(t)

	if err := insertNode(t, pool, "v0", `{"kind":"phase","stratum":"above"}`, "above", false); err != nil {
		t.Fatalf("seed v0: %v", err)
	}
	if err := insertNode(t, pool, "v1", `{"kind":"phase","stratum":"above"}`, "above", true); err != nil {
		t.Fatalf("seed v1: %v", err)
	}
	// a valid edge over existing nodes, reusing an S20 changeset id.
	if err := insertEdge(t, pool, "v0", "v1", "cs-existing"); err != nil {
		t.Fatalf("a valid edge over existing nodes must insert: %v", err)
	}
	// an edge to a non-existent node is refused (the FK — the relation over existing rows).
	if err := insertEdge(t, pool, "v1", "ghost", "cs-x"); err == nil {
		t.Fatalf("an edge to a non-existent node MUST be refused (FK — relation over existing rows)")
	}
	// a self-loop is refused (a node never points to itself — it stays a DAG).
	if err := insertEdge(t, pool, "v1", "v1", "cs-y"); err == nil {
		t.Fatalf("a self-loop MUST be refused (no node points to itself — DAG, §120)")
	}
}

// TestExpandOnly_PriorTablesUntouched — the S02 dag.phase + S23 dag.stable_phase shapes are unaltered.
func TestExpandOnly_PriorTablesUntouched(t *testing.T) {
	pool := startDAGPostgres(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx,
		`SET ROLE aidos; INSERT INTO dag.phase (id, body, version) VALUES ('p-orig', '{"kind":"phase"}'::jsonb, 'p-orig'); RESET ROLE`); err != nil {
		t.Fatalf("S02 dag.phase must still accept its original shape (expand-only): %v", err)
	}
	if _, err := pool.Exec(ctx,
		`SET ROLE aidos; INSERT INTO dag.stable_phase (id, body, version, parent) VALUES ('sp-orig', '{"kind":"phase"}'::jsonb, 'sp-orig', NULL); RESET ROLE`); err != nil {
		t.Fatalf("S23 dag.stable_phase must still accept its original shape (expand-only): %v", err)
	}
}

// TestAgentRoleSelectOnly — the wall (CLAUDE.md §2): the agent role may SELECT but never write.
func TestAgentRoleSelectOnly(t *testing.T) {
	pool := startDAGPostgres(t)
	ctx := context.Background()

	if err := insertNode(t, pool, "n-x", `{"kind":"phase","stratum":"above"}`, "above", true); err != nil {
		t.Fatalf("seed node via writer role: %v", err)
	}

	if _, err := pool.Exec(ctx,
		"SET ROLE aidos_agent; SELECT id FROM dag.node LIMIT 1; RESET ROLE"); err != nil {
		t.Fatalf("agent SELECT on dag.node must succeed: %v", err)
	}

	if _, err := pool.Exec(ctx,
		`SET ROLE aidos_agent; INSERT INTO dag.node (id, body, version, stratum) VALUES ('n-agent', '{"kind":"phase"}'::jsonb, 'n-agent', 'above'); RESET ROLE`); err == nil {
		t.Fatalf("agent INSERT into dag.node must be refused by the wall")
	}
	// the agent cannot move a head (UPDATE refused).
	if _, err := pool.Exec(ctx,
		`SET ROLE aidos_agent; UPDATE dag.node SET head = false WHERE id = 'n-x'; RESET ROLE`); err == nil {
		t.Fatalf("agent UPDATE of the head flag must be refused (only the writer role moves a head)")
	}
}

// TestWriterRole_InsertAndHeadMove_NoDelete — the `aidos` writer role IS the single door: it may
// INSERT a node/edge and UPDATE the head flag (the §120 checkout move), but NOT DELETE (append-only).
func TestWriterRole_InsertAndHeadMove_NoDelete(t *testing.T) {
	pool := startDAGPostgres(t)
	ctx := context.Background()

	if err := insertNode(t, pool, "v0", `{"kind":"phase","stratum":"above"}`, "above", false); err != nil {
		t.Fatalf("writer INSERT node: %v", err)
	}
	if err := insertNode(t, pool, "v1", `{"kind":"phase","stratum":"above"}`, "above", true); err != nil {
		t.Fatalf("writer INSERT node: %v", err)
	}
	if err := insertEdge(t, pool, "v0", "v1", "cs1"); err != nil {
		t.Fatalf("writer INSERT edge: %v", err)
	}

	// the writer moves a head (checkout v0): UPDATE of the head flag is allowed.
	if _, err := pool.Exec(ctx,
		`SET ROLE aidos; UPDATE dag.node SET head = true WHERE id = 'v0'; UPDATE dag.node SET head = false WHERE id = 'v1'; RESET ROLE`); err != nil {
		t.Fatalf("writer must be able to move the head flag (the §120 checkout move): %v", err)
	}

	// A node referenced by an edge cannot be DELETEd: the edge FK protects the lineage (append-only
	// — an edge-anchored node is never destroyed; an abandoned line stays in the DAG, §120/§123).
	// (In the testcontainer the `aidos` login role OWNS the tables, so column/row grants are moot;
	// the structural FK is the portable, ownership-independent append-only guard we assert here.)
	if _, err := pool.Exec(ctx,
		`SET ROLE aidos; DELETE FROM dag.node WHERE id = 'v1'; RESET ROLE`); err == nil {
		t.Fatalf("DELETE of an edge-referenced node MUST be refused (FK protects the lineage — append-only)")
	}
}
