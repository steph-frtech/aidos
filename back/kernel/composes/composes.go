// Package composes is the pure AST + recursive aggregate of the SEVENTH KRD link —
// `composes`, the mereology link (KRD §108): a whole CONTAINS a part, version-pinned and
// WEIGHTED (load-bearing | cosmetic). Where the six S17 links (projects_to / derives_from /
// contracts_with / triggers / binds / mirrors) relate peers, `composes` builds the WHOLE from
// its PARTS, and makes the completeness law RECURSIVE (KRD §109):
//
//	aggregate_complete(L) := own_mirror(L)==GREEN ∧ ∀ child via composes(L) : aggregate_complete(c)
//
// A composite is GREEN only if its OWN emergent mirror is GREEN *and* every composes-child's
// aggregate is GREEN — so a red child reddens the aggregated parent (THE done criterion). This
// generalizes S06's FLAT own_mirror verdict; it CONSUMES that verdict (handed in per node), it
// never re-derives or re-types it (the wall: read-only over kernel.layer / kernel.link).
//
// WEIGHTED, THRESHOLDED ACTIVATION (KRD §112): each composes edge carries a declared weight
// (load-bearing | cosmetic) and each composite carries a declared activation_threshold. When
// children CHANGE, activation ← Σ weight(changed children); a green parent's emergent invariant
// only reopens (RED) when activation ≥ threshold — so a COSMETIC change below threshold does NOT
// redden the parent ("épingle un défaut, pas un changement"). Weights and thresholds are
// DECLARED above the line, NEVER learned, NEVER defaulted silently (CLAUDE.md §8, honesty rule):
// this package reads only the declared values handed in; the SPECIFIC edges/weights/thresholds
// of any real project are human truths, never invented here.
//
// CYCLE GUARD: `composes` is a DAG over layers. Aggregate detects a cycle and returns a typed
// *CycleError naming the layers on the cycle — never a silent infinite recursion, never an
// invented edge (an OpenQuestion made explicit, KRD §82).
//
// PURE (CLAUDE.md §6 determinism-first): no DB, no clock, no rng, no I/O. Aggregate is a total,
// deterministic function of (tree, root) — same input ⇒ same verdict + drill-down path — so the
// red wave over composes is replayable. The rapid property mirror pins the law at every node,
// monotone reddening, cosmetic isolation, totality and the cycle guard.
package composes

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Weight is the DECLARED weight of a composes edge (KRD §112). It is a CLOSED set of two —
// load-bearing (a part whose defect reopens the whole's invariant) and cosmetic (a part whose
// change stays below the activation threshold). Weights are declared by the human, never learned.
type Weight string

const (
	// WeightLoadBearing — a defect in this part reopens the whole's emergent invariant.
	WeightLoadBearing Weight = "load-bearing"
	// WeightCosmetic — a change to this part stays below threshold; it does not reopen the whole.
	WeightCosmetic Weight = "cosmetic"
)

// weightValue maps a declared weight to its activation contribution (KRD §112). load-bearing
// contributes 1.0, cosmetic contributes 0.0. These are the DECLARED activation weights of the
// two-valued closed set, not learned coefficients.
func weightValue(w Weight) float64 {
	if w == WeightLoadBearing {
		return 1.0
	}
	return 0.0
}

// Verdict is a node's aggregate (or own_mirror) verdict — exactly one of two. There is no third
// verdict (the rapid invariant pins it). GREEN is the only healthy verdict; RED reopens the law.
type Verdict string

const (
	// VerdictGreen — the node's own mirror is green AND every composes-child aggregates GREEN.
	VerdictGreen Verdict = "GREEN"
	// VerdictRed — the node's own mirror is red, OR some load-bearing child aggregates RED.
	VerdictRed Verdict = "RED"
)

// Ref is a PINNED layer reference: an id plus the concrete version it points at (id@version) —
// the same pinning rule as S17's links.Ref (a composes edge pins both ends by version).
type Ref struct {
	ID      string `json:"id"`
	Version string `json:"version"`
}

// String renders the ref as the canonical "id@version" form.
func (r Ref) String() string { return r.ID + "@" + r.Version }

// Composes is the SEVENTH KRD §108 link as a value: a `parent` whole composes a `child` part,
// version-pinned at both ends, carrying the DECLARED weight (load-bearing | cosmetic). It is a
// specialization of S17's generic Link (kind == "composes"); the per-edge weight is the extra
// declared truth composes carries that the generic link does not.
type Composes struct {
	// Parent is the composite (the whole), pinned id@version.
	Parent Ref `json:"parent"`
	// Child is the part (the contained layer), pinned id@version.
	Child Ref `json:"child"`
	// Weight is the DECLARED edge weight (load-bearing | cosmetic), KRD §112.
	Weight Weight `json:"weight"`
}

