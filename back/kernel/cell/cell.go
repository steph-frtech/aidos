// Package cell is the pure CELL (bounded context) primitive of KRD §43–§51 and the
// app-builder EPIC 11 (S100): a project's Kernel is NEVER one indivisible mass but a
// deliberate FEDERATION of small per-cell Kernels, each with its OWN ratchet, linked
// ONLY by contracts (Pact). "La grandeur vit dans le NOMBRE de cellules, jamais dans la
// taille d'une" (§45) — a huge app is a federation of bounded contexts, fractal (§43): a
// cell ships if it is LOCALLY stable even while the federation is in flux.
//
// THE OPEN QUESTION (ROADMAP E11) — is `cell` a new TruthScope dimension (S15) or a
// first-rank record? RESOLVED HERE: a cell is a FIRST-RANK partition concept that REUSES
// the bounded_context field already carried by every ContextGraph node (S33/S55
// runtime/context Layer/Mirror/Contract.BoundedContext) and by S48 GlobalInvariant.CellRef.
// It is NOT a sixth TruthScope dimension: TruthScope (§13.7) qualifies WHERE/WHEN/FOR-WHOM
// ONE truth holds (region/target/segment/env/time-window); a cell is the PARTITION the
// truth LIVES IN — a different axis. Cells connect ONLY via S17 contracts_with links.
//
// This package lands exactly that substrate, three PURE total functions:
//
//   - Partition(project) → []Cell — split a project's Kernel nodes into per-cell sub-Kernels
//     by their bounded_context, each cell carrying its OWN nodes + its own ratchet state.
//     A node with no bounded_context is REFUSED (CELL_UNASSIGNED_NODE) — no node lives
//     outside a cell (the federation has no "default" mass).
//
//   - CellPack(project, cell) → CellContextPack — the per-cell context frontier: the agent
//     working cell X loads its OWN Kernel (its layers + mirrors) + ONLY the PUBLIC CONTRACTS
//     of its contracted neighbors — NEVER a neighbor's internals. This is the §145 rule made
//     first-rank per cell: "le bounded context EST la frontière de contexte de l'agent". The
//     pack's Excluded carries every neighbor internal kept out, tagged WHY.
//
//   - CheckCrossCellAccess(from, to, federation) → *BlockReason — a cross-cell access is
//     REFUSED (CROSS_CELL_NO_CONTRACT) unless a versioned contracts_with link (S17) connects
//     the two cells AND it is honored. An access to one's OWN cell always passes; an access
//     to a neighbor with a contract passes; an access to a non-contracted neighbor is the
//     structural wall of the federation (§46 "l'architecture est conçue, jamais générée").
//
//   - Ships(cell) → bool — a cell SHIPS iff it is LOCALLY stable (its own ratchet green),
//     INDEPENDENT of the rest of the federation (§43 fractal): a green cell ships even while
//     a sibling is red. This is the second, STRUCTURAL ratchet of EPIC 11.
//
// PURE (CLAUDE.md §6/§8 determinism-first): no DB, no clock, no rng, no I/O, no LLM. Every
// function is TOTAL and DETERMINISTIC — same input ⇒ same output — so the per-cell context
// frontier and the cross-cell refusal are REPLAYABLE (the rapid property mirror pins this).
// The content-hash row id reuses the S02 records substrate (records.Hash(Canonicalize)) — it
// is NOT forked here. READ-ONLY against truth; it writes nothing (the wall, CLAUDE.md §2):
// the Context-Map (which cells exist, which contract) persists via ChangeSet (S101), never a
// direct write from here. It introduces the cell PARTITION PRIMITIVE only and CLAIMS NO full
// federation stage-5 stability (deferred S101/§47).
package cell

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Ref is a reference to a cell (bounded context) — a non-empty bounded-context name. It is
// the SAME identity space as runtime/context.Layer.BoundedContext and globalinvariant.CellRef
// (S48); a cell is not a new id space, it is the bounded_context promoted to first-rank.
type Ref string

// IsEmpty reports whether the cell ref is the empty (unassigned) cell.
func (r Ref) IsEmpty() bool { return r == "" }

// NodeKind classifies a kernel node inside a cell's sub-Kernel — a layer (source/AST), a
// mirror (proof), or a contract (the cross-cell public surface). Only contracts cross a cell
// boundary; layers and mirrors are a cell's INTERNALS.
type NodeKind string

