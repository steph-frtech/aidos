// Package cockpit is the AIDOS S105 "cockpit de fédération" assembler (ROADMAP app-builder
// EPIC 11, §50): the PURE, DETERMINISTIC composition that snapshots a project's federation into
// ONE cockpit view — the cell graph, the inter-cell contracts, the status of BOTH ratchets,
// local vs global stability, and the red-wave fan-out.
//
// It is the cockpit's OWN assembly logic; it REUSES the existing authoritative engines verbatim
// and forks NO truth logic of its own:
//
//   - cell.Partition       — splits the project Kernel into per-cell sub-Kernels, each with its
//     OWN behavioural ratchet (S100, the FIRST ratchet §43). cell.Ships decides shipping.
//   - archfitness.Measure  — the STRUCTURAL ratchet (S102, the SECOND ratchet §47) over the
//     archfitness.Ratchet    inter-cell dependency graph: it can only HOLD or IMPROVE.
//   - the red-wave fan-out  — a GLOBAL policy expressed ONCE reddens exactly the cells that
//     VIOLATE it (§51); a contracted neighbor that does NOT violate stays GREEN and SHIPS while
//     its neighbor is still red (the §43 fractal — local stability ships even when the
//     federation is in flux).
//
// THE WALL (CLAUDE.md §2): AssembleSnapshot COMPOSES + RENDERS values; it writes NOTHING — no
// DB, no clock, no rng, no I/O, no LLM. The structural baseline moves only via a DRAFT ChangeSet
// (archfitness.Propose, S102); the per-cell RedWorkQueue INSERT is the S22 hook's job below the
// waterline. This package returns a VALUE.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): the whole snapshot is a pure function of its input —
// every list canonicalised (sorted) before it is returned, so the SAME project ⇒ a byte-identical
// snapshot. The reproducibility mirror cockpit_property_test.go (rapid) pins it; the done-criterion
// cockpit_fixture_test.go (Godog-shape) proves the §50 cockpit: two cells, one contract, one
// transverse red wave — one cell shows a green local cut and ships while a neighbor is still red.
package cockpit

import (
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/cell"
	"github.com/steph-frtech/aidos/back/kernel/mirror/archfitness"
)

// CellRatchets is the status of BOTH ratchets for one cell in the cockpit: the cell's OWN
// behavioural ratchet (S100, "tests green") AND the project-wide structural ratchet's verdict
// (S102, "system not rotten"). A cell SHIPS iff its behavioural ratchet is green — independent
// of its neighbors (§43 fractal). The structural verdict is federation-wide (one cut), surfaced
// on every cell so the cockpit reads the two ratchets side by side.
type CellRatchets struct {
	// Cell is the bounded-context ref.
	Cell string `json:"cell"`
	// Behavioural is the cell's OWN behavioural ratchet (S100): "green" ⇒ it ships, "red" ⇒ it
	// does not (the rest of the federation may still ship its own green cells).
	Behavioural cell.RatchetState `json:"behavioural"`
	// Reddened reports whether the active red-wave fan-out reddened THIS cell (§51). A reddened
	// cell's behavioural ratchet is forced red for this snapshot (the wave is its new red set).
	Reddened bool `json:"reddened"`
	// Queue is the cell's OWN red-wave worklist (one target ref per reddened cell, stamped with
	// the policy wave id). Empty when the cell is not reddened (§51: non-affected cells stay green).
	Queue []string `json:"queue"`
	// Ships reports whether the cell ships RIGHT NOW: its behavioural ratchet is green AND it was
	// not reddened by the active wave. The §50 done-criterion: a green cell ships while a
	// reddened neighbor does not.
	Ships bool `json:"ships"`
}

// ContractEdge is one inter-cell contracts_with link rendered on the cockpit graph (S101): the
// two cells it connects and whether the Pact pair currently honors it.
type ContractEdge struct {
	A       string `json:"a"`
	B       string `json:"b"`
	Honored bool   `json:"honored"`
}

// CellViolation is the cockpit's red-wave input: a cell the GLOBAL policy spans and whether that
// cell actually VIOLATES it. A spanned-but-non-violating cell stays green (§51).
type CellViolation struct {
	Cell     string `json:"cell"`
	Violates bool   `json:"violates"`
}

// FanOutSpec is the active red-wave fan-out the cockpit overlays: a global policy expressed ONCE
// (its content-addressed wave id) + which spanned cells violate it. Empty Cells ⇒ no active wave
// (the steady cockpit, all cells on their own behavioural ratchet).
type FanOutSpec struct {
	// PolicyWaveID is the policy's content-addressed id (S02), stamped on each reddened cell's
	// worklist so the fan-out is replayable.
	PolicyWaveID string `json:"policy_wave_id"`
	// Cells are the cells the policy spans and whether each violates it.
	Cells []CellViolation `json:"cells"`
}

