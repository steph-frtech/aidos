// Package dagsrv is the AIDOS Archive Version-DAG MCP server, exposed as a LIBRARY
// (S59 dispatcher reuse). It is the single capability door (ADR 0009: every backend op is
// an MCP tool) over the `dag` schema — the version space as a DAG (nodes = stable phases
// S23, edges = ChangeSets S20). It is how the version history grows NON-DESTRUCTIVELY:
// branch off a stable phase, checkout an ancestor (a backward head-flag move), and rebranch
// (the branch-of-a-branch). Nothing is ever destroyed — an abandoned line stays in the DAG
// as a stepping stone (§123). The server carries the privileged `aidos` writer DSN; the
// agent role is SELECT-only (the wall, CLAUDE.md §2) and never writes the dag schema directly.
//
// Tools (one tool = one backend op):
//
//	dag_branch            — open an ALTERNATIVE line of truth from a stable phase (append node+edge, move head)
//	dag_checkout_ancestor — make a prior stable phase the current head (a backward head-flag move; nothing destroyed)
//	dag_rebranch          — from a recheckout-ed ancestor, open a NEW line (the branch-of-a-branch)
//	dag_heads             — read the current heads (possibly several parallel lines, §125)
//	dag_ancestors         — read the ancestors of a node (the §120 reachability)
//	dag_get               — read the whole DAG (nodes + edges + heads) for /version-dag rendering
//
// DETERMINISM-FIRST (CLAUDE.md §6): every decision (the new node id, the head move, reachability)
// is the pure dag functions; this server only loads the DAG, runs the pure move, and persists the
// append-only delta. The merge of two truth branches (§122) and mirror-gated promotion (§124) are
// LATER steps — not here.
//
// WHY A LIBRARY (S59). The gateway dispatcher (back/runtime/gatewaydispatch) reuses this
// SAME server in-process: it builds the dag *mcp.Server via NewServer and dispatches a
// routed below-the-line dag_* call to it over an in-memory transport. Extracting the
// handlers here (rather than the old package-main) lets BOTH the standalone stdio binary
// (back/mcp/dag) and the dispatcher construct identical behaviour — no duplicated logic, no
// twin (reuse, don't reinvent — CLAUDE.md §0).
package dagsrv

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/archive/dag"
)

// ── Tool I/O types ──

type branchInput struct {
	From      string `json:"from" jsonschema:"the stable-phase node id to branch from"`
	Label     string `json:"label" jsonschema:"the human name of the new line, e.g. tva-eu-variant"`
	Changeset string `json:"changeset" jsonschema:"the existing changesets.changeset.id this edge reuses (S20)"`
}

type moveOutput struct {
	Event     string   `json:"event"`              // Branched | HeadMoved | Rebranched
	NewNode   string   `json:"new_node,omitempty"` // the appended node id (branch/rebranch)
	Heads     []string `json:"heads"`              // the current heads after the move (§125)
	NodeCount int      `json:"node_count"`         // append-only: never shrinks
	EdgeCount int      `json:"edge_count"`
	Blocked   bool     `json:"blocked"`
	Reason    string   `json:"reason,omitempty"`
}

type checkoutInput struct {
	Phase string `json:"phase" jsonschema:"the prior stable-phase node id to checkout (make the head)"`
}

type rebranchInput struct {
	From      string `json:"from" jsonschema:"the recheckout-ed ancestor node id to rebranch from"`
	Label     string `json:"label" jsonschema:"the human name of the new line"`
	Changeset string `json:"changeset" jsonschema:"the existing changesets.changeset.id this edge reuses (S20)"`
}

type idInput struct {
	ID string `json:"id" jsonschema:"a node id"`
}

type ancestorsOutput struct {
	Ancestors []string `json:"ancestors"`
}

type nodeIO struct {
	ID        string   `json:"id"`
	ParentIDs []string `json:"parent_ids,omitempty"`
	Head      bool     `json:"head"`
	Stratum   string   `json:"stratum"`
	Label     string   `json:"label,omitempty"`
}

type edgeIO struct {
	From      string `json:"from"`
	To        string `json:"to"`
	Changeset string `json:"changeset"`
}

type getOutput struct {
	Nodes []nodeIO `json:"nodes"`
	Edges []edgeIO `json:"edges"`
	Heads []string `json:"heads"`
}

type headsOutput struct {
	Heads []string `json:"heads"`
}

// server wires the MCP tools to one dag Store. It is unexported: callers construct the
// configured *mcp.Server via NewServer and never touch the handlers directly.
type server struct {
	store *dag.Store
}