const (
	// KindLayer — a source/AST node (entity/operation/policy/control/action). INTERNAL.
	KindLayer NodeKind = "layer"
	// KindMirror — a behaviour proof (Gherkin/property/fixture). INTERNAL.
	KindMirror NodeKind = "mirror"
	// KindContract — a Pact contract; PUBLIC iff its Public flag is set — only then does it
	// cross a cell boundary into a contracted neighbor's pack.
	KindContract NodeKind = "contract"
)

// Node is one kernel node of a project, tagged with the cell it lives in. Public marks a
// contract as the cell's PUBLIC surface (ignored for layers/mirrors, which are always
// internal). It is the read-only projection Partition/CellPack compile over.
type Node struct {
	// ID is the node's content-addressed id (S02), surfaced verbatim.
	ID string `json:"id"`
	// Cell is the bounded context the node lives in. An empty cell is REFUSED by Partition.
	Cell Ref `json:"cell"`
	// Kind is the node's kind (layer | mirror | contract).
	Kind NodeKind `json:"kind"`
	// Public marks a contract as the cell's public surface (the only node kind that crosses).
	Public bool `json:"public,omitempty"`
}

// RatchetState is a cell's OWN ratchet state (§43): a cell's local stability, independent of
// the federation. A cell SHIPS iff its ratchet is green.
type RatchetState string

const (
	// RatchetGreen — the cell's red set is green ∧ prior green intact ∧ no monster: it ships.
	RatchetGreen RatchetState = "green"
	// RatchetRed — the cell has at least one red mirror: it does NOT ship (the rest of the
	// federation may still ship its own green cells — §43 fractal).
	RatchetRed RatchetState = "red"
)

// Cell is a per-cell sub-Kernel: a cell ref, its OWN nodes (layers + mirrors + its contracts),
// and its OWN ratchet state. The product of Partition — a project's Kernel split into these.
type Cell struct {
	// Ref is the cell's bounded-context name.
	Ref Ref `json:"ref"`
	// Nodes are the cell's OWN kernel nodes (its internals + its own contracts), sorted by id.
	Nodes []Node `json:"nodes"`
	// Ratchet is the cell's own ratchet state (its local stability).
	Ratchet RatchetState `json:"ratchet"`
}

// Project is the read-only project view Partition compiles over: its nodes + each cell's
// ratchet state. The router never fetches it; it is handed in (PURE).
type Project struct {
	// ID is the project_id (S55) the cells belong to.
	ID string `json:"id"`
	// Nodes are ALL the project's kernel nodes, each tagged with its cell.
	Nodes []Node `json:"nodes"`
	// Ratchets maps a cell ref to its OWN ratchet state. A cell missing here defaults to red
	// (a cell with no recorded ratchet is NOT assumed green — fail closed).
	Ratchets map[Ref]RatchetState `json:"ratchets,omitempty"`
}

// Contract is a versioned contracts_with link (S17) between two cells in the federation. It
// is HONORED iff Honored is true (a Pact-verified pair, S101). The Context-Map (the set of
// these) is the only true human work (§46) and persists via ChangeSet — read-only here.
type Contract struct {
	// A is one side of the contract (a cell ref).
	A Ref `json:"a"`
	// B is the other side (a cell ref).
	B Ref `json:"b"`
	// Honored reports whether the Pact pair currently verifies (S101). An un-honored contract
	// does NOT authorize a cross-cell access (a violated contract is a closed door).
	Honored bool `json:"honored"`
}

// connects reports whether the contract links cells x and y (in either direction).
func (c Contract) connects(x, y Ref) bool {
	return (c.A == x && c.B == y) || (c.A == y && c.B == x)
}

// Federation is the read-only set of contracts_with links between a project's cells — the
// Context-Map (§46). CheckCrossCellAccess resolves against it.
type Federation struct {
	// Contracts are the versioned contracts_with links between cells.
	Contracts []Contract `json:"contracts"`
}

// ExclusionReason is the CLOSED set of WHY a node was kept OUT of a cell's pack — mirrors the
// runtime/context.ExclusionReason vocabulary so the /cell-federation panel reads the same.
type ExclusionReason string

const (
	// ReasonNeighborInternal — the node is a NEIGHBOR cell's internal (layer/mirror or a
	// non-public contract): never enters the cell's pack (only a neighbor's PUBLIC contract does).
	ReasonNeighborInternal ExclusionReason = "neighbor-internal"
	// ReasonNoContract — the node is a neighbor cell's PUBLIC contract, but the two cells are
	// NOT contracted: even its public surface stays out (no contract ⇒ no crossing).
	ReasonNoContract ExclusionReason = "no-contract"
)

