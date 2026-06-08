// Package archfitness is the STRUCTURAL RATCHET of KRD §47 — "le second cliquet" — and the
// app-builder EPIC 11 (S102). Where S05 (mirror-runner) gives the BEHAVIOURAL ratchet (a
// previously-green mirror may never go red), this package gives the ORTHOGONAL one: the
// ARCH-FITNESS ratchet over the inter-cell dependency graph. It prevents "tests verts,
// système pourri" — a cut where every behavioural mirror is green yet the architecture has
// rotted: a new boundary violation drawn, a new inter-cell cycle introduced, the inter-BC
// dependency surface grown, or a cell's complexity climbed.
//
// THE LAW (§47, monotone ratchet): the structural metrics of a federation can only HOLD or
// IMPROVE between two cuts. They are NON-INCREASING — never allowed to climb. The four
// metrics, all "lower is better":
//
//   - BoundaryViolations — inter-cell edges that cross NO honored contract pair (the §46 wall
//     broken structurally): an edge from cell A to cell B where no HONORED contracts_with link
//     connects them. This is cell.CheckCrossCellAccess lifted from one call to the WHOLE edge
//     set — the same wall (CLAUDE.md §2), counted, never a second divergent gate.
//   - InterCellCycles — the number of cycles in the inter-cell dependency digraph (a federation
//     must stay a DAG of bounded contexts; a cycle is architectural rot). Counted by Tarjan SCC
//     (every SCC of size > 1, plus every self-loop) — an algorithm, never an LLM judgment.
//   - InterBCEdges — the count of DISTINCT inter-cell (cross-bounded-context) dependency edges:
//     the coupling surface of the federation. Fewer is better (§45 "la grandeur vit dans le
//     NOMBRE de cellules, jamais dans la taille d'une" — but the EDGES between them stay scarce).
//   - MaxCellComplexity — the largest per-cell node count (the biggest cell). A cell that swells
//     is a cell drifting toward a monolith; the ratchet keeps the biggest cell from growing.
//
// This package lands exactly that, as PURE total functions:
//
//   - Measure(graph) → StructuralMetric — the deterministic arch-fitness measurement of one
//     federation cut: the four metrics + the concrete violation/cycle witnesses. This is the
//     go-arch-lint/depguard (AIDOS side) and dependency-cruiser (emitted side) verdict made
//     first-rank and content-addressed — NOT a shell-out to those tools, the SAME structural
//     judgment computed in pure Go so it is replayable (the property mirror pins it).
//
//   - Ratchet(baseline, candidate) → RatchetVerdict — the monotone gate: HELD when EVERY metric
//     is non-increasing (candidate ≤ baseline, component-wise), BROKEN otherwise — and the
//     verdict carries the precise metric(s) that climbed. A BROKEN verdict BLOCKS THE CUT (the
//     done-criterion) INDEPENDENT of the behavioural mirrors: a green-mirror cut with a new
//     boundary violation or a new cycle is REFUSED here.
//
//   - Propose(graph, baseline, label, parentPhase) → changeset.ChangeSet — persist the
//     structural baseline as Kernel truth THE ONLY LEGAL WAY (propose → ChangeSet → approval,
//     CLAUDE.md §2 the wall): it WRITES NOTHING; it returns the DRAFT envelope a human approves.
//     The envelope carries the measured metric (spec delta) AND the ratchet verdict (mirror
//     delta — the structural proof), so it cannot drift past the completeness gate.
//
// PURE (CLAUDE.md §6/§8 determinism-first): no DB, no clock, no rng, no I/O, no LLM. Every
// function is TOTAL and DETERMINISTIC — same input ⇒ same metric + same content-hash + same
// verdict — so the arch-fitness measurement and the ratchet refusal are REPLAYABLE. The
// content-addressed metric hash reuses records.Hash(Canonicalize) — NOT forked here. READ-ONLY
// against truth; Propose returns a DRAFT envelope, it does not persist it.
package archfitness

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/cell"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// DepEdge is one DIRECTED inter-node dependency the structural graph carries: node From (in
// cell FromCell) depends on node To (in cell ToCell). Intra-cell edges (FromCell == ToCell)
// are a cell's internals and DO NOT count toward inter-BC coupling or boundary violations;
// only CROSS-cell edges (FromCell != ToCell) cross the §46 wall and feed the ratchet.
type DepEdge struct {
	// From is the depending node id.
	From string `json:"from"`
	// FromCell is the bounded context From lives in.
	FromCell cell.Ref `json:"from_cell"`
	// To is the depended-upon node id.
	To string `json:"to"`
	// ToCell is the bounded context To lives in.
	ToCell cell.Ref `json:"to_cell"`
}

