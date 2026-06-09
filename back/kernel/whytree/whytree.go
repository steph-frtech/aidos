// Package whytree builds a WhyTree — the 5-whys REDRESSED (FKE-35.1, ROADMAP FK13): a
// fishbone, content-addressed, provenanced tree of candidate causes risen from a RED symptom,
// terminating OBLIGATORILY in a mirror (root → /learn → an anti-recurrence mirror).
//
// THE GESTURE `/why` (an extension of /diagnose + /learn):
//
//	a RED symptom (a failing mirror / an incident) → walk UPWARD on `caused_by` (FK12) → for each
//	candidate cause, a REPRODUCTION verdict (reproduced ∨ rejected — anti-confabulation) →
//	the deepest reproduced cause is the ROOT → /learn freezes a terminal anti-recurrence mirror →
//	the targeted red wave is the worklist.
//
// THREE NON-NEGOTIABLES (the FK13 done-criteria, all enforced HERE, deterministically):
//
//  1. EACH CAUSE IS REPRODUCIBLE OR REJECTED (anti-confabulation, CLAUDE.md §6/§8). A candidate
//     cause that carries no reproduction proof — or a NEGATIVE one — is NOT admitted into the
//     tree (ErrCauseNotReproduced). The LLM may PROPOSE an off-graph "why", but the code is
//     AUTHORITATIVE: a proposed cause enters the tree ONLY when its reproduction is positive.
//     The judge is deterministic — a graph walk + a reproduction bool, never a prompt.
//  2. TERMINATION IN A MIRROR IS OBLIGATORY (KRD §53/§67, the loop-closure). A WhyTree with no
//     terminal mirror at its root is a wish, not a closed loop — Build REFUSES it with
//     ErrNoTerminalMirror (the WHYTREE_NO_MIRROR code). The root → /learn → mirror is the only
//     legal end of `/why`; there is no shortcut to the kernel.
//  3. THE UPWARD WALK IS DETERMINISTIC + CYCLE-REFUSING. Build REUSES FK12 causedby.Trace: same
//     (symptom, edges) ⇒ byte-identical tree; a caused_by cycle is refused (never a partial tree).
//
// CONTENT-ADDRESSED + PROVENANCED. SerializeBody → records.NewRecord(KindLink) yields
// id == version == Hash(Canonicalize(body)): a changed cause version ⇒ a NEW tree (never an
// in-place mutation, KRD §12). The body carries the symptom, the ordered reproduced causes, the
// terminal mirror id, and the provenance (who/what raised the symptom).
//
// PURE (determinism-first): no DB, no clock, no rng, no I/O, NO LLM. The edges, the reproductions
// and the terminal mirror are READ from the arguments handed in. READ-ONLY against truth (the
// wall, CLAUDE.md §2): this package writes nothing — freezing the terminal mirror flows through
// idea → mirror → /goal → human approval (the aidos CLI writer role; the agent has no GRANT).
package whytree

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/causedby"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// ProvenanceKind is the closed origin of a symptom (who/what raised the red). It travels onto the
// tree body so the WhyTree reconstructs down to its root cause AND its origin (provenanced).
type ProvenanceKind string

const (
	// FromIncident — the symptom came from production reality (a RealityMirror divergence, S43/S106).
	FromIncident ProvenanceKind = "incident"
	// FromMirror — the symptom is a failing mirror (a red certification, S22 red wave).
	FromMirror ProvenanceKind = "mirror"
	// FromHuman — a human filed the symptom directly (a reported defect).
	FromHuman ProvenanceKind = "human"
)

// IsKnownProvenance reports whether p is one of the closed provenance kinds.
func IsKnownProvenance(p ProvenanceKind) bool {
	switch p {
	case FromIncident, FromMirror, FromHuman:
		return true
	default:
		return false
	}
}

// Reproduction is the verdict that a candidate cause was ACTUALLY reproduced (a deterministic
// re-run reddened on it) — the anti-confabulation gate. A cause with Reproduced=false (or no
// reproduction at all) is REJECTED from the tree: AIDOS never admits a cause it could not make
// fail on demand. Detail is the verbatim evidence (a fixture ref, a failing assertion) — prose,
// advisory, never the judge (the judge is the bool).
type Reproduction struct {
	// CauseID is the candidate-cause id this reproduction is about (must match a Trace cause).
	CauseID string `json:"cause_id"`
	// Reproduced is the AUTHORITATIVE bool: true iff a deterministic re-run reddened on this cause.
	Reproduced bool `json:"reproduced"`
	// Detail is the verbatim reproduction evidence (advisory prose; never the judge).
	Detail string `json:"detail,omitempty"`
}