// Excluded is one node kept OUT of a cell's pack, tagged WHY (rendered on the Excluded panel).
type Excluded struct {
	ID     string          `json:"id"`
	Cell   Ref             `json:"cell"`
	Reason ExclusionReason `json:"reason"`
}

// CellContextPack is the per-cell context frontier (the §145 rule first-rank per cell): the
// cell's OWN Kernel (its layers + mirrors) + ONLY the PUBLIC contracts of its CONTRACTED
// neighbors — never a neighbor's internals. Content-addressed (Hash) and reproducible.
type CellContextPack struct {
	// Project is the project the cell belongs to (S55).
	Project string `json:"project"`
	// Cell is the cell this pack is compiled for.
	Cell Ref `json:"cell"`
	// OwnLayers are the cell's own source/AST node ids (its internals), sorted.
	OwnLayers []string `json:"own_layers"`
	// OwnMirrors are the cell's own mirror node ids (its internals), sorted.
	OwnMirrors []string `json:"own_mirrors"`
	// OwnContracts are the cell's own contract node ids, sorted.
	OwnContracts []string `json:"own_contracts"`
	// NeighborContracts are the PUBLIC contract ids of CONTRACTED neighbors — the ONLY
	// neighbor nodes in the pack, sorted. A neighbor's layers/mirrors NEVER appear here.
	NeighborContracts []string `json:"neighbor_contracts"`
	// Excluded carries every neighbor node kept out, tagged WHY (the boundary made visible).
	Excluded []Excluded `json:"excluded"`
	// Hash is the content address of the pack (reproducible: same input ⇒ same hash).
	Hash string `json:"hash"`
}

// BlockReason is the S100-local typed refusal of a cross-cell access (KRD §44.5 shape). It
// names the door, never a prison: Code + Message + HowToFix. It mirrors the
// runtime/blockreason.BlockReason shape without importing it (this kernel package stays free
// of the runtime layer; the MCP maps it onto the canonical BlockReason if it must surface one).
type BlockReason struct {
	Code     string   `json:"code"`
	Message  string   `json:"message"`
	HowToFix []string `json:"how_to_fix"`
}

func (b *BlockReason) Error() string { return b.Message }

// Refusal codes (S100-local kebab/SCREAMING — the /cell-federation panel surfaces them).
const (
	// CodeCrossCellNoContract — a cross-cell access without a honored contracts_with link.
	CodeCrossCellNoContract = "CROSS_CELL_NO_CONTRACT"
)

// Validation errors.
var (
	// ErrUnassignedNode — a project node carries no cell (no node lives outside a cell).
	ErrUnassignedNode = errors.New("cell: a kernel node carries no bounded context (every node lives in a cell)")
	// ErrUnknownKind — a node's kind is not one of the three closed kinds.
	ErrUnknownKind = errors.New("cell: unknown node kind (closed set: layer|mirror|contract)")
)

// IsKnownKind reports whether k is one of the three closed node kinds.
func IsKnownKind(k NodeKind) bool {
	return k == KindLayer || k == KindMirror || k == KindContract
}

// Partition splits a project's Kernel into per-cell sub-Kernels (§43): one Cell per distinct
// bounded_context, each carrying its OWN nodes (sorted by id) and its OWN ratchet state. A
// node with NO cell is REFUSED (ErrUnassignedNode) — the federation has no default mass; a
// node with an unknown kind is REFUSED (ErrUnknownKind). The returned cells are sorted by ref
// (deterministic). A cell with no recorded ratchet defaults to RatchetRed (fail closed).
//
// PURE + TOTAL: no DB/clock/rng/I/O. Same project ⇒ same cells (the property mirror pins it).
func Partition(p Project) ([]Cell, error) {
	byCell := map[Ref][]Node{}
	for _, n := range p.Nodes {
		if n.Cell.IsEmpty() {
			return nil, fmt.Errorf("%w: node %q", ErrUnassignedNode, n.ID)
		}
		if !IsKnownKind(n.Kind) {
			return nil, fmt.Errorf("%w: node %q kind %q", ErrUnknownKind, n.ID, n.Kind)
		}
		byCell[n.Cell] = append(byCell[n.Cell], n)
	}
	refs := make([]Ref, 0, len(byCell))
	for r := range byCell {
		refs = append(refs, r)
	}
	sort.Slice(refs, func(i, j int) bool { return refs[i] < refs[j] })

	cells := make([]Cell, 0, len(refs))
	for _, r := range refs {
		nodes := byCell[r]
		sort.Slice(nodes, func(i, j int) bool { return nodes[i].ID < nodes[j].ID })
		ratchet := RatchetRed
		if p.Ratchets != nil {
			if rs, ok := p.Ratchets[r]; ok && rs == RatchetGreen {
				ratchet = RatchetGreen
			}
		}
		cells = append(cells, Cell{Ref: r, Nodes: nodes, Ratchet: ratchet})
	}
	return cells, nil
}

