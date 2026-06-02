// Package dag is the Archive's VERSION DAG (KRD §120–§125): the version space is a DAG, not a
// line. NODES are stable phases (S23, content-addressed via S01/S02 records.Hash) and EDGES are
// ChangeSets (S20, reusing changesets.changeset.id). It lands the THREE §121 navigation moves —
// pure, append-only, over an in-memory DAG value:
//
//   - Branch          — open an ALTERNATIVE line of truth from a stable phase (§121): a new node
//     parented on the from-phase becomes a head; the from-node is NEVER deleted.
//   - CheckoutAncestor — make a prior stable phase the current head (§120/§121): a BACKWARD move
//     that only moves the `head` flag; the abandoned line stays in the DAG.
//   - Rebranch        — from a recheckout-ed ancestor, open a NEW line (the branch-of-a-branch,
//     §121): a new node parented on the ancestor.
//
// THE LAW (KRD §120): append-only with a mutable head. Nothing is ever destroyed — an abandoned
// line stays in the DAG as a potential STEPPING STONE (§123). "Revenir à l'ancienne version"
// (human undo) and "échantillonner un stepping stone" (evolution) are THE SAME gesture: checkout
// an ancestor + rebranch. A node may have ≥1 parents (a DAG, not a tree). The DAG may hold SEVERAL
// parallel heads — one branch stable while another is in flux (§125).
//
// STRATIFICATION BY THE WATERLINE (KRD §124): a node carries a `stratum` — `above` = human truth
// branches, `below` = evolutionary implementation variants. Branch/Rebranch inherit the stratum of
// the from-node so a line stays on one side of the waterline.
//
// REUSE, DON'T REINVENT (CLAUDE.md §6; the wall): the node id is the S01/S02 content-hash scheme
// (records.Canonicalize + records.Hash) — NEVER forked; the edge IS the S20 ChangeSet
// (changesets.changeset.id) — NEVER re-modelled. The DAG is a RELATION over existing
// content-addressed rows: it references node/edge ids, it never copies a phase or ChangeSet body.
//
// PURE / DETERMINISM-FIRST (CLAUDE.md §6/§8): Branch/CheckoutAncestor/Rebranch and the read helpers
// (Heads, Ancestors, IsReachable, Node) are TOTAL, deterministic functions of their input — no DB,
// no clock, no rng, no I/O. The same DAG + command always yields the same DAG + event + node id and
// NEVER panics. The rapid property mirror pins append-only growth, the no-cycle invariant, the
// head-flag-move semantics of checkout, rebranch-parents-on-ancestor, and content-addressing.
//
// READ-ONLY against truth (the wall, CLAUDE.md §2): this package returns DAG VALUES; recording a
// node/edge into the dag.node/dag.edge schema (above the waterline) is done ONLY through the
// privileged `aidos` writer role via the `dag` MCP, inside an approved flow — never the agent role.
package dag