// applyMove loads the DAG, runs the pure move, persists the append-only delta, and reports the
// result. A pure refusal (unknown phase) is surfaced as a Blocked output, not a transport error.
func (s *server) applyMove(
	ctx context.Context,
	move func(dag.DAG) (dag.DAG, dag.MovementEvent, error),
) (moveOutput, error) {
	before, err := s.store.Load(ctx)
	if err != nil {
		return moveOutput{}, err
	}
	after, ev, mErr := move(before)
	if mErr != nil {
		return moveOutput{Blocked: true, Reason: mErr.Error()}, nil
	}
	if err := s.store.Persist(ctx, before, after); err != nil {
		return moveOutput{}, err
	}
	out := moveOutput{
		Event:     string(ev),
		Heads:     headIDs(after),
		NodeCount: len(after.Nodes()),
		EdgeCount: len(after.Edges()),
	}
	// the new node is the head that did not exist before.
	had := map[string]bool{}
	for _, n := range before.Nodes() {
		had[n.ID] = true
	}
	for _, n := range after.Nodes() {
		if !had[n.ID] {
			out.NewNode = n.ID
		}
	}
	return out, nil
}

func (s *server) branch(ctx context.Context, _ *mcp.CallToolRequest, in branchInput) (*mcp.CallToolResult, moveOutput, error) {
	out, err := s.applyMove(ctx, func(d dag.DAG) (dag.DAG, dag.MovementEvent, error) {
		return dag.Branch(d, in.From, in.Label, in.Changeset)
	})
	return nil, out, err
}

func (s *server) checkoutAncestor(ctx context.Context, _ *mcp.CallToolRequest, in checkoutInput) (*mcp.CallToolResult, moveOutput, error) {
	out, err := s.applyMove(ctx, func(d dag.DAG) (dag.DAG, dag.MovementEvent, error) {
		return dag.CheckoutAncestor(d, in.Phase)
	})
	return nil, out, err
}

func (s *server) rebranch(ctx context.Context, _ *mcp.CallToolRequest, in rebranchInput) (*mcp.CallToolResult, moveOutput, error) {
	out, err := s.applyMove(ctx, func(d dag.DAG) (dag.DAG, dag.MovementEvent, error) {
		return dag.Rebranch(d, in.From, in.Label, in.Changeset)
	})
	return nil, out, err
}

func (s *server) heads(ctx context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, headsOutput, error) {
	d, err := s.store.Load(ctx)
	if err != nil {
		return nil, headsOutput{}, err
	}
	return nil, headsOutput{Heads: headIDs(d)}, nil
}

func (s *server) ancestors(ctx context.Context, _ *mcp.CallToolRequest, in idInput) (*mcp.CallToolResult, ancestorsOutput, error) {
	d, err := s.store.Load(ctx)
	if err != nil {
		return nil, ancestorsOutput{}, err
	}
	return nil, ancestorsOutput{Ancestors: dag.Ancestors(d, in.ID)}, nil
}

func (s *server) get(ctx context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, getOutput, error) {
	d, err := s.store.Load(ctx)
	if err != nil {
		return nil, getOutput{}, err
	}
	return nil, toGetOutput(d), nil
}

func headIDs(d dag.DAG) []string {
	hs := dag.Heads(d)
	out := make([]string, len(hs))
	for i, h := range hs {
		out[i] = h.ID
	}
	return out
}

func toGetOutput(d dag.DAG) getOutput {
	out := getOutput{Heads: headIDs(d)}
	for _, n := range d.Nodes() {
		out.Nodes = append(out.Nodes, nodeIO{ID: n.ID, ParentIDs: n.ParentIDs, Head: n.Head, Stratum: string(n.Stratum), Label: n.Label})
	}
	for _, e := range d.Edges() {
		out.Edges = append(out.Edges, edgeIO{From: e.From, To: e.To, Changeset: e.Changeset})
	}
	return out
}

// NewServer builds the configured Version-DAG *mcp.Server over a single dag Store. It
// registers the six capability-door tools (branch/checkout_ancestor/rebranch/heads/
// ancestors/get) — identical behaviour whether driven by the standalone stdio binary or the
// S59 gateway dispatcher over an in-memory transport.
func NewServer(store *dag.Store) *mcp.Server {
	s := &server{store: store}
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-dag", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "dag_branch", Description: "Open an alternative line of truth from a stable phase (append node+edge, move head)."}, s.branch)
	mcp.AddTool(srv, &mcp.Tool{Name: "dag_checkout_ancestor", Description: "Make a prior stable phase the current head (a backward head-flag move; nothing is destroyed)."}, s.checkoutAncestor)
	mcp.AddTool(srv, &mcp.Tool{Name: "dag_rebranch", Description: "From a recheckout-ed ancestor, open a NEW line (the branch-of-a-branch)."}, s.rebranch)
	mcp.AddTool(srv, &mcp.Tool{Name: "dag_heads", Description: "Read the current heads (possibly several parallel lines, §125)."}, s.heads)
	mcp.AddTool(srv, &mcp.Tool{Name: "dag_ancestors", Description: "Read the ancestors of a node (the §120 reachability)."}, s.ancestors)
	mcp.AddTool(srv, &mcp.Tool{Name: "dag_get", Description: "Read the whole DAG (nodes + edges + heads) for /version-dag rendering."}, s.get)
	return srv
}
