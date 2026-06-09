// Package grid implements FK03 — the GRILLE (the two axes of FKE-1.4): every truth in
// AIDOS carries TWO coordinates, and the grid resolves it to a single deterministic CELL.
//
// KRD FKE-1.4: a truth is never one-dimensional. It lives at the crossing of:
//
//   - the VERTICALE (the architectural rung, produit→entité) — the LATERAL, COUPLING axis.
//     The seven KRD §23 source rungs descend product → journey → view → control → action →
//     operation → entity. They COUPLE: a rung rests on the rungs below it (an operation
//     rests on its entity; a control rests on its action). A change LOW marks the SOURCE
//     rungs ABOVE it stale — the foundation moved, so what stands on it must be re-proven.
//
//   - the FACETTE (the nature of the truth, FK02) — the ORTHOGONAL, SEPARATING axis. The
//     eight canonical lenses F/I/S/B/R/V/M/X (back/kernel/facets) read the SAME skeleton
//     through eight independent questions. They DO NOT interact: a change on the security
//     facet (S) of a truth never disturbs its budget facet (B). The facette separates.
//
// A CELL is the crossing (Level × Facet). The grid's three laws (the FK03 done-criteria):
//
//  1. DETERMINISTIC RESOLUTION — every truth resolves to exactly one cell (Resolve), a pure
//     total function of (level, facet). Same truth ⇒ same cell, content-addressed (Hash).
//
//  2. LATERAL COUPLING (the verticale) — MarkStale(level) returns the source rungs ABOVE
//     `level` (its dependents on the descent path): a change at a low rung marks the rungs
//     above it stale. The verticale COUPLES upward. The transversal bands (invariant/policy)
//     are NOT on the descent path — they are attached laterally, never traversed by the mark.
//
//  3. FACET ORTHOGONALITY — the mark crosses ONLY the verticale; it NEVER changes a facet
//     (Project(cells, facet) re-reads a single facet column untouched by a verticale change).
//     The facets do not interact: AffectedCells(change) touches the changed truth's verticale
//     column but keeps every OTHER facet of every rung intact.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every function here is a PURE, TOTAL function over
// its inputs: no DB, no clock, no rng, no I/O, no LLM. The verticale rung ladder is the
// DECLARED §23 order (reused from runtime/besoin's source-rung order, never re-learned); the
// facet set is the DECLARED FK02 closed octuor. READ-ONLY against truth — this package writes
// nothing (the wall, CLAUDE.md §2): a cell is a COORDINATE the ContextRouter exposes, never a
// truth written from here. The reproducibility mirror (rapid) pins same-input ⇒ same-output.
package grid

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/facets"
)

// Rung is one rung of the VERTICALE — the architectural descent axis (produit→entité). It is
// the SAME identity space as runtime/besoin's source rungs (KRD §23): a rung is not a new id
// space, it is the architectural level promoted to a grid coordinate. Closed set.
type Rung string

const (
	// The 7 SOURCE rungs, in strict top-down DESCENT order (the order of this block IS the
	// descent order; a rung COUPLES to the rungs below it). Mirrors besoin.Level verbatim so
	// the grid and the BesoinGraph speak the same verticale (no second source of the ladder).
	RungProduct   Rung = "product"   // the intention + ≤N scenarios (top of the verticale)
	RungJourney   Rung = "journey"   // the user journey (Gherkin)
	RungView      Rung = "view"      // the screen (goal + zones + data)
	RungControl   Rung = "control"   // the button (visible_when/enabled_when/triggers)
	RungAction    Rung = "action"    // the action (invoke → operation)
	RungOperation Rung = "operation" // the operation (steps + fixture)
	RungEntity    Rung = "entity"    // the entity (attributes) — the FOUNDATION (bottom)
)

// rungOrder is the TOTAL, CLOSED, top-down order of the 7 SOURCE rungs (KRD §23). Declared,
// never learned (CLAUDE.md §8). Index 0 is the TOP (product), the last index the BOTTOM
// (entity). "Above" means a LOWER index; "below" a higher one. MarkStale walks this slice.
var rungOrder = []Rung{
	RungProduct,
	RungJourney,
	RungView,
	RungControl,
	RungAction,
	RungOperation,
	RungEntity,
}

