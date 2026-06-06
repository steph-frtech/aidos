package besoin

// red_backlog.go — EL17: the RedBacklog ordered for the app-builder S53+ ("how the doc follows the
// architecture"). RedBacklog(graph) topo-sorts the emitted Ideas (the MAPPING rungs, EL16) along the
// constrains/seeds edges → the EXACT promotion order the app-builder opens its /goal in, which IS the
// §23 verticale. Each backlog item carries:
//   - the projected Idea (EL16, content-addressed, draft, provenance human),
//   - its source rung (FromLevel),
//   - its anchors_above[] (the frozen SOURCE rungs above it — INCLUDING the NoEmit journey/view rungs
//     that constrain it without emitting; the compound made visible),
//   - the EXPECTED mirror FORM (LevelMirrorForm(level), EL10 — product/journey→Gherkin N0,
//     invariant→property N1, operation→fixture N2) ANNEXED, never written (the mirror stays to the
//     user via /goal),
//   - its resolved/unresolved outgoing refs (@version resolution; a dangling deeper ref is carried as
//     a non-blocking forward-dep OpenQuestion, bootstrap §6 — never silently dropped).
//
// THE RULE (ROADMAP EL17):
//   - RedBacklog is a TOTAL, DETERMINISTIC topological sort: every emitted Idea appears exactly once,
//     same graph → byte-identical order.
//   - A cycle in the edges over the emitting rungs is REFUSED with BESOIN_CYCLE — never an arbitrary
//     order (determinism would be lost).
//   - NoEmit rungs (journey/view) appear in anchors_above[] but NEVER in the item list (no silent cast).
//   - The mirror form is ANNEXED, NEVER written (the wall — promotion = the user writing the mirror
//     via /goal; HasMirror stays false on every Idea).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). The topo sort is a PURE algorithm (Kahn over the emitting rungs,
// ties broken by the declared descent rank → a TOTAL order), never an LLM ordering the backlog. The
// reproducibility mirror (red_backlog_property_test.go) pins same-input→same-output, total coverage,
// topo-correctness, the cycle refusal, the NoEmit-not-in-list law, and the form-annexed law.
//
// THE WALL (CLAUDE.md §2). RedBacklog reads only the BesoinGraph above the line and writes NOTHING: no
// kernel, no mirror, no Idea persistence. It RETURNS the ordered items; the legal idea_capture door
// (EL16/EL15 MCP) is the only writer, and even it never touches kernel/mirrors/fitness.

import (
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
)

// BesoinBlockCode for EL17.
const (
	// CodeBesoinCycle — the constrains/seeds edges over the emitting rungs form a cycle: there is no
	// total topological order, so the backlog is refused (determinism would be lost). The need graph
	// is the §23 verticale, which is acyclic by construction; a cycle is a malformed graph.
	CodeBesoinCycle BesoinBlockCode = "BESOIN_CYCLE"
)

// RefStatus is the @version resolution status of a single outgoing ref of a backlog item's rung.
type RefStatus struct {
	// Field is the grammar ref-field carrying the reference (EL02 LevelSpec.RefField).
	Field string `json:"field"`
	// To is the deeper Level the reference resolves toward.
	To Level `json:"to"`
	// Resolved is true iff the targeted deeper rung exists as a resolved node in the graph (resolves
	// @version). False = a dangling forward-dep (carried as an OpenQuestion, never blocking).
	Resolved bool `json:"resolved"`
}

// BacklogItem is one ordered entry of the RedBacklog: the projected Idea plus the topological context
// the app-builder needs to open its /goal in architectural order.
type BacklogItem struct {
	// Idea is the projected candidate-truth (EL16, content-addressed, draft, provenance human). No
	// version, no mirror — by construction (the wall).
	Idea ideas.Idea `json:"idea"`
	// FromLevel is the SOURCE rung this Idea was projected from (the position on the §23 verticale).
	FromLevel Level `json:"from_level"`
	// MirrorForm is the EXPECTED mirror form of this rung (LevelMirrorForm, EL10) — ANNEXED, never
	// written. product/journey→Gherkin N0, invariant→property N1, operation→fixture N2, etc.
	MirrorForm MirrorForm `json:"mirror_form"`
	// AnchorsAbove are the frozen SOURCE rungs strictly above this item — INCLUDING the NoEmit
	// journey/view rungs that constrain it without emitting (the compound made visible). Top-most first.
	AnchorsAbove []Anchor `json:"anchors_above,omitempty"`
	// ResolvedRefs are the outgoing refs of this rung that resolve @version (the deeper rung exists
	// resolved in the graph).
	ResolvedRefs []RefStatus `json:"resolved_refs,omitempty"`
	// UnresolvedRefs are the outgoing refs whose deeper rung is absent (a forward-dep). Carried, never
	// dropped — each surfaces a carried OpenQuestion (bootstrap §6, non-blocking).
	UnresolvedRefs []RefStatus `json:"unresolved_refs,omitempty"`
	// OpenQuestions are the carried, non-blocking forward-dep notes (one per unresolved ref) — exactly
	// the bootstrap §6 "carried, not a residual" discipline.
	OpenQuestions []string `json:"open_questions,omitempty"`
}

