package besoin

// graph.go — the EL03 record: the BesoinGraph. An ORDERED, append-only set of LevelNodes (one per
// resolved/drafting rung) plus the directed edges constrains(L→L+1) and seeds(L names a deeper
// need). The graph is CONTENT-ADDRESSED via records.Hash(Canonicalize(graph)) — REUSING the S01/S02
// content-hash scheme (back/kernel/records), never a forked address space (the honest join,
// ROADMAP scope paragraph). It is project-scoped (EL19 multi-project; ProjectScope/RLS is S53 — a
// declared forward dependency, here modelled as a plain Project key, OpenQuestion below).
//
// THE DOUBLE ABSENCE (the wall, CLAUDE.md §2 + ROADMAP). A BesoinGraph and its LevelNodes carry
// NEITHER a Version field NOR a Mirror field — by construction. Exactly as ideas.Idea makes those
// two unrepresentable to encode "this is a candidate, not a truth", a BesoinGraph makes them
// unrepresentable to encode "this is a NEED above the wall, not a truth". A need never freezes and
// never carries a mirror here; promotion to truth is the app-builder writing the mirror via /goal.
// A property below pins that no `version`/`mirror` key ever appears in the canonical body.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Build + addressing are PURE TOTAL functions making authority:
// the same set of answers yields the same graph_hash regardless of insertion order or key order
// (Canonicalize sorts; nodes are sorted by Level then by content), the round-trip is lossless, and
// two graphs of distinct projects are disjoint. No clock/rng/IO. The reproducibility mirror
// graph_property_test.go pins same-input→same-output.
//
// FORWARD DEPENDENCIES (declared OpenQuestions, bootstrap exception §6, non-blocking):
//   - ProjectScope/RLS (S53/S55): modelled here as a free `Project` string; S53 back-fills the typed
//     ProjectScope and the row-level isolation. Until then, project disjointness is enforced purely
//     by the Project key in the canonical body (distinct project → distinct graph_hash).
//   - Persistence to the `besoin` Postgres schema (EL15): this package is PURE (no DB); the JSONB
//     round-trip is proven here; the schema + MCP are EL15.

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// NodeStatus is the lifecycle of a single LevelNode within a BesoinGraph. The set is CLOSED and small:
// a node is empty (named but not yet declared), drafting (being elicited), or resolved (right-sized —
// EL07 owns the verdict). There is no "promoted" status: promotion is emitting an Idea (EL16), not a
// node state. This is need-lifecycle, deliberately distinct from ideas.Status (truth-candidate
// lifecycle) — a need is not a candidate-truth.
type NodeStatus string

const (
	// NodeEmpty — the rung is named/reachable but carries no declared body yet.
	NodeEmpty NodeStatus = "empty"
	// NodeDrafting — the rung is being elicited; a body exists but is not yet enough (EL07).
	NodeDrafting NodeStatus = "drafting"
	// NodeResolved — the rung is right-sized (EL07's enough verdict). The anchor the next rung reads.
	NodeResolved NodeStatus = "resolved"
)

// NodeStatuses returns the three node statuses in canonical order. The set is closed; never invented.
func NodeStatuses() []NodeStatus {
	return []NodeStatus{NodeEmpty, NodeDrafting, NodeResolved}
}

// IsNodeStatus reports whether s is one of the three closed node statuses. Pure, total.
func IsNodeStatus(s NodeStatus) bool {
	for _, k := range NodeStatuses() {
		if k == s {
			return true
		}
	}
	return false
}

// Provenance records who wanted this node and the verbatim utterance — REUSING the closed shape of
// ideas.Provenance via a value-compatible struct so EL16 can hand the verbatim utterance straight to
// idea_capture (provenance human, never paraphrased). Kept as its own type so this package does not
// depend on the kernel for a need-side concept; the fields are identical so EL16 maps 1:1.
type Provenance struct {
	// Source is who engendered the node — "human" (an utterance) is the only legal on-ramp for a
	// need (a need is always a human "je veux …"); the verbatim detail is kept below.
	Source string `json:"source"`
	// Detail is the verbatim human utterance, never paraphrased (ROADMAP: "l'utterance verbatim").
	Detail string `json:"detail"`
}