// TerminalMirror is the anti-recurrence mirror the ROOT cause terminates in (root → /learn →
// mirror). It is the OUTCOME of /learn (the human freezes it at /goal); Build only checks THAT a
// terminal mirror is present and reflects the root — the assertion is the human's (anti-circularity,
// KRD §8). A WhyTree with no terminal mirror is refused (WHYTREE_NO_MIRROR).
type TerminalMirror struct {
	// MirrorID is the anti-recurrence mirror's content hash (the address /goal froze). Required.
	MirrorID string `json:"mirror_id"`
	// ReflectsRootCause is the root-cause id the terminal mirror reflects (it must be the tree root).
	ReflectsRootCause string `json:"reflects_root_cause"`
}

// CauseNode is one reproduced candidate cause in the WhyTree, at its hop distance from the symptom
// (Depth). The order of the WhyTree.Causes slice is the contract: nearest-first (Depth asc, id asc),
// inherited from FK12 Trace — so the same inputs always yield a byte-identical tree.
type CauseNode struct {
	// CauseID is the candidate-cause id (an entity/operation/migration/policy/mirror, pinned upstream).
	CauseID string `json:"cause_id"`
	// Depth is the hop distance from the symptom (1 = direct cause). The ROOT is the deepest node.
	Depth int `json:"depth"`
	// Reproduced is always true for an admitted node (a non-reproduced cause is never admitted).
	Reproduced bool `json:"reproduced"`
}

// WhyTree is the built tree: the symptom, its provenance, the ordered REPRODUCED causes (nearest
// first), the ROOT cause id (the deepest reproduced node — the one /learn turns into the terminal
// mirror), and the terminal mirror itself. It is content-addressed via SerializeBody.
type WhyTree struct {
	// Symptom is the id of the red node the tree rose from.
	Symptom string `json:"symptom"`
	// Provenance is who/what raised the symptom (incident / mirror / human).
	Provenance ProvenanceKind `json:"provenance"`
	// Causes are the REPRODUCED candidate causes, ordered nearest-first (Depth asc, id asc).
	Causes []CauseNode `json:"causes"`
	// RootCause is the deepest reproduced cause id (the one the terminal mirror reflects). Empty
	// only when the symptom has no reproduced cause (a leaf symptom — its own root).
	RootCause string `json:"root_cause"`
	// Terminal is the obligatory anti-recurrence mirror the root terminates in.
	Terminal TerminalMirror `json:"terminal"`
}

// IsLeaf reports whether the symptom had no reproduced upstream cause — it is its own root.
func (t WhyTree) IsLeaf() bool { return len(t.Causes) == 0 }

// Build / errors. Each maps 1:1 to a closed BlockReason code surfaced by the MCP + the Workbench.
var (
	// ErrUnknownProvenance — the symptom's provenance is outside the closed set.
	ErrUnknownProvenance = errors.New("whytree: unknown symptom provenance (UNKNOWN_PROVENANCE)")
	// ErrCauseNotReproduced — a candidate cause on the trace has no positive reproduction proof
	// (anti-confabulation): it is refused admission into the tree (WHYTREE_CAUSE_NOT_REPRODUCED).
	ErrCauseNotReproduced = errors.New("whytree: a candidate cause was not reproduced (anti-confabulation refusal)")
	// ErrNoTerminalMirror — the tree has no terminal anti-recurrence mirror at its root: a WhyTree
	// that does not end in a mirror is refused (WHYTREE_NO_MIRROR — the FK13 done-criterion).
	ErrNoTerminalMirror = errors.New("whytree: no terminal mirror (WHYTREE_NO_MIRROR — root must end in a mirror)")
	// ErrTerminalMismatch — the terminal mirror does not reflect the tree's actual root cause.
	ErrTerminalMismatch = errors.New("whytree: terminal mirror does not reflect the root cause (WHYTREE_TERMINAL_MISMATCH)")
	// ErrCycle is re-exported from FK12 — a caused_by cycle reachable from the symptom is refused.
	ErrCycle = causedby.ErrCycle
)