// CycleError is the typed BESOIN_CYCLE refusal. It carries the closed code so callers can branch on it
// without string-matching.
type CycleError struct {
	cycle []Level
}

func (e *CycleError) Error() string {
	return fmt.Sprintf("besoin: red-backlog: the emitting rungs form a cycle (%v) — no total topological order (%s)", e.cycle, CodeBesoinCycle)
}

// Code returns the closed BlockReason code of the cycle refusal.
func (e *CycleError) Code() BesoinBlockCode { return CodeBesoinCycle }

// Cycle returns the rungs participating in the detected cycle (for the BlockReason explanation).
func (e *CycleError) Cycle() []Level { return e.cycle }

// AsCycleError reports whether err is a BESOIN_CYCLE refusal and returns the typed value.
func AsCycleError(err error) (*CycleError, bool) {
	ce, ok := err.(*CycleError)
	return ce, ok
}

// RedBacklog topo-sorts the emitted Ideas (the resolved MAPPING rungs, EL16) along the constrains/seeds
// edges into the exact architectural promotion order. It is PURE, TOTAL and DETERMINISTIC. It returns a
// *CycleError (code BESOIN_CYCLE) when the edges over the emitting rungs form a cycle. It writes
// nothing: the mirror form is ANNEXED, never written; no Idea is persisted here.
func RedBacklog(g BesoinGraph) ([]BacklogItem, error) {
	// The emitted Ideas in their canonical (descent) order (EL16, stored-status door) — the topo seed.
	emitted, err := EmitIdeasWithProvenance(g)
	if err != nil {
		return nil, fmt.Errorf("besoin: red-backlog: %w", err)
	}
	return backlogFrom(g, emitted)
}

// RedBacklogUnion is the door-facing topo-sorted backlog: a rung is "resolved" iff its stored Status is
// resolved OR the PURE EL07 verdict CanDescend(graph, level, meta).Enough is true — the UNION the EL15
// MCP uses against the PERSISTED graph (nodes stored as `drafting`, right-sizing recomputed). It reuses
// EmitIdeasUnion (the same content-addressed Ideas EmitIdeasUnion yields) then topo-sorts them. PURE,
// TOTAL, DETERMINISTIC: same (graph, meta) → byte-identical backlog. A cycle is refused (BESOIN_CYCLE).
func RedBacklogUnion(g BesoinGraph, metaOf MetaAccessor) ([]BacklogItem, error) {
	if metaOf == nil {
		metaOf = func(Level) Metadata { return Metadata{} }
	}
	emitted := make([]EmittedIdea, 0, len(g.Nodes))
	for i := range g.Nodes {
		node := g.Nodes[i]
		resolved := node.Status == NodeResolved || CanDescend(g, node.Level, metaOf(node.Level)).Enough
		if !resolved {
			continue
		}
		m, err := LevelToProposesChecked(node.Level)
		if err != nil {
			return nil, fmt.Errorf("besoin: red-backlog: %w", err)
		}
		if m.Kind != MappingEmit {
			continue // journey/view/invariant — NoEmit (they ground via anchors_above, never the list).
		}
		idea, err := projectNode(node, m.Proposes)
		if err != nil {
			return nil, err
		}
		emitted = append(emitted, EmittedIdea{Idea: idea, FromLevel: node.Level})
	}
	return backlogFrom(g, emitted)
}

// backlogFrom topo-sorts a set of emitted Ideas (the mapping rungs) into the ordered backlog. Shared by
// RedBacklog (stored-status door) and RedBacklogUnion (EL07-union door). Pure, total.
func backlogFrom(g BesoinGraph, emitted []EmittedIdea) ([]BacklogItem, error) {
	// The set of emitting rungs (the only nodes that become backlog items).
	emitting := make(map[Level]bool, len(emitted))
	ideaByLevel := make(map[Level]ideas.Idea, len(emitted))
	for _, e := range emitted {
		emitting[e.FromLevel] = true
		ideaByLevel[e.FromLevel] = e.Idea
	}

	// Topologically sort the emitting rungs along the edges (constrains + seeds) that connect two
	// emitting rungs. Ties broken by the declared descent rank → a TOTAL deterministic order. A cycle
	// is refused (BESOIN_CYCLE).
	order, cerr := topoSortEmitting(g, emitting)
	if cerr != nil {
		return nil, cerr
	}

	// Build the ordered items, annexing anchors_above (NoEmit rungs included), the mirror form
	// (LevelMirrorForm, EL10), and the @version ref resolution.
	out := make([]BacklogItem, 0, len(order))
	for _, lvl := range order {
		node, _ := g.Node(lvl)
		form, _ := LevelMirrorForm(lvl) // total over the 9 grammar levels; emitting rungs always have one.
		item := BacklogItem{
			Idea:         ideaByLevel[lvl],
			FromLevel:    lvl,
			MirrorForm:   form,
			AnchorsAbove: AnchorsAbove(g, lvl), // includes NoEmit journey/view rungs (the compound visible).
		}
		resolved, unresolved, oqs := resolveItemRefs(g, node)
		item.ResolvedRefs = resolved
		item.UnresolvedRefs = unresolved
		item.OpenQuestions = oqs
		out = append(out, item)
	}
	return out, nil
}

