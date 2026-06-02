package dag

// store.go — the persistence adapter for the version DAG, writing through the `aidos` writer role
// (the `dag` MCP server carries that DSN; the agent role is SELECT-only — the wall, CLAUDE.md §2).
// A node body goes to dag.node (content-addressed); a parentage edge (an S20 ChangeSet) goes to
// dag.edge; the `head` flag is the ONE mutable column (a checkout/branch moves it). The DAG is
// APPEND-ONLY: a move INSERTs nodes/edges and UPDATEs the head flag — it never DELETEs.
//
// This adapter does I/O; the DECISION (Branch/CheckoutAncestor/Rebranch + the resulting DAG) stays
// in the pure functions above. The adapter loads the DAG, the server runs the pure move, and the
// adapter persists the DELTA (new nodes/edges + the moved head flags) — it never re-implements the
// move. Loading the whole DAG and diffing is the simplest correct persistence for this step; a
// later step may stream deltas.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned when a node id is absent.
var ErrNotFound = errors.New("dag: not found")

// Store persists the version DAG through the writer role.
type Store struct {
	pool *pgxpool.Pool
}

// NewStore opens a pool to the given DSN (the `aidos` writer DSN in the MCP server).
func NewStore(ctx context.Context, dsn string) (*Store, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("dag: open pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("dag: ping: %w", err)
	}
	return &Store{pool: pool}, nil
}

// Close releases the pool.
func (s *Store) Close() { s.pool.Close() }

// Load reads the entire version DAG (nodes + edges) for the pure move + the /version-dag render.
// SELECT-only on the read path; the parentage is reconstructed from dag.edge so a node may have ≥1
// parents (a DAG, not a tree).
func (s *Store) Load(ctx context.Context) (DAG, error) {
	nrows, err := s.pool.Query(ctx, `SELECT id, head, stratum, COALESCE(label, '') FROM dag.node ORDER BY created_at, id`)
	if err != nil {
		return DAG{}, fmt.Errorf("dag: load nodes: %w", err)
	}
	defer nrows.Close()
	byID := map[string]*Node{}
	var order []string
	for nrows.Next() {
		var n Node
		var stratum string
		if err := nrows.Scan(&n.ID, &n.Head, &stratum, &n.Label); err != nil {
			return DAG{}, err
		}
		n.Stratum = Stratum(stratum)
		byID[n.ID] = &n
		order = append(order, n.ID)
	}
	if err := nrows.Err(); err != nil {
		return DAG{}, err
	}

	erows, err := s.pool.Query(ctx, `SELECT from_node, to_node, changeset FROM dag.edge ORDER BY created_at, from_node, to_node`)
	if err != nil {
		return DAG{}, fmt.Errorf("dag: load edges: %w", err)
	}
	defer erows.Close()
	var edges []Edge
	for erows.Next() {
		var e Edge
		if err := erows.Scan(&e.From, &e.To, &e.Changeset); err != nil {
			return DAG{}, err
		}
		edges = append(edges, e)
		if child, ok := byID[e.To]; ok {
			child.ParentIDs = append(child.ParentIDs, e.From)
		}
	}
	if err := erows.Err(); err != nil {
		return DAG{}, err
	}

	nodes := make([]Node, 0, len(order))
	for _, id := range order {
		nodes = append(nodes, *byID[id])
	}
	return New(nodes, edges), nil
}

// Persist writes the DELTA between a prior DAG and the move's result: it INSERTs the new nodes (the
// added line) and edges (the S20 ChangeSet) and UPDATEs every node's head flag to match the result
// (the §120 head move). It DELETEs nothing — the DAG is append-only. Body is the canonical node
// body so the row is content-addressed (id == version == hash). One transaction so a move lands
// atomically. Writes through the `aidos` writer role (the pool's DSN).
func (s *Store) Persist(ctx context.Context, before, after DAG) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	had := map[string]bool{}
	for _, n := range before.Nodes() {
		had[n.ID] = true
	}
	// INSERT new nodes.
	for _, n := range after.Nodes() {
		if had[n.ID] {
			continue
		}
		body, berr := nodeBody(n)
		if berr != nil {
			return berr
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO dag.node (id, body, version, head, stratum, label) VALUES ($1, $2::jsonb, $1, $3, $4, $5)
			 ON CONFLICT (id) DO NOTHING`,
			n.ID, body, n.Head, string(n.Stratum), nullable(n.Label)); err != nil {
			return fmt.Errorf("dag: insert node %s: %w", n.ID, err)
		}
	}
	// INSERT new edges.
	hadEdge := map[string]bool{}
	for _, e := range before.Edges() {
		hadEdge[edgeKey(e)] = true
	}
	for _, e := range after.Edges() {
		if hadEdge[edgeKey(e)] {
			continue
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO dag.edge (from_node, to_node, changeset) VALUES ($1, $2, $3)
			 ON CONFLICT (from_node, to_node, changeset) DO NOTHING`,
			e.From, e.To, e.Changeset); err != nil {
			return fmt.Errorf("dag: insert edge %s->%s: %w", e.From, e.To, err)
		}
	}
	// UPDATE the head flag for every node to match the result (the ONLY mutable column).
	for _, n := range after.Nodes() {
		if _, err := tx.Exec(ctx,
			`UPDATE dag.node SET head = $2 WHERE id = $1 AND head <> $2`, n.ID, n.Head); err != nil {
			return fmt.Errorf("dag: move head %s: %w", n.ID, err)
		}
	}
	return tx.Commit(ctx)
}

// nodeBody renders the canonical node body whose hash is the node id — the SAME body NodeID hashes
// over (kind + parent_ids + stratum + label), so a persisted row is content-addressed and its id
// re-derives. (A recorded stable phase's cut/verdict ride in this body in a later projection; the
// branch/rebranch node is addressed by parentage + line identity.)
func nodeBody(n Node) ([]byte, error) {
	parents := n.ParentIDs
	if parents == nil {
		parents = []string{}
	}
	return json.Marshal(nodeIDBody{
		Kind:      "phase",
		ParentIDs: parents,
		Stratum:   string(n.Stratum),
		Label:     n.Label,
	})
}

func edgeKey(e Edge) string { return e.From + "\x00" + e.To + "\x00" + e.Changeset }

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// txInsertNodeForTest is a thin helper kept exported-free; tests use SET ROLE directly.
var _ = pgx.ErrNoRows
