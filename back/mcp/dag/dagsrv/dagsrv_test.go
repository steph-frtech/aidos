package dagsrv

// Activation + fault-injection test for the `dag` MCP server (ADR 0009: a scaffold is activated
// at the step that needs it, with a working server and a fault-injection test).
//
// It drives the server handlers against a REAL Postgres (Testcontainers) with the S02 + S23 + S24
// migrations applied, proving the canonical §120 round-trip end-to-end:
//   - branch off the root → a new head, the root not deleted;
//   - branch off an inner ancestor → two parallel heads (§125);
//   - checkout an ancestor → a backward head-flag move, every later node STILL present;
//   - rebranch → a new line reachable from the root, the abandoned line STILL present (THE done case);
//   - the DAG only GROWS across the whole sequence (append-only — node/edge counts non-decreasing).
//
// Fault injection: a move on an UNKNOWN phase is REFUSED (Blocked), and a refusal persists NOTHING
// (the DAG is unchanged) — the server defers to the pure decision and never corrupts the store.

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/archive/dag"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startServer(t *testing.T) (*server, *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()

	ctr, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("aidos"),
		postgres.WithUsername("aidos"),
		postgres.WithPassword("aidos"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(60*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("testcontainers: %v", err)
	}
	t.Cleanup(func() { _ = ctr.Terminate(ctx) })

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("dsn: %v", err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	t.Cleanup(pool.Close)
	for _, f := range []string{
		"../../../migrations/kernel_records_baseline.sql",
		"../../../migrations/dag_stable_phase_baseline.sql",
		"../../../migrations/dag_node_edge_baseline.sql",
	} {
		mig, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read %s: %v", f, err)
		}
		if _, err := pool.Exec(ctx, string(mig)); err != nil {
			t.Fatalf("apply %s: %v", f, err)
		}
	}
	st, err := dag.NewStore(ctx, dsn)
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	t.Cleanup(st.Close)
	return &server{store: st}, pool
}

// seedRoot inserts the root node v0 (a head) via the writer role so the DAG has a starting node.
func seedRoot(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	if _, err := pool.Exec(ctx,
		`SET ROLE aidos; INSERT INTO dag.node (id, body, version, head, stratum, label) VALUES ('v0', '{"kind":"phase","parent_ids":[],"stratum":"above","label":"root"}'::jsonb, 'v0', true, 'above', 'root'); RESET ROLE`); err != nil {
		t.Fatalf("seed root: %v", err)
	}
}