// rungName maps each rung to its canonical KRD name. Declared, never derived.
var rungName = map[Rung]string{
	RungProduct:   "produit",
	RungJourney:   "parcours",
	RungView:      "écran",
	RungControl:   "bouton",
	RungAction:    "action",
	RungOperation: "opération",
	RungEntity:    "entité",
}

// rungIndex gives each source rung its position on the descent path (0 = top = product).
var rungIndex = func() map[Rung]int {
	m := make(map[Rung]int, len(rungOrder))
	for i, r := range rungOrder {
		m[r] = i
	}
	return m
}()

// Rungs returns the seven source rungs of the verticale in canonical top-down order. Used by
// the grid builder and the Workbench so the ladder is never invented. PURE.
func Rungs() []Rung {
	out := make([]Rung, len(rungOrder))
	copy(out, rungOrder)
	return out
}

// Name returns the canonical KRD name of a rung; an out-of-ladder rung returns "unknown".
func (r Rung) Name() string {
	if n, ok := rungName[r]; ok {
		return n
	}
	return "unknown"
}

// IsSourceRung reports whether r is one of the seven source rungs (on the descent path). The
// transversal bands (invariant/policy) are NOT source rungs — the verticale never traverses
// them, so the lateral mark never propagates through them. PURE.
func (r Rung) IsSourceRung() bool {
	_, ok := rungIndex[r]
	return ok
}

// Depth returns the rung's position on the descent path (0 = product/top, 6 = entity/bottom);
// -1 for an out-of-ladder rung. A SMALLER depth is "above" (closer to the product). PURE.
func (r Rung) Depth() int {
	if i, ok := rungIndex[r]; ok {
		return i
	}
	return -1
}

// Cell is the resolved GRID COORDINATE of a truth: the crossing of its verticale Rung and its
// FK02 Facet (FKE-1.4). It is the cell the ContextRouter exposes — every truth resolves to
// exactly one. Content-addressed (Hash) so the same coordinate always has the same address.
type Cell struct {
	// Rung — the truth's architectural rung on the verticale (the lateral, coupling axis).
	Rung Rung `json:"rung"`
	// Facet — the truth's FK02 facet (the orthogonal, separating axis).
	Facet facets.Facet `json:"facet"`
}

// Errors of the grid.
var (
	// ErrUnknownRung — a coordinate names a rung outside the closed seven-rung verticale.
	ErrUnknownRung = errors.New("grid: rung is not one of the seven source rungs of the verticale (FK03 §23)")
	// ErrUnknownFacet — a coordinate names a facet outside the closed eight-lens octuor (FK02).
	ErrUnknownFacet = errors.New("grid: facet is not one of the eight canonical lenses (F/I/S/B/R/V/M/X)")
)

// Resolve is LAW 1 (deterministic resolution): it resolves a truth's two raw coordinates to a
// single Cell. It is a PURE, TOTAL function — same (rung, facet) ⇒ same cell, always. An
// out-of-ladder rung (ErrUnknownRung) or out-of-octuor facet (ErrUnknownFacet) is REFUSED:
// the grid has no "default" cell, every truth must name a real verticale rung and a real
// facet. The transversal bands (invariant/policy) are NOT grid rungs — an invariant's truth
// is the I FACET of a source rung, not a rung of its own (so the grid stays a clean matrix).
func Resolve(rung Rung, facet facets.Facet) (Cell, error) {
	if !rung.IsSourceRung() {
		return Cell{}, fmt.Errorf("%w: %q", ErrUnknownRung, rung)
	}
	if !facet.IsCanonical() {
		return Cell{}, fmt.Errorf("%w: %q", ErrUnknownFacet, facet)
	}
	return Cell{Rung: rung, Facet: facet}, nil
}