// Input is the pure input to Build: the symptom + its provenance, the caused_by edge set (FK12),
// the reproduction verdicts (one per candidate cause), and the obligatory terminal mirror.
type Input struct {
	// Symptom is the red node id to rise from.
	Symptom string
	// Provenance is who/what raised the symptom (closed set).
	Provenance ProvenanceKind
	// Edges is the caused_by graph (FK12) — the upward walk follows it.
	Edges []causedby.Edge
	// Reproductions are the per-cause reproduction verdicts (anti-confabulation). A cause on the
	// trace without a positive entry here is refused.
	Reproductions []Reproduction
	// Terminal is the obligatory anti-recurrence mirror (root → /learn → mirror). Its MirrorID
	// must be non-empty (else WHYTREE_NO_MIRROR) and it must reflect the computed root cause.
	Terminal TerminalMirror
}

// Build is the PURE deterministic constructor of a WhyTree (FK13). It:
//
//  1. validates the provenance (closed set);
//  2. walks `caused_by` UPWARD from the symptom via FK12 causedby.Trace (deterministic,
//     cycle-refusing — a cycle yields ErrCycle, never a partial tree);
//  3. for EACH candidate cause on the trace, requires a POSITIVE reproduction (anti-confabulation)
//     — a missing or negative reproduction ⇒ ErrCauseNotReproduced (the cause is refused, not
//     silently dropped: a WhyTree must be wholly reproducible);
//  4. computes the ROOT cause = the deepest reproduced node (the last in the nearest-first order);
//  5. REQUIRES a terminal mirror (MirrorID non-empty) that reflects that root — else
//     ErrNoTerminalMirror / ErrTerminalMismatch.
//
// A LEAF symptom (no caused_by cause) is its own root: it still REQUIRES a terminal mirror that
// reflects the symptom itself (the symptom IS the root cause). Pure, total: no DB, no clock, no rng.
func Build(in Input) (WhyTree, error) {
	if !IsKnownProvenance(in.Provenance) {
		return WhyTree{}, fmt.Errorf("%w: %q", ErrUnknownProvenance, in.Provenance)
	}

	// (2) deterministic, cycle-refusing upward walk (FK12).
	chain, err := causedby.Trace(in.Symptom, in.Edges)
	if err != nil {
		return WhyTree{}, err // ErrCycle propagates verbatim — no partial tree.
	}

	// Index the reproduction verdicts by cause id (last write wins, deterministic over a set).
	repro := map[string]Reproduction{}
	for _, r := range in.Reproductions {
		repro[r.CauseID] = r
	}

	// (3) admit each candidate cause IFF it carries a positive reproduction. The trace order is
	// nearest-first (Depth asc, id asc) — we keep it; Depth = the BFS distance, recomputed below.
	depth := traceDepths(in.Symptom, in.Edges)
	causes := make([]CauseNode, 0, len(chain.Causes))
	for _, id := range chain.Causes {
		r, ok := repro[id]
		if !ok || !r.Reproduced {
			return WhyTree{}, fmt.Errorf("%w: cause %q", ErrCauseNotReproduced, id)
		}
		causes = append(causes, CauseNode{CauseID: id, Depth: depth[id], Reproduced: true})
	}

	// (4) the root cause is the deepest reproduced node; for a leaf symptom the symptom IS the root.
	root := in.Symptom
	if len(causes) > 0 {
		root = deepest(causes)
	}

	// (5) the terminal mirror is OBLIGATORY and must reflect the root.
	if in.Terminal.MirrorID == "" {
		return WhyTree{}, fmt.Errorf("%w: symptom %q", ErrNoTerminalMirror, in.Symptom)
	}
	if in.Terminal.ReflectsRootCause != root {
		return WhyTree{}, fmt.Errorf("%w: terminal reflects %q, root is %q",
			ErrTerminalMismatch, in.Terminal.ReflectsRootCause, root)
	}

	return WhyTree{
		Symptom:    in.Symptom,
		Provenance: in.Provenance,
		Causes:     causes,
		RootCause:  root,
		Terminal:   in.Terminal,
	}, nil
}