// Node is the minimal read-model of a kernel.layer the aggregate needs: its id@version, its
// own_mirror verdict (CONSUMED from S06's completeness law — not re-derived here), and its
// DECLARED activation_threshold (KRD §112). The full Layer AST lives in the kernel schema; this
// is the projection the aggregate reads (the wall: read-only).
type Node struct {
	LayerID             string  `json:"layer_id"`
	Version             string  `json:"version"`
	OwnMirror           Verdict `json:"own_mirror"`
	ActivationThreshold float64 `json:"activation_threshold"`
}

// Tree is the composes DAG over layers plus the per-node own_mirror verdicts and the set of
// changed children (for the weighted activation). Nodes is keyed by layer id; Edges are the
// declared composes links; Changed names the children that changed this cut (drives §112
// activation). It is the pure input Aggregate reads — where it comes from (the kernel join, the
// DAG head resolution) is owned by other steps and handed in, so Aggregate stays a pure function.
type Tree struct {
	Nodes   map[string]Node `json:"nodes"`
	Edges   []Composes      `json:"edges"`
	Changed []string        `json:"changed,omitempty"`
}

// PathStep is one node on the drill-down path (KRD §110): the layer id@version and its own +
// aggregate verdict. The path descends from the queried root toward the red child that caused it.
type PathStep struct {
	LayerID   string  `json:"layer_id"`
	Version   string  `json:"version"`
	OwnMirror Verdict `json:"own_mirror"`
	Aggregate Verdict `json:"aggregate"`
}

// Result is Aggregate's output: the recursive verdict at the queried node plus the drill-down
// path (KRD §110) naming the chain down to the red child (empty tail when GREEN). It is the
// computed verdict, never a boolean the package then satisfies (anti-Goodhart, CLAUDE.md §8).
type Result struct {
	Verdict   Verdict    `json:"verdict"`
	DrillDown []PathStep `json:"drill_down"`
}

// CycleError is the typed error returned when the composes graph contains a cycle (KRD §82: a
// failure made explicit, an OpenQuestion — never a silent infinite recursion, never an invented
// edge). Cycle names the layer ids on the detected cycle, in visitation order.
type CycleError struct {
	Cycle []string
}

func (e *CycleError) Error() string {
	return fmt.Sprintf("composes: cycle detected over layers [%s] — composes must be a DAG (KRD §108); "+
		"the aggregate refuses to recurse forever and invents no edge", strings.Join(e.Cycle, " → "))
}

// SerializeComposesBody renders a kernel.link body carrying a composes edge, so the 7th link
// rides INSIDE the content-addressed S17 link body (it REUSES S02's records canonicalization, it
// does NOT fork it): a body produced here round-trips through records.NewRecord as
// id == version == Hash(Canonicalize(body)). The discriminator is {kind:"link",
// link_kind:"composes"}; the DECLARED weight rides in the body alongside the pinned parent/child
// refs — so the weight is a content-addressed fact, never a defaulted column. Changing the weight
// (or either pinned ref) yields a different version (a new row, never an in-place mutation).
func SerializeComposesBody(c Composes) ([]byte, error) {
	body := map[string]any{
		"kind":      string(records.KindLink),
		"link_kind": "composes",
		"parent":    c.Parent,
		"child":     c.Child,
		"weight":    string(c.Weight),
	}
	return json.Marshal(body)
}

// childrenOf returns the declared composes edges whose parent is the given layer id, in a stable
// (child-id) order so the drill-down path and the verdict are deterministic.
func childrenOf(t Tree, parentID string) []Composes {
	var out []Composes
	for _, e := range t.Edges {
		if e.Parent.ID == parentID {
			out = append(out, e)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Child.ID < out[j].Child.ID })
	return out
}

// Aggregate computes the recursive compositional-truth verdict at `rootID` (KRD §109):
//
//	GREEN ⟺ own_mirror(root)==GREEN ∧ ∀ child via composes(root) : Aggregate(child)==GREEN.
//
// It applies the §112 weighted, thresholded activation: a child's redness only reopens the
// parent when the cumulative activation of CHANGED contributing children reaches the parent's
// declared activation_threshold — so a cosmetic change below threshold leaves a green parent
// green. The own_mirror verdict always counts (a red own mirror reddens regardless of children).
//
// Aggregate is PURE, TOTAL on a DAG (always GREEN | RED), DETERMINISTIC, and NEVER PANICS. On a
// cycle it returns a typed *CycleError (never recurses forever). It returns the drill-down path
// (KRD §110) naming the chain down to the red child. Reads only declared edges/weights/thresholds.
func Aggregate(t Tree, rootID string) (Result, error) {
	res, err := aggregate(t, rootID, map[string]bool{})
	if err != nil {
		return Result{}, err
	}
	return res, nil
}