// CellPack compiles the per-cell context frontier for `target` inside project p, given the
// federation's contracts (§145, first-rank per cell):
//
//   - the cell's OWN layers + mirrors + contracts (its sub-Kernel), and
//   - ONLY the PUBLIC contracts of CONTRACTED neighbors.
//
// Every other neighbor node is EXCLUDED, tagged WHY: a neighbor's layer/mirror/non-public
// contract ⇒ neighbor-internal; a contracted-or-not neighbor's PUBLIC contract that has no
// honored contract to `target` ⇒ no-contract. The agent in cell X thus NEVER sees a
// neighbor's internals — the done-criterion's first half. Content-addressed + reproducible.
//
// PURE + TOTAL. An unknown/unassigned node is skipped defensively (Partition is the validator);
// CellPack never panics. Same (p, target, fed) ⇒ byte-identical pack and hash.
func CellPack(p Project, target Ref, fed Federation) CellContextPack {
	pack := CellContextPack{
		Project:           p.ID,
		Cell:              target,
		OwnLayers:         []string{},
		OwnMirrors:        []string{},
		OwnContracts:      []string{},
		NeighborContracts: []string{},
		Excluded:          []Excluded{},
	}
	for _, n := range p.Nodes {
		if n.Cell == target {
			switch n.Kind {
			case KindLayer:
				pack.OwnLayers = append(pack.OwnLayers, n.ID)
			case KindMirror:
				pack.OwnMirrors = append(pack.OwnMirrors, n.ID)
			case KindContract:
				pack.OwnContracts = append(pack.OwnContracts, n.ID)
			}
			continue
		}
		// A NEIGHBOR node. Only a PUBLIC contract of a CONTRACTED neighbor crosses.
		if n.Kind == KindContract && n.Public {
			if contracted(target, n.Cell, fed) {
				pack.NeighborContracts = append(pack.NeighborContracts, n.ID)
			} else {
				pack.Excluded = append(pack.Excluded, Excluded{ID: n.ID, Cell: n.Cell, Reason: ReasonNoContract})
			}
			continue
		}
		// Any other neighbor node (layer, mirror, non-public contract) is an internal: out.
		pack.Excluded = append(pack.Excluded, Excluded{ID: n.ID, Cell: n.Cell, Reason: ReasonNeighborInternal})
	}
	sort.Strings(pack.OwnLayers)
	sort.Strings(pack.OwnMirrors)
	sort.Strings(pack.OwnContracts)
	sort.Strings(pack.NeighborContracts)
	sort.Slice(pack.Excluded, func(i, j int) bool { return pack.Excluded[i].ID < pack.Excluded[j].ID })

	pack.Hash = packHash(pack)
	return pack
}

// PackHasNeighborInternal reports whether the pack leaked ANY neighbor internal — it never
// should. Exported so the mirror can assert the §145 frontier directly. A pack is sound iff
// PackHasNeighborInternal == false (the pack carries neighbors only as public contracts).
func PackHasNeighborInternal(pack CellContextPack, p Project) bool {
	own := map[string]bool{}
	for _, id := range pack.OwnLayers {
		own[id] = true
	}
	for _, id := range pack.OwnMirrors {
		own[id] = true
	}
	for _, id := range pack.OwnContracts {
		own[id] = true
	}
	neighborPublic := map[string]bool{}
	for _, id := range pack.NeighborContracts {
		neighborPublic[id] = true
	}
	for _, id := range pack.NeighborContracts {
		// every neighbor-contract id must be a PUBLIC contract NOT in the target cell
		var n *Node
		for i := range p.Nodes {
			if p.Nodes[i].ID == id {
				n = &p.Nodes[i]
				break
			}
		}
		if n == nil || n.Cell == pack.Cell || n.Kind != KindContract || !n.Public {
			return true
		}
	}
	_ = own
	_ = neighborPublic
	return false
}