import (
	"encoding/json"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Stratum places a node relative to the waterline (KRD §124): `above` = a human truth branch,
// `below` = an evolutionary implementation variant. It is a closed two-value set.
type Stratum string

const (
	// StratumAbove — a human truth branch (above the waterline, §124).
	StratumAbove Stratum = "above"
	// StratumBelow — an evolutionary implementation variant (below the waterline, §124).
	StratumBelow Stratum = "below"
)

// Node is a version-DAG node: a STABLE PHASE (S23). Its ID is the content address of its canonical
// body (S01/S02). A node may have ≥1 ParentIDs (a DAG, not a tree). Head marks it as a current
// head of its line; several nodes may be heads at once (parallel lines, §125). Stratum places it
// relative to the waterline (§124). Label is the human name of the line.
type Node struct {
	// ID is the content address of the node's canonical body (S01/S02 records.Hash; the root may
	// carry a seeded id in tests).
	ID string `json:"id"`
	// ParentIDs are the node ids this node descends from — the §120 DAG edges' from-endpoints.
	// A root has none; a merge (a later step) would have ≥2.
	ParentIDs []string `json:"parent_ids,omitempty"`
	// Head reports whether this node is a current head of its line (a mutable flag, §120).
	Head bool `json:"head"`
	// Stratum places the node relative to the waterline (§124): above | below.
	Stratum Stratum `json:"stratum"`
	// Label is the human name of the line (e.g. "tva-eu-variant"). Part of the content address.
	Label string `json:"label,omitempty"`
}

// Edge is a version-DAG edge: a ChangeSet (S20) linking from_node → to_node. Changeset is the
// existing changesets.changeset.id — the DAG references it, never copies its body.
type Edge struct {
	// From is the parent node id (the edge's source).
	From string `json:"from"`
	// To is the child node id (the edge's target).
	To string `json:"to"`
	// Changeset is the existing changesets.changeset.id this edge reuses (S20). The DAG is a
	// relation over existing rows — never a copy of the ChangeSet body.
	Changeset string `json:"changeset"`
}

// DAG is an in-memory version DAG value: the set of nodes (stable phases) and edges (ChangeSets).
// It is immutable by convention — the movement functions return a NEW DAG (append-only), never
// mutate the receiver. The internal slices are copied on every move so a caller's DAG is never
// aliased.
type DAG struct {
	nodes []Node
	edges []Edge
}

// New builds a DAG from nodes and edges, defensively copying both so the value owns its storage.
func New(nodes []Node, edges []Edge) DAG {
	ns := make([]Node, len(nodes))
	copy(ns, nodes)
	es := make([]Edge, len(edges))
	copy(es, edges)
	return DAG{nodes: ns, edges: es}
}

// Nodes returns a copy of the DAG's nodes (read-only; callers cannot mutate the DAG through it).
func (d DAG) Nodes() []Node {
	out := make([]Node, len(d.nodes))
	copy(out, d.nodes)
	return out
}

// Edges returns a copy of the DAG's edges.
func (d DAG) Edges() []Edge {
	out := make([]Edge, len(d.edges))
	copy(out, d.edges)
	return out
}

// Node returns the node with the given id and whether it exists. Total; never panics.
func (d DAG) Node(id string) (Node, bool) {
	for _, n := range d.nodes {
		if n.ID == id {
			return n, true
		}
	}
	return Node{}, false
}

// MovementEvent is the closed set of events a §121 move emits (mirrors the fixture's events).
type MovementEvent string

const (
	// EventBranched — Branch opened a new line off a stable phase.
	EventBranched MovementEvent = "Branched"
	// EventHeadMoved — CheckoutAncestor moved the head back to a prior phase (a backward move).
	EventHeadMoved MovementEvent = "HeadMoved"
	// EventRebranched — Rebranch opened a NEW line off a recheckout-ed ancestor.
	EventRebranched MovementEvent = "Rebranched"
)

// Error is an actionable refusal of a move (the move's input is invalid). It is NOT a panic: the
// movement functions are total. A refusal NEVER mutates the DAG.
type Error string

func (e Error) Error() string { return string(e) }

const (
	// ErrUnknownPhase — the named from/ancestor phase is not a node in the DAG.
	ErrUnknownPhase Error = "dag: unknown phase (not a node in the DAG)"
)

// nodeIDBody is the canonical body whose hash is a node's id. It carries the parents, the stratum
// and the label — the structural fact that defines a new line. The "kind":"phase" discriminator
// matches records.KindPhase so a node rides the S02 content-addressed substrate. The cut/verdict
// of a recorded stable phase live in the persisted dag.node body (the migration); here a freshly
// branched node is addressed by its parentage + line identity (it is content-addressed and
// append-only either way).
type nodeIDBody struct {
	Kind      string   `json:"kind"`
	ParentIDs []string `json:"parent_ids"`
	Stratum   string   `json:"stratum"`
	Label     string   `json:"label"`
}

// NodeID computes the content address of a new node from its parents, stratum and label — REUSING
// S02's records.Canonicalize + records.Hash (NEVER a forked hash scheme). Deterministic: the same
// (parents, stratum, label) always yields the same id, so a node is content-addressed and a move
// is replayable. Total; returns an error only if the body cannot marshal.
func NodeID(parentIDs []string, stratum Stratum, label string) (string, error) {
	parents := parentIDs
	if parents == nil {
		parents = []string{}
	}
	b, err := json.Marshal(nodeIDBody{
		Kind:      string(records.KindPhase),
		ParentIDs: parents,
		Stratum:   string(stratum),
		Label:     label,
	})
	if err != nil {
		return "", err
	}
	canon, err := records.Canonicalize(b)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// withNewLine is the shared append-only primitive for Branch and Rebranch: it appends a new node
// (content-addressed, parented on `from`, inheriting from's stratum) and a new edge (the S20
// ChangeSet) WITHOUT deleting anything. `clearHead` controls whether `from`'s head flag is cleared
// (Branch off the head clears it — the head moves; Rebranch off a recheckout-ed ancestor leaves the
// ancestor as the head, so the new node + the ancestor are both heads of their lines). The new node
// is always a head of its own line.
func (d DAG) withNewLine(from, label, changeset string, clearHead bool) (DAG, string, error) {
	parent, ok := d.Node(from)
	if !ok {
		return d, "", ErrUnknownPhase
	}
	id, err := NodeID([]string{from}, parent.Stratum, label)
	if err != nil {
		return d, "", err
	}

	nodes := make([]Node, 0, len(d.nodes)+1)
	for _, n := range d.nodes {
		if clearHead && n.ID == from {
			n.Head = false
		}
		nodes = append(nodes, n)
	}
	nodes = append(nodes, Node{
		ID:        id,
		ParentIDs: []string{from},
		Head:      true,
		Stratum:   parent.Stratum,
		Label:     label,
	})

	edges := make([]Edge, 0, len(d.edges)+1)
	edges = append(edges, d.edges...)
	edges = append(edges, Edge{From: from, To: id, Changeset: changeset})

	return DAG{nodes: nodes, edges: edges}, id, nil
}

// Branch opens an ALTERNATIVE line of truth from the stable phase `from` (§121): it appends a new
// content-addressed node parented on `from` (inheriting its stratum) and the S20 ChangeSet edge,
// and makes the new node a head. If `from` was itself a head, the head MOVES to the new node (its
// flag is cleared); if `from` was an inner ancestor, the prior head stays a head — yielding TWO
// parallel lines of truth (§125). The from-node is NEVER deleted (append-only). PURE. Returns the
// new DAG, the EventBranched event, or ErrUnknownPhase if `from` is not a node.
func Branch(d DAG, from, label, changeset string) (DAG, MovementEvent, error) {
	fromNode, ok := d.Node(from)
	if !ok {
		return d, "", ErrUnknownPhase
	}
	// Branch off a head moves the head to the new node; branch off an inner ancestor leaves the
	// existing head(s) in place (parallel lines, §125).
	out, _, err := d.withNewLine(from, label, changeset, fromNode.Head)
	if err != nil {
		return d, "", err
	}
	return out, EventBranched, nil
}

// CheckoutAncestor makes the prior stable phase `ancestor` the current head (§120/§121) — a
// BACKWARD move. It ONLY moves the `head` flag: it clears the head flag of every node on the
// ancestor's own line that descends from it and sets the ancestor's head flag. It appends and
// deletes NOTHING — every later node and edge stays in the DAG (append-only; the abandoned line
// remains a stepping stone, §123). Parallel heads on OTHER lines (off a different branch point) are
// left untouched (§125). PURE. Returns the new DAG, EventHeadMoved, or ErrUnknownPhase.
func CheckoutAncestor(d DAG, ancestor string) (DAG, MovementEvent, error) {
	if _, ok := d.Node(ancestor); !ok {
		return d, "", ErrUnknownPhase
	}
	// The nodes that descend from `ancestor` (its forward reachable set) form the line(s) being
	// abandoned; their head flags are cleared so the head moves strictly backward onto the
	// ancestor. Heads that do NOT descend from `ancestor` (independent parallel lines) keep their
	// head flag (§125).
	descendants := forwardReachable(d, ancestor)

	nodes := make([]Node, len(d.nodes))
	copy(nodes, d.nodes)
	for i := range nodes {
		switch {
		case nodes[i].ID == ancestor:
			nodes[i].Head = true
		case descendants[nodes[i].ID]:
			nodes[i].Head = false
		}
	}
	// edges are untouched (a head-flag move, never a structural edit).
	edges := make([]Edge, len(d.edges))
	copy(edges, d.edges)
	return DAG{nodes: nodes, edges: edges}, EventHeadMoved, nil
}

// Rebranch opens a NEW line from the recheckout-ed ancestor `ancestor` (the branch-of-a-branch,
// §121): it appends a new content-addressed node parented on `ancestor` and the S20 ChangeSet edge,
// making the new node a head. It does NOT clear the ancestor's head flag — after a checkout the
// ancestor is the current head and stays the base of the new line; the new node and the ancestor's
// other descendants remain present (append-only). PURE. Returns the new DAG, EventRebranched, or
// ErrUnknownPhase.
func Rebranch(d DAG, ancestor, label, changeset string) (DAG, MovementEvent, error) {
	out, _, err := d.withNewLine(ancestor, label, changeset, false)
	if err != nil {
		return d, "", err
	}
	return out, EventRebranched, nil
}

// Heads returns the current heads of the DAG, in node-insertion order. The DAG may have SEVERAL
// parallel heads (§125) — one branch stable while another is in flux. Total; never panics.
func Heads(d DAG) []Node {
	var heads []Node
	for _, n := range d.nodes {
		if n.Head {
			heads = append(heads, n)
		}
	}
	return heads
}

// Ancestors returns the set of node ids that `id` transitively descends from (its parents,
// grandparents, …) following ParentIDs. The node itself is NOT included. Total; cycle-safe
// (a visited set guards against a malformed cyclic input so it never loops forever).
func Ancestors(d DAG, id string) []string {
	seen := map[string]bool{}
	var order []string
	var walk func(string)
	walk = func(cur string) {
		n, ok := d.Node(cur)
		if !ok {
			return
		}
		for _, p := range n.ParentIDs {
			if seen[p] {
				continue
			}
			seen[p] = true
			order = append(order, p)
			walk(p)
		}
	}
	walk(id)
	return order
}

// IsReachable reports whether `to` is reachable from `from` by following ParentIDs upward from
// `to` (i.e. `from` is an ancestor of `to`), which is the §120 reachability the navigation uses
// ("is the new line reachable from the root"). It is IRREFLEXIVE on a node's own back-edge: a node
// does not reach itself unless a genuine cycle exists (which the property mirror forbids). Total;
// cycle-safe; never panics.
func IsReachable(d DAG, from, to string) bool {
	if from == to {
		// A node reaches itself only via a real cycle (an edge path back to itself), never trivially.
		return false
	}
	for _, a := range Ancestors(d, to) {
		if a == from {
			return true
		}
	}
	return false
}

// forwardReachable returns the set of node ids reachable FORWARD from `start` (its descendants:
// children, grandchildren, …) following ParentIDs in the child→parent direction reversed. It is
// used by CheckoutAncestor to find the line(s) descending from the ancestor whose head flags move.
// Cycle-safe via a visited set.
func forwardReachable(d DAG, start string) map[string]bool {
	out := map[string]bool{}
	var walk func(string)
	walk = func(cur string) {
		for _, n := range d.nodes {
			for _, p := range n.ParentIDs {
				if p == cur && !out[n.ID] {
					out[n.ID] = true
					walk(n.ID)
				}
			}
		}
	}
	walk(start)
	return out
}
