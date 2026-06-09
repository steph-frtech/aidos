// Package causedby lands the SEVENTH versioned link kind of the AIDOS Kernel — `caused_by`
// (FKE-35.1, ROADMAP FK12): the BACKWARD CAUSAL edge, the inverse of the forward red-wave
// `impacts`/staleness propagation (S22 redwave, KRD §42). It is ADDITIVE to the six S17 §41
// kinds (projects_to, derives_from, contracts_with, triggers, binds, mirrors) — it does not
// edit them; it sits beside them (anti-overwrite, CLAUDE.md §9).
//
// THE TWO AXES OF CAUSALITY (FKE-35.1):
//   - FORWARD (already built, S22): a bumped source REDDENS its consumers — the red wave walks
//     OUTWARD along the staleness edges (`A impacts B`: change A ⇒ B goes red).
//   - BACKWARD (this step): from a RED symptom, walk UPWARD along `caused_by` edges to the
//     CANDIDATE CAUSES that may have produced it (`A caused_by B`: A's redness may be caused
//     by B). Trace is the deterministic inverse of the red wave — the substrate the WhyTree
//     (FK13, the 5-whys redressed) builds on.
//
// A `caused_by` edge is a Link{From: symptom, To: candidate-cause}, both PINNED id@version
// (reuses the S17 Ref pinning law — a causal edge points at a VERSION, never a bare identity,
// so the cause chain is replayable and content-addressed, KRD §41). Validate REJECTS an
// unpinned edge and a self-edge (a node cannot cause itself).
//
// Trace(symptom, edges) walks the `caused_by` graph upward from the symptom and returns the
// ordered set of candidate causes (the CauseChain). It is:
//   - DETERMINISTIC — same (symptom, edges) ⇒ byte-identical chain (BFS by edge order, then a
//     stable canonical sort), so the WhyTree is replayable (FK12 done-criterion).
//   - TOTAL — never panics, even on a malformed graph.
//   - CYCLE-REFUSING — a cycle in the `caused_by` graph reachable from the symptom is a
//     contradiction (A caused_by B caused_by A: neither can be the prior cause). Trace REFUSES
//     it with ErrCycle (FK12 done-criterion: "cycle refusé") — it does NOT silently break the
//     loop and return a partial chain.
//
// PURE (CLAUDE.md §6/§8 determinism-first): no DB, no clock, no rng, no I/O. The edges and the
// symptom are READ from the arguments handed in, never fetched. READ-ONLY against truth (the
// wall, CLAUDE.md §2): this package writes nothing. A new caused_by row flows through the aidos
// CLI role via an approved ChangeSet (the kernel.link table); the agent has no GRANT.
package causedby

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Kind is the link-kind discriminator this step adds. It is the SEVENTH versioned link kind,
// additive to the six S17 §41 kinds — never substituting them (the closed set grows by one).
const Kind links.Kind = "caused_by"

// IsCausedBy reports whether k is the caused_by kind (the one this step owns).
func IsCausedBy(k links.Kind) bool { return k == Kind }

// Edge is a `caused_by` causal edge: From (the symptom / effect) is caused by To (a candidate
// cause). Both ends are PINNED id@version refs (reuses links.Ref). The edge is itself versioned:
// it rides inside a content-addressed kernel.link body (SerializeEdgeBody) so the cause chain
// is replayable and a changed cause version yields a NEW edge row (never an in-place mutation).
type Edge struct {
	// From is the symptom/effect side (the red node whose cause we seek), pinned id@version.
	From links.Ref `json:"from"`
	// To is the CANDIDATE CAUSE side (the prior node that may have produced From), pinned.
	To links.Ref `json:"to"`
}

// AsLink renders the edge as the underlying S17 Link with this step's caused_by kind, so the
// edge reuses the §41 link substrate (Validate, content-address) unchanged. The forward red
// wave keeps using the six kinds; caused_by rides the same Link AST with a distinct kind.
func (e Edge) AsLink() links.Link {
	return links.Link{Kind: Kind, From: e.From, To: e.To}
}