// isCross reports whether the edge crosses a cell boundary (an inter-BC edge).
func (e DepEdge) isCross() bool { return e.FromCell != e.ToCell }

// DepGraph is one federation cut's inter-cell dependency graph: the project, the cells that
// exist (with their node counts, for the complexity metric), the directed dependency edges,
// and the honored contract pairs (which inter-cell crossings the §46 wall AUTHORIZES). It is
// the read-only projection Measure runs over — the router never fetches it; it is handed in.
type DepGraph struct {
	// Project is the project_id (S55) the cut belongs to.
	Project string `json:"project"`
	// Cells maps each cell ref to its node count (the cell's size — the complexity input).
	Cells map[cell.Ref]int `json:"cells"`
	// Edges are the directed dependency edges between nodes (intra- and inter-cell).
	Edges []DepEdge `json:"edges"`
	// Federation is the honored contract pairs (S101): an inter-cell edge is a BOUNDARY
	// VIOLATION iff no honored contracts_with link connects its two cells.
	Federation cell.Federation `json:"federation"`
}

// BoundaryViolation is one concrete inter-cell edge that crosses NO honored contract — the
// §46 wall broken structurally. It names the edge so the panel and the BlockReason can point
// at exactly what to fix (design a contract, or remove the dependency).
type BoundaryViolation struct {
	From     string   `json:"from"`
	FromCell cell.Ref `json:"from_cell"`
	To       string   `json:"to"`
	ToCell   cell.Ref `json:"to_cell"`
}

// StructuralMetric is the deterministic arch-fitness measurement of ONE federation cut: the
// four "lower-is-better" metrics + the concrete witnesses (which edges violate the wall, which
// cell groups form a cycle). It is content-addressed (Hash) and reproducible.
type StructuralMetric struct {
	// Project echoes the cut's project.
	Project string `json:"project"`
	// BoundaryViolations is the COUNT of inter-cell edges crossing no honored contract.
	BoundaryViolations int `json:"boundary_violations"`
	// InterCellCycles is the COUNT of cycles in the inter-cell dependency digraph.
	InterCellCycles int `json:"inter_cell_cycles"`
	// InterBCEdges is the COUNT of distinct inter-cell (cross-BC) dependency edges.
	InterBCEdges int `json:"inter_bc_edges"`
	// MaxCellComplexity is the largest per-cell node count (the biggest cell).
	MaxCellComplexity int `json:"max_cell_complexity"`
	// Violations are the concrete boundary-violation witnesses (sorted, for the panel).
	Violations []BoundaryViolation `json:"violations"`
	// Cycles are the concrete inter-cell cycles, each a sorted set of cell refs (sorted).
	Cycles [][]cell.Ref `json:"cycles"`
}

// Measure computes the StructuralMetric of one federation cut — the arch-fitness verdict made
// first-rank (go-arch-lint/depguard + dependency-cruiser semantics, in pure Go). It is the
// done-criterion's measurement half: a NEW boundary violation or a NEW cycle shows up here as
// a higher count, which Ratchet then refuses.
//
// PURE + TOTAL: no DB/clock/rng/I/O/LLM. Same graph ⇒ same metric (the property mirror pins
// "same input → same output"). Determinism-first: every count is a graph algorithm, never a
// judgment — boundary violations are a wall-check per edge, cycles are Tarjan SCC, edge count
// is a dedup, complexity is a max.
func Measure(g DepGraph) StructuralMetric {
	m := StructuralMetric{
		Project:    g.Project,
		Violations: []BoundaryViolation{},
		Cycles:     [][]cell.Ref{},
	}

	// Boundary violations + inter-BC edge count over DISTINCT inter-cell edges.
	seen := map[string]struct{}{}
	for _, e := range g.Edges {
		if !e.isCross() {
			continue
		}
		key := string(e.FromCell) + "\x00" + e.From + "\x00" + string(e.ToCell) + "\x00" + e.To
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		m.InterBCEdges++
		// The §46 wall, lifted to the edge: the door is closed unless a HONORED contract
		// connects the two cells. We REUSE cell.CheckCrossCellAccess — one wall, not two.
		if cell.CheckCrossCellAccess(e.FromCell, e.ToCell, g.Federation) != nil {
			m.Violations = append(m.Violations, BoundaryViolation{
				From: e.From, FromCell: e.FromCell, To: e.To, ToCell: e.ToCell,
			})
		}
	}
	sort.Slice(m.Violations, func(i, j int) bool {
		if m.Violations[i].FromCell != m.Violations[j].FromCell {
			return m.Violations[i].FromCell < m.Violations[j].FromCell
		}
		if m.Violations[i].From != m.Violations[j].From {
			return m.Violations[i].From < m.Violations[j].From
		}
		if m.Violations[i].ToCell != m.Violations[j].ToCell {
			return m.Violations[i].ToCell < m.Violations[j].ToCell
		}
		return m.Violations[i].To < m.Violations[j].To
	})
	m.BoundaryViolations = len(m.Violations)

	// Inter-cell cycles: build the cell-level digraph (a cross-cell edge A->B becomes the cell
	// edge FromCell->ToCell) and count its cycles via Tarjan SCC + self-loops.
	m.Cycles = interCellCycles(g.Edges)
	m.InterCellCycles = len(m.Cycles)

	// Max cell complexity: the biggest cell's node count.
	for _, n := range g.Cells {
		if n > m.MaxCellComplexity {
			m.MaxCellComplexity = n
		}
	}
	return m
}