func TestServer_CanonicalRoundTrip_AppendOnly(t *testing.T) {
	s, pool := startServer(t)
	seedRoot(t, pool)
	ctx := context.Background()

	// branch off the root → v1 head, v0 not deleted.
	out, err := s.branchOut(ctx, "v0", "main-line", "cs-v0-v1")
	if err != nil || out.Blocked {
		t.Fatalf("branch off root: err=%v blocked=%v reason=%s", err, out.Blocked, out.Reason)
	}
	if out.Event != "Branched" || out.NewNode == "" {
		t.Fatalf("branch event/new node: %+v", out)
	}
	v1 := out.NewNode

	// branch off v0 again to build v2 (a child of v1 in the §120 graph: branch off v1).
	out2, err := s.branchOut(ctx, v1, "line-2", "cs-v1-v2")
	if err != nil || out2.Blocked {
		t.Fatalf("branch off v1: %+v %v", out2, err)
	}
	v2 := out2.NewNode

	// branch off the inner ancestor v1 → a parallel head (§125): now v2 and w1 both heads.
	out3, err := s.branchOut(ctx, v1, "tva-eu-variant", "cs-v1-w1")
	if err != nil || out3.Blocked {
		t.Fatalf("branch off inner ancestor: %+v %v", out3, err)
	}
	if len(out3.Heads) != 2 {
		t.Fatalf("a branch off an inner ancestor must yield two parallel heads (§125), got %v", out3.Heads)
	}

	nodesAfterBranches := out3.NodeCount
	edgesAfterBranches := out3.EdgeCount

	// checkout the ancestor v1 → backward head-flag move; v2 and w1 still present.
	co, err := s.checkoutOut(ctx, v1)
	if err != nil || co.Blocked {
		t.Fatalf("checkout v1: %+v %v", co, err)
	}
	if co.Event != "HeadMoved" {
		t.Fatalf("checkout event: %s", co.Event)
	}
	if co.NodeCount != nodesAfterBranches || co.EdgeCount != edgesAfterBranches {
		t.Fatalf("checkout must be a head-flag move (counts unchanged): nodes %d->%d edges %d->%d",
			nodesAfterBranches, co.NodeCount, edgesAfterBranches, co.EdgeCount)
	}
	d, _ := s.store.Load(ctx)
	if _, ok := d.Node(v2); !ok {
		t.Fatalf("v2 must still exist after checkout (append-only)")
	}

	// rebranch from v1 → a NEW line reachable from the root, the abandoned line v2 still present.
	rb, err := s.rebranchOut(ctx, v1, "v2a-line", "cs-v1-v2a")
	if err != nil || rb.Blocked {
		t.Fatalf("rebranch from v1: %+v %v", rb, err)
	}
	if rb.Event != "Rebranched" || rb.NewNode == "" {
		t.Fatalf("rebranch event/new node: %+v", rb)
	}
	d2, _ := s.store.Load(ctx)
	if _, ok := d2.Node(v2); !ok {
		t.Fatalf("THE done case: the abandoned line v2 must STILL exist after rebranch (append-only)")
	}
	if !dag.IsReachable(d2, "v0", rb.NewNode) {
		t.Fatalf("the rebranched line must be reachable from the root v0")
	}
	// append-only across the whole sequence.
	if rb.NodeCount < co.NodeCount || rb.EdgeCount < co.EdgeCount {
		t.Fatalf("the DAG must only grow: nodes %d->%d edges %d->%d", co.NodeCount, rb.NodeCount, co.EdgeCount, rb.EdgeCount)
	}
}

// TestServer_FaultInjection_UnknownPhaseRefused — a move on an unknown phase is Blocked and persists
// nothing (the server defers to the pure decision; a refusal never corrupts the store).
func TestServer_FaultInjection_UnknownPhaseRefused(t *testing.T) {
	s, pool := startServer(t)
	seedRoot(t, pool)
	ctx := context.Background()

	before, _ := s.store.Load(ctx)
	out, err := s.branchOut(ctx, "ghost", "x", "cs-x")
	if err != nil {
		t.Fatalf("a pure refusal must not be a transport error: %v", err)
	}
	if !out.Blocked {
		t.Fatalf("a branch off an unknown phase MUST be Blocked")
	}
	after, _ := s.store.Load(ctx)
	if len(after.Nodes()) != len(before.Nodes()) || len(after.Edges()) != len(before.Edges()) {
		t.Fatalf("a refused move must persist NOTHING (the DAG is unchanged)")
	}
}

// thin wrappers calling the handler decision path without the MCP transport plumbing.
func (s *server) branchOut(ctx context.Context, from, label, cs string) (moveOutput, error) {
	return s.applyMove(ctx, func(d dag.DAG) (dag.DAG, dag.MovementEvent, error) {
		return dag.Branch(d, from, label, cs)
	})
}
func (s *server) checkoutOut(ctx context.Context, phase string) (moveOutput, error) {
	return s.applyMove(ctx, func(d dag.DAG) (dag.DAG, dag.MovementEvent, error) {
		return dag.CheckoutAncestor(d, phase)
	})
}
func (s *server) rebranchOut(ctx context.Context, from, label, cs string) (moveOutput, error) {
	return s.applyMove(ctx, func(d dag.DAG) (dag.DAG, dag.MovementEvent, error) {
		return dag.Rebranch(d, from, label, cs)
	})
}