// LevelNode is one rung of the BesoinGraph. It carries its Level (the grammar position, EL02), its
// declared Body (the rung-shaped content, free JSONB here — EL07/EL12 validate its shape against the
// per-rung RequiredFields), the resolved outgoing Refs (the constrains/seeds targets), its
// Provenance, its Status, and any carried OpenQuestions (deeper-level gaps; bootstrap §6 —
// non-blocking, carried not dropped).
//
// By construction there is NO Version and NO Mirror field. That double absence IS what makes this a
// need-node and not a truth (the wall): the type cannot encode a freeze or a proof.
type LevelNode struct {
	// Level is the grammar rung (must satisfy IsLevel — guaranteed by AddNode).
	Level Level `json:"level"`
	// Body is the declared rung content as canonical JSONB (validated by EL07/EL12, not here). Empty
	// when Status == empty.
	Body json.RawMessage `json:"body,omitempty"`
	// Refs are the resolved outgoing references of this node (the deeper rungs it constrains/seeds).
	// Sorted canonically so the graph_hash is order-independent.
	Refs []Ref `json:"refs,omitempty"`
	// Provenance is who wanted this node + the verbatim utterance.
	Provenance Provenance `json:"provenance"`
	// Status is the node lifecycle (empty|drafting|resolved).
	Status NodeStatus `json:"status"`
	// OpenQuestions are carried deeper-level gaps (bootstrap §6): a missing deeper rung is a carried
	// OpenQuestion, NEVER a blocking residual. Sorted canonically.
	OpenQuestions []string `json:"open_questions,omitempty"`
}

// EdgeKind is the closed set of directed edge kinds of the BesoinGraph topology (which IS the §23
// verticale). constrains(L→L+1) is the descent edge (the rung above constrains the rung below);
// seeds(L→deeper) is a node naming a deeper need that does not yet exist (the seed of a future rung).
type EdgeKind string

const (
	// EdgeConstrains — L→L+1: the resolved rung above constrains the rung below (the descent path).
	EdgeConstrains EdgeKind = "constrains"
	// EdgeSeeds — L→deeper: a node names a deeper need (a seed), not necessarily the immediate next.
	EdgeSeeds EdgeKind = "seeds"
)

// EdgeKinds returns the two closed edge kinds in canonical order. Never invented.
func EdgeKinds() []EdgeKind {
	return []EdgeKind{EdgeConstrains, EdgeSeeds}
}

// IsEdgeKind reports whether k is one of the two closed edge kinds. Pure, total.
func IsEdgeKind(k EdgeKind) bool {
	return k == EdgeConstrains || k == EdgeSeeds
}

// Ref is a single outgoing reference carried by a LevelNode toward a deeper rung. The Field names the
// grammar ref-field (EL02 spec, e.g. "triggers"/"invoke"/"mutate"); the To names the targeted deeper
// Level. EL07 resolves these @version; here they are recorded losslessly.
type Ref struct {
	// Field is the grammar ref-field carrying this reference (EL02 LevelSpec.RefField).
	Field string `json:"field"`
	// To is the deeper Level this reference resolves toward.
	To Level `json:"to"`
}

// Edge is a directed edge of the graph topology. From/To are Levels; Kind is constrains|seeds.
type Edge struct {
	From Level    `json:"from"`
	To   Level    `json:"to"`
	Kind EdgeKind `json:"kind"`
}

// BesoinGraph is the ordered, append-only, content-addressed need graph of ONE project. Its topology
// (Nodes ordered by the §23 descent + Edges) IS the architecture the app-builder follows. It carries
// NO Version and NO Mirror — by construction (the wall): it is a need above the line, not a truth.
type BesoinGraph struct {
	// Project scopes the graph (EL19 multi-project). A plain key until S53's ProjectScope back-fills
	// the typed scope + RLS (declared forward-dependency OpenQuestion). Distinct project → disjoint
	// graph (distinct graph_hash).
	Project string `json:"project"`
	// Nodes are the level-nodes of this project, one (at most) per Level. Stored sorted by the §23
	// descent order (bands last) so the canonical body is order-independent.
	Nodes []LevelNode `json:"nodes,omitempty"`
	// Edges are the directed constrains/seeds edges. Stored sorted canonically.
	Edges []Edge `json:"edges,omitempty"`
}