// interCellCycles returns every cycle in the CELL-LEVEL dependency digraph: each strongly
// connected component of size > 1 (a multi-cell cycle) and each self-loop (a cell depending on
// itself across the boundary — degenerate but counted). Each cycle is the SORTED set of cell
// refs in the component. Deterministic (Tarjan over sorted adjacency, sorted output).
func interCellCycles(edges []DepEdge) [][]cell.Ref {
	// Build the cell-level adjacency (cross-cell edges only), deduplicated.
	adj := map[cell.Ref]map[cell.Ref]struct{}{}
	nodes := map[cell.Ref]struct{}{}
	selfLoop := map[cell.Ref]struct{}{}
	for _, e := range edges {
		if !e.isCross() {
			continue
		}
		nodes[e.FromCell] = struct{}{}
		nodes[e.ToCell] = struct{}{}
		if adj[e.FromCell] == nil {
			adj[e.FromCell] = map[cell.Ref]struct{}{}
		}
		adj[e.FromCell][e.ToCell] = struct{}{}
	}
	// (A self-loop at cell level is impossible: a cross edge has FromCell != ToCell.)
	_ = selfLoop

	sccs := tarjan(nodes, adj)
	out := [][]cell.Ref{}
	for _, comp := range sccs {
		if len(comp) > 1 {
			c := append([]cell.Ref(nil), comp...)
			sort.Slice(c, func(i, j int) bool { return c[i] < c[j] })
			out = append(out, c)
		}
	}
	// Deterministic order of cycles: by first ref, then length.
	sort.Slice(out, func(i, j int) bool {
		if out[i][0] != out[j][0] {
			return out[i][0] < out[j][0]
		}
		return len(out[i]) < len(out[j])
	})
	return out
}

// tarjan returns the strongly connected components of the cell digraph. Deterministic: nodes
// and adjacency are visited in sorted order, so the SCC set (and its members) is stable.
func tarjan(nodes map[cell.Ref]struct{}, adj map[cell.Ref]map[cell.Ref]struct{}) [][]cell.Ref {
	order := make([]cell.Ref, 0, len(nodes))
	for n := range nodes {
		order = append(order, n)
	}
	sort.Slice(order, func(i, j int) bool { return order[i] < order[j] })

	index := map[cell.Ref]int{}
	low := map[cell.Ref]int{}
	onStack := map[cell.Ref]bool{}
	var stack []cell.Ref
	idx := 0
	var sccs [][]cell.Ref

	var sortedSucc func(n cell.Ref) []cell.Ref
	sortedSucc = func(n cell.Ref) []cell.Ref {
		s := make([]cell.Ref, 0, len(adj[n]))
		for m := range adj[n] {
			s = append(s, m)
		}
		sort.Slice(s, func(i, j int) bool { return s[i] < s[j] })
		return s
	}

	var strongconnect func(v cell.Ref)
	strongconnect = func(v cell.Ref) {
		index[v] = idx
		low[v] = idx
		idx++
		stack = append(stack, v)
		onStack[v] = true
		for _, w := range sortedSucc(v) {
			if _, ok := index[w]; !ok {
				strongconnect(w)
				if low[w] < low[v] {
					low[v] = low[w]
				}
			} else if onStack[w] {
				if index[w] < low[v] {
					low[v] = index[w]
				}
			}
		}
		if low[v] == index[v] {
			var comp []cell.Ref
			for {
				w := stack[len(stack)-1]
				stack = stack[:len(stack)-1]
				onStack[w] = false
				comp = append(comp, w)
				if w == v {
					break
				}
			}
			sccs = append(sccs, comp)
		}
	}

	for _, n := range order {
		if _, ok := index[n]; !ok {
			strongconnect(n)
		}
	}
	return sccs
}