// contracted reports whether cells x and y are connected by a HONORED contracts_with link in
// the federation (S17). A cell is always "contracted" with itself (own cell). An un-honored
// contract does NOT authorize crossing.
func contracted(x, y Ref, fed Federation) bool {
	if x == y {
		return true
	}
	for _, c := range fed.Contracts {
		if c.Honored && c.connects(x, y) {
			return true
		}
	}
	return false
}

// CheckCrossCellAccess is the federation wall (§46): an access FROM cell `from` TO cell `to`
// is REFUSED unless `from == to` (own cell) OR a HONORED contracts_with link connects them.
// Returns nil when the access is allowed, else a typed BlockReason
// (CROSS_CELL_NO_CONTRACT) naming the fix path. This is the done-criterion's second half: "un
// accès cross-cell sans contrat est refusé".
//
// PURE + TOTAL: no DB/clock/rng/I/O. Same (from, to, fed) ⇒ same verdict (the property mirror
// pins it). It writes nothing (the wall): adding a contract goes through the Context-Map
// ChangeSet (S101), never a write from here.
func CheckCrossCellAccess(from, to Ref, fed Federation) *BlockReason {
	if contracted(from, to, fed) {
		return nil
	}
	return &BlockReason{
		Code:    CodeCrossCellNoContract,
		Message: fmt.Sprintf("cell %q cannot access cell %q: no honored contracts_with link connects them (a bounded context crosses only via a versioned, Pact-verified contract — KRD §46)", from, to),
		HowToFix: []string{
			fmt.Sprintf("design a contracts_with link between %q and %q in the Context-Map (S101), versioned and Pact-verified", from, to),
			"or work inside the cell's own bounded context (an agent in cell X sees only its own Kernel + contracted neighbors' public contracts)",
		},
	}
}

// Ships reports whether a cell SHIPS — iff its OWN ratchet is green (§43 fractal): a cell
// ships if it is LOCALLY stable, INDEPENDENT of the rest of the federation. A red sibling
// never blocks a green cell from shipping (and a green sibling never lets a red cell ship).
func Ships(c Cell) bool { return c.Ratchet == RatchetGreen }

// ShippableCells returns the sorted refs of the cells that ship (green ratchet) — the
// federation's shippable frontier (§43): the set is INDEPENDENT per cell.
func ShippableCells(cells []Cell) []Ref {
	out := []Ref{}
	for _, c := range cells {
		if Ships(c) {
			out = append(out, c.Ref)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

// packHash content-addresses a pack (reproducible) by reusing the S02 records substrate:
// Hash(Canonicalize(body)) over the pack's stable fields (Hash itself excluded from the body).
func packHash(pack CellContextPack) string {
	body, err := json.Marshal(struct {
		Project           string     `json:"project"`
		Cell              Ref        `json:"cell"`
		OwnLayers         []string   `json:"own_layers"`
		OwnMirrors        []string   `json:"own_mirrors"`
		OwnContracts      []string   `json:"own_contracts"`
		NeighborContracts []string   `json:"neighbor_contracts"`
		Excluded          []Excluded `json:"excluded"`
	}{
		Project:           pack.Project,
		Cell:              pack.Cell,
		OwnLayers:         pack.OwnLayers,
		OwnMirrors:        pack.OwnMirrors,
		OwnContracts:      pack.OwnContracts,
		NeighborContracts: pack.NeighborContracts,
		Excluded:          pack.Excluded,
	})
	if err != nil {
		return ""
	}
	canon, err := records.Canonicalize(body)
	if err != nil {
		return records.Hash(body)
	}
	return records.Hash(canon)
}

// SerializeCellBody renders a minimal kernel.truth body for a cell partition decision so the
// cell rides INSIDE a content-addressed body (S02). The "kind":"truth" discriminator matches
// records.Validate; the body is the Context-Map decision the ChangeSet (S101) would carry.
func SerializeCellBody(c Cell) ([]byte, error) {
	ids := make([]string, 0, len(c.Nodes))
	for _, n := range c.Nodes {
		ids = append(ids, n.ID)
	}
	sort.Strings(ids)
	body := map[string]any{
		"kind":    string(records.KindTruth),
		"cell":    string(c.Ref),
		"nodes":   ids,
		"ratchet": string(c.Ratchet),
	}
	return json.Marshal(body)
}