// Validation errors.
var (
	// ErrUnpinnedFrom — the symptom ref is not a pinned id@version ref.
	ErrUnpinnedFrom = errors.New("causedby: from (symptom) is not a pinned id@version ref")
	// ErrUnpinnedTo — the candidate-cause ref is not pinned: an unpinned causal edge is a monster.
	ErrUnpinnedTo = errors.New("causedby: to (cause) is not pinned (id@version required)")
	// ErrSelfCause — a node cannot cause itself (a self-loop is not a causal explanation).
	ErrSelfCause = errors.New("causedby: a node cannot be caused_by itself (self-edge)")
	// ErrCycle — the caused_by graph reachable from the symptom contains a cycle (refused).
	ErrCycle = errors.New("causedby: cycle in caused_by graph (a cause chain cannot loop)")
)

// Validate is the PURE shape guard of a caused_by edge (FK12):
//   - from is a pinned id@version ref (the symptom);
//   - to is a pinned id@version ref (the candidate cause) — an unpinned cause can never be
//     resolved against heads, so it is a monster;
//   - from.id != to.id — a node cannot be caused_by itself (a self-edge is not a cause).
//
// Pure: no DB, no clock, no I/O. An edge that fails Validate is never handed to Trace.
func Validate(e Edge) error {
	if !e.From.IsPinned() {
		return fmt.Errorf("%w: %q", ErrUnpinnedFrom, e.From.String())
	}
	if !e.To.IsPinned() {
		return fmt.Errorf("%w: %q", ErrUnpinnedTo, e.To.String())
	}
	if e.From.ID == e.To.ID {
		return fmt.Errorf("%w: %q", ErrSelfCause, e.From.ID)
	}
	return nil
}

// CauseChain is Trace's verdict: the symptom it started from plus the ORDERED set of candidate
// cause ids the upward `caused_by` walk reached. The order is the contract (determinism): the
// nearest causes (smallest hop distance from the symptom) come first, ties broken by id — so
// the same (symptom, edges) always yields a byte-identical chain. Causes never contains the
// symptom itself.
type CauseChain struct {
	// Symptom is the id of the red node the trace started from.
	Symptom string `json:"symptom"`
	// Causes are the candidate cause ids, ordered nearest-first then by id (deterministic).
	Causes []string `json:"causes"`
}

// IsEmpty reports whether the symptom has no candidate causes (a leaf / root symptom).
func (c CauseChain) IsEmpty() bool { return len(c.Causes) == 0 }

// chainKey keys the BFS frontier by node id with its hop distance, so the canonical order is
// (distance asc, id asc) — a stable total order independent of map iteration.
type chainKey struct {
	id   string
	dist int
}