// Graph construction / mutation errors (typed, fail-closed; no panic).
var (
	// ErrUnknownLevel is returned by AddNode when the node's Level is not a valid grammar Level.
	ErrUnknownGraphLevel = fmt.Errorf("besoin: node level is not a grammar level")
	// ErrUnknownStatus is returned by AddNode when the node Status is not a closed NodeStatus.
	ErrUnknownStatus = fmt.Errorf("besoin: node status is not a known status")
	// ErrDuplicateNode is returned by AddNode when a node for that Level already exists. The graph is
	// append-only at the row level (EL15/Postgres), but in-memory a Level appears at most once; a new
	// body for the same Level is a versioned decision (EL08 ChangeSet), never a silent overwrite (§9).
	ErrDuplicateNode = fmt.Errorf("besoin: a node for that level already exists (overwrite needs a ChangeSet — §9)")
	// ErrUnknownEdgeKind is returned by AddEdge for an edge kind outside the closed set.
	ErrUnknownEdgeKind = fmt.Errorf("besoin: edge kind is not a known kind")
	// ErrEdgeLevel is returned by AddEdge when an endpoint is not a grammar Level.
	ErrEdgeLevel = fmt.Errorf("besoin: edge endpoint is not a grammar level")
)

// NewGraph returns an empty BesoinGraph for a project. Pure, total.
func NewGraph(project string) BesoinGraph {
	return BesoinGraph{Project: project}
}

// hasNode reports whether the graph already carries a node for level l.
func (g BesoinGraph) hasNode(l Level) bool {
	for i := range g.Nodes {
		if g.Nodes[i].Level == l {
			return true
		}
	}
	return false
}

// AddNode appends a LevelNode to the graph, refusing an unknown level, an unknown status, or a
// duplicate level (overwrite is a ChangeSet decision, EL08 — never silent, §9). It returns a NEW
// graph (value semantics — append-only / non-destructive, §9): the receiver is never mutated. Nodes
// are re-sorted canonically so the address is insertion-order-independent. Pure, total.
func (g BesoinGraph) AddNode(n LevelNode) (BesoinGraph, error) {
	if !IsLevel(n.Level) {
		return g, fmt.Errorf("%w: %q", ErrUnknownGraphLevel, n.Level)
	}
	if !IsNodeStatus(n.Status) {
		return g, fmt.Errorf("%w: %q", ErrUnknownStatus, n.Status)
	}
	if g.hasNode(n.Level) {
		return g, fmt.Errorf("%w: %q", ErrDuplicateNode, n.Level)
	}
	out := g.clone()
	out.Nodes = append(out.Nodes, n.clone())
	out.sort()
	return out, nil
}

// AddEdge appends a directed edge, refusing an unknown kind or a non-grammar endpoint. Returns a NEW
// graph (non-destructive). Duplicate edges are de-duplicated on sort so the address is stable. Pure.
func (g BesoinGraph) AddEdge(e Edge) (BesoinGraph, error) {
	if !IsEdgeKind(e.Kind) {
		return g, fmt.Errorf("%w: %q", ErrUnknownEdgeKind, e.Kind)
	}
	if !IsLevel(e.From) || !IsLevel(e.To) {
		return g, fmt.Errorf("%w: %q->%q", ErrEdgeLevel, e.From, e.To)
	}
	out := g.clone()
	out.Edges = append(out.Edges, e)
	out.sort()
	return out, nil
}

// Node returns the node for level l and ok=false if absent. Pure, total.
func (g BesoinGraph) Node(l Level) (LevelNode, bool) {
	for i := range g.Nodes {
		if g.Nodes[i].Level == l {
			return g.Nodes[i].clone(), true
		}
	}
	return LevelNode{}, false
}

// clone deep-copies a node so callers cannot mutate the graph's internal slices.
func (n LevelNode) clone() LevelNode {
	cp := n
	if n.Body != nil {
		cp.Body = append(json.RawMessage(nil), n.Body...)
	}
	cp.Refs = append([]Ref(nil), n.Refs...)
	cp.OpenQuestions = append([]string(nil), n.OpenQuestions...)
	return cp
}

// clone deep-copies a graph (value semantics, non-destructive §9).
func (g BesoinGraph) clone() BesoinGraph {
	out := BesoinGraph{Project: g.Project}
	for i := range g.Nodes {
		out.Nodes = append(out.Nodes, g.Nodes[i].clone())
	}
	out.Edges = append(out.Edges, g.Edges...)
	return out
}