// topoSortEmitting runs Kahn's algorithm over the emitting rungs, using the constrains/seeds edges that
// connect two emitting rungs as the precedence relation (From before To). Ties (multiple in-degree-zero
// rungs) are broken by the declared descent rank then the level string → a TOTAL deterministic order. A
// remaining set after the queue drains means a cycle → a *CycleError (BESOIN_CYCLE). Pure.
func topoSortEmitting(g BesoinGraph, emitting map[Level]bool) ([]Level, error) {
	// adjacency + in-degree over the emitting rungs only.
	adj := map[Level][]Level{}
	indeg := map[Level]int{}
	for l := range emitting {
		indeg[l] = 0
	}
	// De-duplicate edges (From,To) so a doubled edge does not inflate the in-degree.
	type pair struct{ from, to Level }
	seenEdge := map[pair]bool{}
	for _, e := range g.Edges {
		if !emitting[e.From] || !emitting[e.To] {
			continue // only edges between two emitting rungs constrain the backlog order.
		}
		if e.From == e.To {
			// A self-loop is a degenerate cycle.
			return nil, &CycleError{cycle: []Level{e.From}}
		}
		p := pair{e.From, e.To}
		if seenEdge[p] {
			continue
		}
		seenEdge[p] = true
		adj[e.From] = append(adj[e.From], e.To)
		indeg[e.To]++
	}

	// Kahn with a deterministic tie-break: among in-degree-zero rungs pick the smallest by descent rank.
	ready := make([]Level, 0, len(emitting))
	for l := range emitting {
		if indeg[l] == 0 {
			ready = append(ready, l)
		}
	}
	sortByRank(ready)

	order := make([]Level, 0, len(emitting))
	for len(ready) > 0 {
		// Pop the smallest-rank ready rung.
		cur := ready[0]
		ready = ready[1:]
		order = append(order, cur)
		// Decrement successors; collect newly-ready, then re-sort to keep the total order.
		newlyReady := false
		succ := append([]Level(nil), adj[cur]...)
		sortByRank(succ)
		for _, to := range succ {
			indeg[to]--
			if indeg[to] == 0 {
				ready = append(ready, to)
				newlyReady = true
			}
		}
		if newlyReady {
			sortByRank(ready)
		}
	}

	if len(order) != len(emitting) {
		// The rungs not in `order` participate in a cycle.
		remaining := make([]Level, 0)
		placed := map[Level]bool{}
		for _, l := range order {
			placed[l] = true
		}
		for l := range emitting {
			if !placed[l] {
				remaining = append(remaining, l)
			}
		}
		sortByRank(remaining)
		return nil, &CycleError{cycle: remaining}
	}
	return order, nil
}

// sortByRank sorts levels by their declared descent rank, then by the level string — a TOTAL, stable,
// deterministic order (the tie-break of the topo sort). Pure.
func sortByRank(ls []Level) {
	sort.Slice(ls, func(a, b int) bool {
		ra, rb := levelRank(ls[a]), levelRank(ls[b])
		if ra != rb {
			return ra < rb
		}
		return ls[a] < ls[b]
	})
}

// resolveItemRefs classifies a node's outgoing refs by @version resolution: a ref resolves iff its
// targeted deeper rung exists as a RESOLVED node in the graph; otherwise it is a dangling forward-dep,
// carried as a non-blocking OpenQuestion (bootstrap §6 — never dropped). Pure, total. The node's own
// carried OpenQuestions (EL07/EL08) are preserved AND the dangling-ref notes are appended.
func resolveItemRefs(g BesoinGraph, node LevelNode) (resolved, unresolved []RefStatus, oqs []string) {
	// Start from any OpenQuestions the node already carries (deeper-level gaps from EL07/EL08).
	oqs = append(oqs, node.OpenQuestions...)
	for _, r := range node.Refs {
		target, ok := g.Node(r.To)
		isResolved := ok && target.Status == NodeResolved
		st := RefStatus{Field: r.Field, To: r.To, Resolved: isResolved}
		if isResolved {
			resolved = append(resolved, st)
		} else {
			unresolved = append(unresolved, st)
			oqs = append(oqs, fmt.Sprintf(
				"ref %q (%s→%s) ne résout pas @version : le niveau cible n'existe pas encore (forward-dep portée, bootstrap §6 — non bloquant)",
				r.Field, node.Level, r.To))
		}
	}
	// Canonicalize the OpenQuestions order for a stable address.
	sort.Strings(oqs)
	return resolved, unresolved, oqs
}