// Hash content-addresses a Cell (deterministic): the SHA-256 of its canonical "<rung>:<facet>"
// form. Same coordinate ⇒ same address, regardless of how the Cell value was built. Matches
// the records/facets address scheme so a cell lands under the same hash family. PURE.
func (c Cell) Hash() string {
	body, _ := json.Marshal(struct {
		Rung  Rung         `json:"rung"`
		Facet facets.Facet `json:"facet"`
	}{Rung: c.Rung, Facet: c.Facet})
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

// String renders the cell as "<rung>×<facet>" for logs and the panel.
func (c Cell) String() string {
	return fmt.Sprintf("%s×%s", string(c.Rung), string(c.Facet))
}

// MarkStale is LAW 2 (lateral coupling — the verticale couples). Given a rung that CHANGED, it
// returns the SOURCE rungs ABOVE it (its dependents) that the change marks STALE, in top-down
// order. A change LOW on the verticale (e.g. entity) marks every source rung above it stale
// (operation, action, control, view, journey, product) — the foundation moved, so what stands
// on it must be re-proven. A change at the TOP (product) marks nothing above it (it is the
// summit). The changed rung itself is NOT included (it is changed, not stale-by-coupling).
//
// The transversal bands are never in the result (they are not on the descent path). An
// out-of-ladder rung returns an empty slice (nothing couples to a non-rung). PURE, TOTAL.
func MarkStale(changed Rung) []Rung {
	d := changed.Depth()
	if d < 0 {
		return []Rung{}
	}
	out := make([]Rung, 0, d)
	for i := 0; i < d; i++ {
		out = append(out, rungOrder[i])
	}
	return out
}

// Truth is a placed truth on the grid: its verticale rung and its facet. The read-only
// projection AffectedCells / Project compile over (the ContextRouter hands them in; nothing
// is fetched). Two truths with the same (Rung, Facet) sit in the same cell.
type Truth struct {
	// ID — the truth's content-addressed id (S02), surfaced verbatim.
	ID string `json:"id"`
	// Rung — the truth's verticale rung.
	Rung Rung `json:"rung"`
	// Facet — the truth's FK02 facet.
	Facet facets.Facet `json:"facet"`
}

// Change is a recorded change to ONE truth on the grid: which truth (its cell), used to
// compute the lateral blast radius while keeping the facets orthogonal.
type Change struct {
	// Rung — the rung the change lands on.
	Rung Rung `json:"rung"`
	// Facet — the facet the change lands on (the change stays IN this facet — orthogonality).
	Facet facets.Facet `json:"facet"`
}

// Affected is the blast radius of a Change on the grid, split by the two laws so the panel can
// show them apart: the lateral (verticale) marks and the explicit facet-untouched guarantee.
type Affected struct {
	// Changed — the cell the change landed on.
	Changed Cell `json:"changed"`
	// StaleRungs — the source rungs ABOVE the changed rung, marked stale by lateral coupling
	// (LAW 2), top-down. Empty when the change is at the product summit.
	StaleRungs []Rung `json:"stale_rungs"`
	// StaleCells — the stale rungs crossed with the SAME facet as the change (the cells the
	// verticale couples). The facet is HELD CONSTANT — the mark walks the rung column only.
	StaleCells []Cell `json:"stale_cells"`
	// UntouchedFacets — the other seven facets, which the change NEVER disturbs (LAW 3,
	// orthogonality), in canonical FK02 order. Surfaced so the panel can PROVE separation.
	UntouchedFacets []facets.Facet `json:"untouched_facets"`
}

// AffectedCells computes the blast radius of a Change under the two laws (the FK03 done-
// criterion made executable):
//
//   - LAW 2 (lateral coupling): the source rungs above the changed rung are marked stale, and
//     crossed with the change's facet HELD CONSTANT → StaleCells (the verticale couples).
//   - LAW 3 (facet orthogonality): UntouchedFacets enumerates every OTHER facet — the mark
//     never enters them. A change on facet S never produces a stale cell on facet B.
//
// An out-of-ladder rung or out-of-octuor facet yields an empty (but valid) Affected with the
// changed cell zero — Resolve is the validator; AffectedCells never panics. PURE, TOTAL: same
// Change ⇒ byte-identical Affected (the property mirror pins it).
func AffectedCells(ch Change) Affected {
	aff := Affected{
		StaleRungs:      []Rung{},
		StaleCells:      []Cell{},
		UntouchedFacets: []facets.Facet{},
	}
	cell, err := Resolve(ch.Rung, ch.Facet)
	if err != nil {
		return aff
	}
	aff.Changed = cell

	// LAW 2 — lateral coupling along the verticale, facet held constant.
	for _, r := range MarkStale(ch.Rung) {
		aff.StaleRungs = append(aff.StaleRungs, r)
		aff.StaleCells = append(aff.StaleCells, Cell{Rung: r, Facet: ch.Facet})
	}

	// LAW 3 — facet orthogonality: every OTHER facet is untouched (the mark never crosses).
	for _, f := range facets.Facets() {
		if f != ch.Facet {
			aff.UntouchedFacets = append(aff.UntouchedFacets, f)
		}
	}
	return aff
}

// Column is one facet COLUMN of the grid: a facet and the truths placed on it across the
// rungs, sorted top-down then by id. The orthogonal axis projected — a facet column is read
// independently of every other facet (LAW 3). Project produces these.
type Column struct {
	// Facet — which facet this column is.
	Facet facets.Facet `json:"facet"`
	// Cells — the (rung, facet) cells this column carries, in top-down rung order.
	Cells []Cell `json:"cells"`
	// Truths — the truth ids placed in this column, top-down by rung then by id.
	Truths []string `json:"truths"`
}

// Project is LAW 3 made readable: it projects a set of placed truths onto a SINGLE facet
// column — only the truths whose facet equals `facet`, sorted top-down by rung then by id.
// Because Project filters on the facet alone, a change confined to another facet leaves this
// column byte-identical — the facets do not interact. An out-of-octuor facet yields an empty
// column. PURE, TOTAL.
func Project(truths []Truth, facet facets.Facet) Column {
	col := Column{Facet: facet, Cells: []Cell{}, Truths: []string{}}
	type placed struct {
		id    string
		rung  Rung
		depth int
	}
	var sel []placed
	for _, t := range truths {
		if t.Facet != facet {
			continue
		}
		if !t.Rung.IsSourceRung() {
			continue
		}
		sel = append(sel, placed{id: t.ID, rung: t.Rung, depth: t.Rung.Depth()})
	}
	sort.Slice(sel, func(i, j int) bool {
		if sel[i].depth != sel[j].depth {
			return sel[i].depth < sel[j].depth // top-down (product first)
		}
		return sel[i].id < sel[j].id
	})
	for _, p := range sel {
		col.Cells = append(col.Cells, Cell{Rung: p.rung, Facet: facet})
		col.Truths = append(col.Truths, p.id)
	}
	return col
}

// Grid is the full matrix: every facet column built from a set of placed truths, in canonical
// FK02 facet order. The ContextRouter's view of "where every truth lives". Build produces it.
type Grid struct {
	// Columns — one per canonical facet (F→X), each carrying its truths.
	Columns []Column `json:"columns"`
}

// Build assembles the full grid from a set of placed truths: one column per canonical FK02
// facet (F→X), each projected independently (LAW 3). Same truths ⇒ same grid (Hash pins it).
// PURE, TOTAL.
func Build(truths []Truth) Grid {
	g := Grid{Columns: make([]Column, 0, len(facets.Facets()))}
	for _, f := range facets.Facets() {
		g.Columns = append(g.Columns, Project(truths, f))
	}
	return g
}

// Hash content-addresses the whole grid (reproducible: same truths ⇒ same hash). PURE.
func (g Grid) Hash() string {
	b, _ := json.Marshal(g)
	canon, err := canonicalize(b)
	if err != nil {
		sum := sha256.Sum256(b)
		return hex.EncodeToString(sum[:])
	}
	sum := sha256.Sum256(canon)
	return hex.EncodeToString(sum[:])
}

// canonicalize re-marshals JSON with object keys sorted, so the grid hash is stable under key
// reordering (mirrors records.Canonicalize without importing it — grid stays free of the
// records dependency beyond what facets already pulls). PURE.
func canonicalize(b []byte) ([]byte, error) {
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		return nil, err
	}
	return json.Marshal(v) // encoding/json marshals map keys sorted; arrays keep order
}