// levelRank returns a stable total rank for sorting nodes: SOURCE rungs by descent index, then the
// transversal bands after the leaf (so the canonical order is deterministic across bands too).
func levelRank(l Level) int {
	if i := sourceIndex(l); i >= 0 {
		return i
	}
	// Transversal bands rank after all SOURCE rungs, in their canonical band order.
	for i, b := range transversalBands {
		if b == l {
			return len(sourceOrder) + i
		}
	}
	return len(sourceOrder) + len(transversalBands) // defensive; unreachable for valid graphs
}

// sort canonicalizes the in-memory ordering: nodes by (levelRank, level), each node's Refs and
// OpenQuestions sorted, edges sorted and de-duplicated. This makes the canonical body
// insertion-order-independent so the graph_hash is order-free. Pure (mutates only the receiver copy).
func (g *BesoinGraph) sort() {
	for i := range g.Nodes {
		refs := g.Nodes[i].Refs
		sort.Slice(refs, func(a, b int) bool {
			if refs[a].Field != refs[b].Field {
				return refs[a].Field < refs[b].Field
			}
			return refs[a].To < refs[b].To
		})
		oq := g.Nodes[i].OpenQuestions
		sort.Strings(oq)
	}
	sort.Slice(g.Nodes, func(a, b int) bool {
		ra, rb := levelRank(g.Nodes[a].Level), levelRank(g.Nodes[b].Level)
		if ra != rb {
			return ra < rb
		}
		return g.Nodes[a].Level < g.Nodes[b].Level
	})
	// Sort + de-duplicate edges.
	sort.Slice(g.Edges, func(a, b int) bool {
		if g.Edges[a].From != g.Edges[b].From {
			return g.Edges[a].From < g.Edges[b].From
		}
		if g.Edges[a].To != g.Edges[b].To {
			return g.Edges[a].To < g.Edges[b].To
		}
		return g.Edges[a].Kind < g.Edges[b].Kind
	})
	g.Edges = dedupEdges(g.Edges)
}

// dedupEdges removes adjacent duplicate edges from a sorted slice (so a re-added edge does not change
// the address). Pure over the sorted input.
func dedupEdges(in []Edge) []Edge {
	if len(in) == 0 {
		return in
	}
	out := in[:1]
	for i := 1; i < len(in); i++ {
		if in[i] != in[i-1] {
			out = append(out, in[i])
		}
	}
	return out
}

// canonicalBody is the deterministic JSONB the graph is hashed over: a re-sorted clone marshalled
// then run through records.Canonicalize (so object keys are sorted recursively too). The body has NO
// `version` and NO `mirror` key — by construction (the BesoinGraph struct has no such field). Pure.
func (g BesoinGraph) canonicalBody() ([]byte, error) {
	c := g.clone()
	c.sort()
	raw, err := json.Marshal(c)
	if err != nil {
		return nil, fmt.Errorf("besoin: marshal graph: %w", err)
	}
	return records.Canonicalize(raw)
}

// Canonicalize returns the canonical JSONB body the graph_hash is computed over. REUSES
// records.Canonicalize (the S01/S02 scheme) — never a forked path. Pure, total.
func (g BesoinGraph) Canonicalize() ([]byte, error) { return g.canonicalBody() }

// Hash returns the content address of the graph: records.Hash(Canonicalize(graph)). Same answers →
// same graph_hash regardless of insertion order or key order (the reproducibility property). REUSES
// the kernel content-hash scheme — never a forked address space. Pure, total.
func (g BesoinGraph) Hash() (string, error) {
	b, err := g.canonicalBody()
	if err != nil {
		return "", err
	}
	return records.Hash(b), nil
}

// Unmarshal parses a canonical JSONB body back into a BesoinGraph and re-sorts it, so a round-trip
// (Canonicalize → Unmarshal → Canonicalize) is byte-lossless. Pure, total.
func Unmarshal(body []byte) (BesoinGraph, error) {
	var g BesoinGraph
	if err := json.Unmarshal(body, &g); err != nil {
		return BesoinGraph{}, fmt.Errorf("besoin: unmarshal graph: %w", err)
	}
	g.sort()
	return g, nil
}