// Trace is the PURE deterministic UPWARD traversal of the caused_by graph (FK12, the inverse of
// the red wave): from `symptom`, follow every `caused_by` edge whose From == the current node to
// its To (the candidate cause), breadth-first, collecting the candidate causes.
//
//   - DETERMINISTIC — the edges are visited in their given order; each node is recorded with the
//     SHORTEST hop distance reached; the final chain is sorted (distance asc, id asc). Same
//     (symptom, edges) ⇒ byte-identical CauseChain (the property mirror pins this).
//   - TOTAL — never panics; an edge that fails Validate is SKIPPED (a malformed edge cannot
//     contribute a cause), the rest of the graph is still traced.
//   - CYCLE-REFUSING — if following caused_by from the symptom re-enters a node already on the
//     current DFS path (A caused_by B caused_by A), Trace returns ErrCycle: a cause chain that
//     loops is a contradiction, not a partial answer (FK12 done-criterion). The cycle is detected
//     against the reachable subgraph, so a cycle elsewhere in the graph (unreachable from the
//     symptom) does NOT poison an otherwise-acyclic trace.
//
// Pure: no DB, no clock, no rng, no I/O.
func Trace(symptom string, edges []Edge) (CauseChain, error) {
	// adjacency: node id → ordered list of candidate-cause ids (preserving edge order, which is
	// the deterministic visitation order). Skip malformed edges (total — never panic on them).
	adj := map[string][]string{}
	for _, e := range edges {
		if Validate(e) != nil {
			continue
		}
		adj[e.From.ID] = append(adj[e.From.ID], e.To.ID)
	}

	// Cycle detection over the reachable subgraph: a DFS coloured white/grey/black. Re-entering a
	// grey node (on the current path) is a back-edge ⇒ cycle. We run cycle detection FIRST (over
	// only nodes reachable from the symptom) so a cycle is refused before any chain is returned.
	const (
		white = 0
		grey  = 1
		black = 2
	)
	color := map[string]int{}
	var hasCycle func(node string) bool
	hasCycle = func(node string) bool {
		color[node] = grey
		for _, c := range adj[node] {
			switch color[c] {
			case grey:
				return true // back-edge to a node on the current path ⇒ cycle.
			case white:
				if hasCycle(c) {
					return true
				}
			}
		}
		color[node] = black
		return false
	}
	if hasCycle(symptom) {
		return CauseChain{}, fmt.Errorf("%w: from symptom %q", ErrCycle, symptom)
	}

	// No cycle reachable ⇒ a deterministic BFS records each reachable cause at its SHORTEST hop
	// distance. The symptom itself is the start (distance 0) and is never a cause of itself.
	dist := map[string]int{symptom: 0}
	frontier := []string{symptom}
	for len(frontier) > 0 {
		next := []string{}
		for _, node := range frontier {
			for _, c := range adj[node] {
				if _, seen := dist[c]; seen {
					continue
				}
				dist[c] = dist[node] + 1
				next = append(next, c)
			}
		}
		frontier = next
	}

	keys := make([]chainKey, 0, len(dist))
	for id, d := range dist {
		if id == symptom {
			continue // the symptom is not a cause of itself.
		}
		keys = append(keys, chainKey{id: id, dist: d})
	}
	sort.Slice(keys, func(i, j int) bool {
		if keys[i].dist != keys[j].dist {
			return keys[i].dist < keys[j].dist
		}
		return keys[i].id < keys[j].id
	})
	causes := make([]string, len(keys))
	for i, k := range keys {
		causes[i] = k.id
	}
	return CauseChain{Symptom: symptom, Causes: causes}, nil
}

// SerializeEdgeBody renders a content-addressed kernel.link body carrying the caused_by edge, so
// the edge rides INSIDE the content-addressed body (S02 substrate, reusing the §41 link body
// shape): NewRecord(KindLink, body) yields id == version == Hash(Canonicalize(body)), and
// changing the pinned `to` (cause) version yields a DIFFERENT version (a new row, never an
// in-place mutation — KRD §12). The "kind":"link" discriminator matches records.Validate; the
// "link_kind":"caused_by" distinguishes it from the six S17 kinds inside the body.
func SerializeEdgeBody(e Edge) ([]byte, error) {
	body := map[string]any{
		"kind":      string(records.KindLink),
		"link_kind": string(Kind),
		"from":      e.From,
		"to":        e.To,
	}
	return json.Marshal(body)
}

// ParseEdgeBody is the inverse of SerializeEdgeBody: it reads a caused_by edge back out of a
// kernel.link body (the round-trip half FK12's "round-trip versionné" criterion pins). It errors
// if the body is not a caused_by link body.
func ParseEdgeBody(body []byte) (Edge, error) {
	var probe struct {
		Kind     string    `json:"kind"`
		LinkKind string    `json:"link_kind"`
		From     links.Ref `json:"from"`
		To       links.Ref `json:"to"`
	}
	if err := json.Unmarshal(body, &probe); err != nil {
		return Edge{}, fmt.Errorf("causedby: invalid link body: %w", err)
	}
	if probe.Kind != string(records.KindLink) {
		return Edge{}, fmt.Errorf("causedby: body kind %q is not a kernel.link", probe.Kind)
	}
	if probe.LinkKind != string(Kind) {
		return Edge{}, fmt.Errorf("causedby: body link_kind %q is not caused_by", probe.LinkKind)
	}
	return Edge{From: probe.From, To: probe.To}, nil
}