// CodeStructuralRegression is the BlockReason code the structural ratchet emits when a metric
// climbed (the cut would worsen the architecture). It BLOCKS THE CUT — the done-criterion.
const CodeStructuralRegression = "STRUCTURAL_REGRESSION"

// RatchetState is the structural ratchet's verdict for a candidate against its baseline.
type RatchetState string

const (
	// StateHeld — EVERY metric is non-increasing (candidate ≤ baseline): the cut may proceed.
	StateHeld RatchetState = "HELD"
	// StateBroken — at least one metric climbed: the cut is BLOCKED (architectural rot refused).
	StateBroken RatchetState = "BROKEN"
)

// MetricClimb names ONE metric that climbed between baseline and candidate (the structural
// regression witness). Every climb is precise — never a vague "fail".
type MetricClimb struct {
	// Metric is the metric name (boundary_violations | inter_cell_cycles | inter_bc_edges |
	// max_cell_complexity).
	Metric string `json:"metric"`
	// Baseline is the metric's value at the baseline cut.
	Baseline int `json:"baseline"`
	// Candidate is the metric's value on the candidate cut (> Baseline ⇒ a climb).
	Candidate int `json:"candidate"`
}

// BlockReason is the actionable refusal the structural ratchet emits (CLAUDE.md §2: a block
// always names the door). Same shape as the behavioural cliquet's BlockReason.
type BlockReason struct {
	Code        string   `json:"code"`
	Severity    string   `json:"severity"`
	Explanation string   `json:"explanation"`
	HowToFix    []string `json:"how_to_fix"`
}

func (b *BlockReason) Error() string { return b.Explanation }

// RatchetVerdict is the monotone gate's decision: the state, the climbs that broke it (if
// any), and the actionable BlockReason (nil when HELD). Content of the structural ratchet.
type RatchetVerdict struct {
	// State is HELD or BROKEN.
	State RatchetState `json:"state"`
	// Climbs are the metrics that climbed (empty when HELD), sorted by metric name.
	Climbs []MetricClimb `json:"climbs"`
	// Block is the refusal (nil when HELD).
	Block *BlockReason `json:"block,omitempty"`
}

// Ratchet is the STRUCTURAL CLIQUET in one pure call: it compares the candidate's metric to
// the baseline's, component-wise, and HOLDS iff EVERY metric is non-increasing. The FIRST a
// metric climbs, the cut is BROKEN — and the verdict names every climb. This is the
// done-criterion: a new boundary violation OR a new inter-cell cycle reddens the structural
// ratchet and BLOCKS THE CUT, INDEPENDENT of the behavioural mirrors (which may all be green).
//
// PURE + TOTAL: no DB/clock/rng/I/O/LLM. Same (baseline, candidate) ⇒ same verdict (the
// property mirror pins it). It writes nothing (the wall): the baseline moves only via the
// Propose ChangeSet, never a write from here.
func Ratchet(baseline, candidate StructuralMetric) RatchetVerdict {
	climbs := []MetricClimb{}
	add := func(name string, b, c int) {
		if c > b {
			climbs = append(climbs, MetricClimb{Metric: name, Baseline: b, Candidate: c})
		}
	}
	add("boundary_violations", baseline.BoundaryViolations, candidate.BoundaryViolations)
	add("inter_cell_cycles", baseline.InterCellCycles, candidate.InterCellCycles)
	add("inter_bc_edges", baseline.InterBCEdges, candidate.InterBCEdges)
	add("max_cell_complexity", baseline.MaxCellComplexity, candidate.MaxCellComplexity)

	sort.Slice(climbs, func(i, j int) bool { return climbs[i].Metric < climbs[j].Metric })

	if len(climbs) == 0 {
		return RatchetVerdict{State: StateHeld, Climbs: climbs}
	}
	names := make([]string, len(climbs))
	for i, c := range climbs {
		names[i] = fmt.Sprintf("%s (%d→%d)", c.Metric, c.Baseline, c.Candidate)
	}
	return RatchetVerdict{
		State:  StateBroken,
		Climbs: climbs,
		Block: &BlockReason{
			Code:     CodeStructuralRegression,
			Severity: "error",
			Explanation: "Le cliquet structurel refuse la coupe : une métrique d'architecture a augmenté (régression structurelle), " +
				"indépendamment des miroirs comportementaux verts. Métriques en hausse : " + joinStrings(names) + ".",
			HowToFix: []string{
				"Réparez l'architecture jusqu'à ce que chaque métrique redevienne ≤ la base : retirez la dépendance inter-cellule non contractée, ou concevez le contrat manquant dans la Context-Map (S101).",
				"Si c'est un cycle inter-cellule, brisez-le (un bounded context ne dépend jamais en boucle d'un autre — la fédération reste un DAG).",
				"Si la hausse est intentionnelle (un nouveau besoin d'architecture), ouvrez un /goal et déplacez la base via le ChangeSet — jamais une écriture furtive.",
			},
		},
	}
}