// deepest returns the id of the cause with the greatest Depth (ties broken by id desc, so the
// deepest *furthest* root is stable). The slice is already nearest-first, so the last is deepest.
func deepest(causes []CauseNode) string {
	best := causes[0]
	for _, c := range causes[1:] {
		if c.Depth > best.Depth || (c.Depth == best.Depth && c.CauseID > best.CauseID) {
			best = c
		}
	}
	return best.CauseID
}

// traceDepths recomputes the BFS hop distance of every reachable cause from the symptom — the same
// shortest-distance map FK12 Trace sorts by, recovered here so each CauseNode carries its Depth.
// REUSES the FK12 validation so a malformed edge is skipped exactly as Trace skips it (no drift).
func traceDepths(symptom string, edges []causedby.Edge) map[string]int {
	adj := map[string][]string{}
	for _, e := range edges {
		if causedby.Validate(e) != nil {
			continue
		}
		adj[e.From.ID] = append(adj[e.From.ID], e.To.ID)
	}
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
	delete(dist, symptom)
	return dist
}

// SerializeBody renders the content-addressed kernel.link body carrying the WhyTree, so the tree
// rides INSIDE a content-addressed body (S02 substrate): NewRecord(KindLink, body) yields
// id == version == Hash(Canonicalize(body)), and a changed cause/mirror id yields a DIFFERENT
// version (a new tree, never an in-place mutation, KRD §12). The "link_kind":"why_tree"
// discriminator namespaces it beside FK12's "caused_by". REUSES records.Canonicalize (never forked).
func SerializeBody(t WhyTree) ([]byte, error) {
	// Canonicalise the cause order defensively (it is already nearest-first; sort makes the address
	// independent of the caller's slice order — same logical tree ⇒ same address).
	causes := append([]CauseNode(nil), t.Causes...)
	sort.Slice(causes, func(i, j int) bool {
		if causes[i].Depth != causes[j].Depth {
			return causes[i].Depth < causes[j].Depth
		}
		return causes[i].CauseID < causes[j].CauseID
	})
	body := map[string]any{
		"kind":            string(records.KindLink),
		"link_kind":       "why_tree",
		"symptom":         t.Symptom,
		"provenance":      string(t.Provenance),
		"causes":          causes,
		"root_cause":      t.RootCause,
		"terminal_mirror": t.Terminal,
	}
	return json.Marshal(body)
}

// ParseBody is the inverse of SerializeBody: it recovers a WhyTree from a kernel.link body (the
// round-trip half). It errors if the body is not a why_tree link body.
func ParseBody(body []byte) (WhyTree, error) {
	var probe struct {
		Kind       string         `json:"kind"`
		LinkKind   string         `json:"link_kind"`
		Symptom    string         `json:"symptom"`
		Provenance ProvenanceKind `json:"provenance"`
		Causes     []CauseNode    `json:"causes"`
		RootCause  string         `json:"root_cause"`
		Terminal   TerminalMirror `json:"terminal_mirror"`
	}
	if err := json.Unmarshal(body, &probe); err != nil {
		return WhyTree{}, fmt.Errorf("whytree: invalid link body: %w", err)
	}
	if probe.Kind != string(records.KindLink) {
		return WhyTree{}, fmt.Errorf("whytree: body kind %q is not a kernel.link", probe.Kind)
	}
	if probe.LinkKind != "why_tree" {
		return WhyTree{}, fmt.Errorf("whytree: body link_kind %q is not why_tree", probe.LinkKind)
	}
	return WhyTree{
		Symptom:    probe.Symptom,
		Provenance: probe.Provenance,
		Causes:     probe.Causes,
		RootCause:  probe.RootCause,
		Terminal:   probe.Terminal,
	}, nil
}

// Record builds the content-addressed kernel.link Record for a WhyTree (the materialized,
// replayable tree). It REUSES records.NewRecord — the same content-address path as every other
// kernel record, so id == version == Hash(Canonicalize(body)). Writes nothing (the wall): the
// caller hands this Record to the aidos CLI writer role via a ChangeSet, never the agent.
func Record(t WhyTree) (records.Record, error) {
	body, err := SerializeBody(t)
	if err != nil {
		return records.Record{}, err
	}
	return records.NewRecord(records.KindLink, body)
}