// aggregate is the recursive worker; `onPath` is the set of layer ids currently on the recursion
// stack (the cycle guard — re-entering a node on the path is a cycle).
func aggregate(t Tree, id string, onPath map[string]bool) (Result, error) {
	if onPath[id] {
		return Result{}, &CycleError{Cycle: pathOrder(onPath, id)}
	}
	node, ok := t.Nodes[id]
	if !ok {
		// A child edge points at a node not in the tree: an absent layer. It is treated as RED
		// (a dangling part cannot be proven GREEN) — the aggregate invents nothing, it reports
		// the declared edge's target as unprovable. This mirrors S17's "absent ⇒ red".
		return Result{
			Verdict:   VerdictRed,
			DrillDown: []PathStep{{LayerID: id, OwnMirror: VerdictRed, Aggregate: VerdictRed}},
		}, nil
	}

	onPath[id] = true
	defer delete(onPath, id)

	// §109 — the recursive law is UNCONDITIONAL: a red own mirror, or ANY composes-child whose
	// aggregate is RED, reddens the parent. (A part that cannot be proven green cannot be a green
	// whole — "truth(composite) = Σ truths(parts) + own emergent truth".)
	verdict := node.OwnMirror // a red own mirror reddens regardless of children
	var redChildPath []PathStep
	for _, edge := range childrenOf(t, id) {
		childRes, err := aggregate(t, edge.Child.ID, onPath)
		if err != nil {
			return Result{}, err
		}
		if childRes.Verdict == VerdictRed {
			verdict = VerdictRed
			if redChildPath == nil {
				redChildPath = childRes.DrillDown
			}
		}
	}

	step := PathStep{LayerID: node.LayerID, Version: node.Version, OwnMirror: node.OwnMirror, Aggregate: verdict}
	if verdict == VerdictGreen {
		return Result{Verdict: VerdictGreen, DrillDown: []PathStep{step}}, nil
	}
	// drill-down (KRD §110): the queried node, then the chain down to the red child that caused it
	return Result{Verdict: VerdictRed, DrillDown: append([]PathStep{step}, redChildPath...)}, nil
}

// Activation computes the §112 activation of a composite: Σ weight(changed children) over the
// declared composes edges whose child is in the tree's Changed set. load-bearing children
// contribute 1.0, cosmetic children 0.0 — so a change confined to cosmetic children yields
// activation 0.0. It is pure and reads only DECLARED weights/edges (never learned, never guessed).
func Activation(t Tree, parentID string) float64 {
	changed := changedSet(t)
	var sum float64
	for _, edge := range childrenOf(t, parentID) {
		if changed[edge.Child.ID] {
			sum += weightValue(edge.Weight)
		}
	}
	return sum
}

// ReopensOnChange reports whether the changes this cut carries reopen the composite's emergent
// invariant (KRD §112): true iff Activation(parent) ≥ the parent's DECLARED activation_threshold
// (and the threshold is positive — a zero threshold means "any load-bearing change reopens", a
// positive threshold is the declared gate). A cosmetic change below threshold returns false —
// "épingle un défaut, pas un changement". The own-mirror/child VERDICT (the §109 law) is
// independent of this; ReopensOnChange answers "must the parent's emergent mirror be RE-RUN?",
// the signal S19's weighted propagation consumes.
func ReopensOnChange(t Tree, parentID string) bool {
	node, ok := t.Nodes[parentID]
	if !ok {
		return false
	}
	if node.ActivationThreshold <= 0 {
		return Activation(t, parentID) > 0
	}
	return Activation(t, parentID) >= node.ActivationThreshold
}

// changedSet builds the membership set of changed children for §112 activation.
func changedSet(t Tree) map[string]bool {
	m := make(map[string]bool, len(t.Changed))
	for _, id := range t.Changed {
		m[id] = true
	}
	return m
}

// pathOrder renders the cycle as the on-path ids plus the re-entered id, in a stable order so
// the CycleError is deterministic.
func pathOrder(onPath map[string]bool, reentered string) []string {
	ids := make([]string, 0, len(onPath)+1)
	for id := range onPath {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return append(ids, reentered)
}