// canonicalMetric is the content-addressed portion of a StructuralMetric.
type canonicalMetric struct {
	Kind               string              `json:"kind"` // always "structural-metric"
	Project            string              `json:"project"`
	BoundaryViolations int                 `json:"boundary_violations"`
	InterCellCycles    int                 `json:"inter_cell_cycles"`
	InterBCEdges       int                 `json:"inter_bc_edges"`
	MaxCellComplexity  int                 `json:"max_cell_complexity"`
	Violations         []BoundaryViolation `json:"violations"`
	Cycles             [][]cell.Ref        `json:"cycles"`
}

// Hash is the content-addressed id of the metric — the SAME scheme records.Hash(Canonicalize)
// uses (NOT forked). Two equal measurements share an id; a changed cut changes the id.
func (m StructuralMetric) Hash() (string, error) {
	body, err := json.Marshal(canonicalMetric{
		Kind:               "structural-metric",
		Project:            m.Project,
		BoundaryViolations: m.BoundaryViolations,
		InterCellCycles:    m.InterCellCycles,
		InterBCEdges:       m.InterBCEdges,
		MaxCellComplexity:  m.MaxCellComplexity,
		Violations:         m.Violations,
		Cycles:             m.Cycles,
	})
	if err != nil {
		return "", err
	}
	canon, err := records.Canonicalize(body)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// Propose builds the DRAFT ChangeSet that persists the structural BASELINE as Kernel truth THE
// ONLY LEGAL WAY (propose → ChangeSet → approval, CLAUDE.md §2 the wall): it WRITES NOTHING —
// it returns the envelope a human approves. The spec delta carries the measured metric; the
// mirror delta carries the ratchet verdict against the PRIOR baseline (the structural proof),
// so the envelope cannot pass the completeness gate without its proof. The metric id is the
// spec delta's Target — content-addressed.
func Propose(g DepGraph, baseline StructuralMetric, label, parentPhase string) (changeset.ChangeSet, error) {
	candidate := Measure(g)
	id, err := candidate.Hash()
	if err != nil {
		return changeset.ChangeSet{}, err
	}
	specBody, err := json.Marshal(canonicalMetric{
		Kind:               "structural-metric",
		Project:            candidate.Project,
		BoundaryViolations: candidate.BoundaryViolations,
		InterCellCycles:    candidate.InterCellCycles,
		InterBCEdges:       candidate.InterBCEdges,
		MaxCellComplexity:  candidate.MaxCellComplexity,
		Violations:         candidate.Violations,
		Cycles:             candidate.Cycles,
	})
	if err != nil {
		return changeset.ChangeSet{}, err
	}
	mirrorBody, err := json.Marshal(Ratchet(baseline, candidate))
	if err != nil {
		return changeset.ChangeSet{}, err
	}
	spec := &changeset.Delta{Kind: "add", Target: "structural-metric:" + id, Body: specBody}
	mirror := &changeset.Delta{Kind: "add", Target: "mirror:structural-metric:" + id, Body: mirrorBody}
	return changeset.Open(label, parentPhase, spec, mirror)
}

// joinStrings joins with ", " without importing strings for one call.
func joinStrings(in []string) string {
	out := ""
	for i, s := range in {
		if i > 0 {
			out += ", "
		}
		out += s
	}
	return out
}