// CockpitSnapshot is the ASSEMBLED federation cockpit view (§50): the cell graph (each cell with
// BOTH ratchets), the inter-cell contracts, the structural ratchet verdict, the cells that ship
// right now (local stability), whether the federation is globally stable, and the red-wave reach.
// PURE, content-addressed by its inputs (deterministic): the SAME project ⇒ byte-identical.
type CockpitSnapshot struct {
	// Project is the project_id (S55) the cockpit is scoped to.
	Project string `json:"project"`
	// Cells are the per-cell ratchet rows, sorted by cell ref — the graph nodes.
	Cells []CellRatchets `json:"cells"`
	// Contracts are the inter-cell contract edges, canonicalised (a≤b, sorted) — the graph edges.
	Contracts []ContractEdge `json:"contracts"`
	// Structural is the SECOND ratchet's verdict over this cut (S102): HELD ⇒ architecture is
	// not regressing; BROKEN ⇒ a boundary/cycle/complexity metric climbed and the cut is blocked.
	Structural archfitness.RatchetVerdict `json:"structural"`
	// ShippableCells are the refs of the cells that SHIP right now (behavioural green ∧ not
	// reddened), sorted — the LOCAL stability projection.
	ShippableCells []string `json:"shippable_cells"`
	// ReddenedCells are the refs the active wave reddened, sorted — the red-wave fan-out reach.
	ReddenedCells []string `json:"reddened_cells"`
	// GloballyStable reports whether the WHOLE federation is stable: every cell ships AND the
	// structural ratchet held. The §50 distinction: a cockpit can be locally-stable-but-not-
	// globally-stable (some cells ship while a neighbor is red).
	GloballyStable bool `json:"globally_stable"`
}

// AssembleSnapshot composes the federation cockpit (§50). It is PURE and TOTAL:
//
//  1. cell.Partition splits the project into per-cell sub-Kernels (each with its behavioural
//     ratchet). A node carrying no cell / an unknown kind is REFUSED by Partition (returned err).
//  2. archfitness.Measure + archfitness.Ratchet compute the STRUCTURAL ratchet verdict of this
//     cut against the supplied baseline (the SECOND ratchet, S102).
//  3. the active fan-out overlay reddens exactly the spanned cells that VIOLATE the policy (§51):
//     a reddened cell gets a one-row worklist stamped with the wave id and does NOT ship; a
//     contracted neighbor that does not violate stays on its own behavioural ratchet and SHIPS.
//
// Returns the assembled snapshot (all lists sorted) or an error from Partition. Writes nothing.
func AssembleSnapshot(
	p cell.Project,
	depGraph archfitness.DepGraph,
	baseline archfitness.StructuralMetric,
	fed cell.Federation,
	wave FanOutSpec,
) (CockpitSnapshot, error) {
	cells, err := cell.Partition(p)
	if err != nil {
		return CockpitSnapshot{}, err
	}

	// The structural ratchet (S102): measure THIS cut, ratchet against the baseline.
	candidate := archfitness.Measure(depGraph)
	structural := archfitness.Ratchet(baseline, candidate)

	// Index the active fan-out: which spanned cells actually violate the global policy (§51).
	violates := make(map[string]bool, len(wave.Cells))
	for _, cv := range wave.Cells {
		violates[cv.Cell] = cv.Violates
	}

	rows := make([]CellRatchets, 0, len(cells))
	shippable := make([]string, 0, len(cells))
	reddened := make([]string, 0, len(cells))
	for _, c := range cells {
		ref := string(c.Ref)
		red := violates[ref]
		cr := CellRatchets{
			Cell:        ref,
			Behavioural: c.Ratchet,
			Reddened:    red,
		}
		if red {
			// The cell reconciles locally: a one-row worklist stamped with the policy wave id.
			cr.Queue = []string{ref + "::pii-aggregate@" + wave.PolicyWaveID}
			reddened = append(reddened, ref)
		}
		// A cell ships iff its behavioural ratchet is green AND the active wave did not redden it.
		cr.Ships = cell.Ships(c) && !red
		if cr.Ships {
			shippable = append(shippable, ref)
		}
		rows = append(rows, cr)
	}

	contracts := make([]ContractEdge, 0, len(fed.Contracts))
	for _, c := range fed.Contracts {
		a, b := string(c.A), string(c.B)
		if a > b { // canonicalise the undirected edge so a≤b
			a, b = b, a
		}
		contracts = append(contracts, ContractEdge{A: a, B: b, Honored: c.Honored})
	}

	sortStrs(shippable)
	sortStrs(reddened)
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].Cell < rows[j].Cell })
	sort.SliceStable(contracts, func(i, j int) bool {
		if contracts[i].A != contracts[j].A {
			return contracts[i].A < contracts[j].A
		}
		return contracts[i].B < contracts[j].B
	})

	// Globally stable iff EVERY cell ships AND the structural ratchet held. A single red cell or
	// a broken structural ratchet makes the federation NOT globally stable — yet the green cells
	// still ship (the §43 fractal, surfaced as ShippableCells).
	globallyStable := len(shippable) == len(rows) && structural.State == archfitness.StateHeld

	return CockpitSnapshot{
		Project:        p.ID,
		Cells:          rows,
		Contracts:      contracts,
		Structural:     structural,
		ShippableCells: shippable,
		ReddenedCells:  reddened,
		GloballyStable: globallyStable,
	}, nil
}

func sortStrs(s []string) {
	sort.SliceStable(s, func(i, j int) bool { return s[i] < s[j] })
}
