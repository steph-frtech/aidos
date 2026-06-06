// model.go — THROWAWAY (EL01 spike). The deterministic model of "a need captured two ways".
//
// AIDOS forbids prompt → code (CLAUDE.md Core rule): the human owns the truth (the "what"), the
// agent owns the implementation (the "how"). Today the app-builder's entry (S64 "capturez votre
// idée") is a SINGLE free-text box: the user throws one flat prompt and the agent must infer the
// whole verticale §23 (product → journey → view → control → action → operation → entity) from it.
//
// EL01 is the NECESSITY SPIKE: prove that a flat free-text box is INSUFFICIENT, by sketching a
// minimal BesoinGraph (product→entity) on the demo app (the S46 checkout) and SHOWING that a
// top-down order + a per-level forcing gate produces a backlog of Ideas STRICTLY richer / ordered
// than a flat prompt. The output is FALSIFIABLE: if the BesoinGraph backlog were NOT measurably
// richer/ordered than the flat prompt, the verdict would be NO-GO and the track would stop.
//
// ALL pure functions (determinism-first, CLAUDE.md §6/§8): same need → same backlog → same numbers
// → same verdict, replayed N times by TestReproducible. No LLM, no clock, no rng. The MODEL of the
// two captures is hand-declared from the S46 checkout anchors (read-only), never inferred.
package besoin

import (
	"crypto/sha256"
	"encoding/hex"
	"sort"
)

// Rung is one SOURCE rung of the KRD §23 verticale. The order of the constant block IS the
// top-down order the BesoinGraph follows; a flat prompt has NO rung at all (it is a single
// undifferentiated blob).
type Rung string

const (
	RungProduct   Rung = "product"   // the intention + ≤5 scenarios
	RungJourney   Rung = "journey"   // the user journey (Gherkin) — NoEmit (seeds anchors)
	RungView      Rung = "view"      // the screen (goal+zones+data) — NoEmit (seeds anchors)
	RungControl   Rung = "control"   // the button (visible_when/enabled_when/triggers)
	RungAction    Rung = "action"    // the action (invoke → operation)
	RungOperation Rung = "operation" // the operation (steps + fixture)
	RungEntity    Rung = "entity"    // the entity (attributes on the closed scalar)
)

// rungOrder is the TOTAL, CLOSED top-down order of the SOURCE rungs (KRD §23). Declared, not
// learned. A BesoinGraph descends in exactly this order; the topological backlog (EmitBacklog)
// promotes Ideas in exactly this order — "the doc follows the architecture".
var rungOrder = []Rung{
	RungProduct, RungJourney, RungView, RungControl, RungAction, RungOperation, RungEntity,
}

// emits reports whether a rung MAPS to a Proposes kind (emits an Idea) or is NoEmit (journey/view
// seed the anchors of mapping rungs without emitting an Idea — EL05's declared decision, sketched
// here). This is the honest join with the existing closed set ideas.ProposesKinds()
// (control|policy|operation|action|entity|product) — journey/view are NOT in it.
func (r Rung) emits() bool {
	switch r {
	case RungJourney, RungView:
		return false // NoEmit — seeds anchors, never an Idea (no silent journey→product cast)
	default:
		return true
	}
}

// proposes returns the Proposes kind a mapping rung emits (verbatim the rung name, all of which ARE
// in ideas.ProposesKinds()). Only called on rungs where emits() is true.
func (r Rung) proposes() string { return string(r) }

// Node is one resolved rung of the sketched BesoinGraph: its body, its outgoing reference to a
// deeper rung (control→action, action→operation, operation→entity — the constrains edges), and the
// four per-truth metadata (truth_kind, verifiability, scope, authority — EL04). A flat prompt has
// NONE of this structure; the agent would have to GUESS all of it.
type Node struct {
	Rung Rung
	Body string // the declared body of this rung (from the S46 checkout anchors)
	// RefTo is the deeper rung this node constrains (resolves @rung). Empty for entity (leaf).
	RefTo Rung
	// The four per-truth metadata (EL04) — typed, present BECAUSE the gate forced their declaration.
	TruthKind     string // e.g. "behavioral", "structural"
	Verifiability string // e.g. "sampleable"
	Scope         string // e.g. "region:*"
	Authority     string // e.g. "product-owner"
}

// fullyTyped reports whether a node carries all four metadata — the gate forces this before the
// rung is resolved (a flat prompt carries NONE).
func (n Node) fullyTyped() bool {
	return n.TruthKind != "" && n.Verifiability != "" && n.Scope != "" && n.Authority != ""
}

// BesoinGraph is the ordered, content-addressed sketch the spike produces from the checkout demo.
// Append-only ordered set of Nodes following rungOrder. NO Version field, NO Mirror field (the
// double absence = it is a NEED, not a truth — like ideas.Idea).
type BesoinGraph struct {
	Project string
	Nodes   []Node
}

// Hash content-addresses the graph (stable across runs — the rung order is semantic and preserved,
// keys are not map-iterated). Mirrors records.Hash discipline (the spike does not import back/).
func (g BesoinGraph) Hash() string {
	h := sha256.New()
	h.Write([]byte(g.Project))
	for _, n := range g.Nodes {
		h.Write([]byte{0})
		h.Write([]byte(n.Rung))
		h.Write([]byte{0})
		h.Write([]byte(n.Body))
		h.Write([]byte{0})
		h.Write([]byte(n.RefTo))
		h.Write([]byte{0})
		h.Write([]byte(n.TruthKind + "|" + n.Verifiability + "|" + n.Scope + "|" + n.Authority))
	}
	return hex.EncodeToString(h.Sum(nil))[:16]
}

// FlatPrompt is the CONTROL: the single free-text box S64 has today. The whole need is one blob;
// the rung structure, the order, the per-truth metadata and the dependency edges are ALL implicit
// — the agent must infer them, with no forcing gate to catch a missing rung or an off-altitude
// answer. The spike measures what a flat prompt yields WITHOUT the BesoinGraph machinery.
type FlatPrompt struct {
	Project string
	Text    string // the whole need as one undifferentiated string
}

// Hash content-addresses the flat prompt.
func (p FlatPrompt) Hash() string {
	h := sha256.New()
	h.Write([]byte(p.Project))
	h.Write([]byte{0})
	h.Write([]byte(p.Text))
	return hex.EncodeToString(h.Sum(nil))[:16]
}

// BacklogItem is one Idea the capture emits: its Proposes kind, its rung of origin, the topological
// rank (the promotion order), whether its outgoing ref resolves, whether it is fully typed, and the
// anchors above that constrain it. The richness of the backlog is COUNTED over these fields.
type BacklogItem struct {
	Proposes     string
	Rung         Rung
	TopoRank     int      // promotion order (0-based); the verticale §23 order for the graph
	RefResolves  bool     // does its outgoing reference resolve to a declared deeper rung?
	FullyTyped   bool     // does it carry all four metadata?
	AnchorsAbove []string // the resolved rungs above that constrain it (incl. NoEmit journey/view)
}

// Backlog is the ordered set of Ideas a capture emits, with the metric inputs the verdict counts.
type Backlog struct {
	Source       string // "besoin-graph" | "flat-prompt"
	Items        []BacklogItem
	Ordered      bool // is the backlog topologically ordered (deterministic promotion order)?
	NoEmitSeeded int  // # NoEmit rungs (journey/view) that seeded anchors without emitting
	SourceHash   string
}

// EmitFromGraph projects the sketched BesoinGraph to an ordered backlog of Ideas — the EL16/EL17
// hand-off, sketched. Each MAPPING node (emits()==true) becomes one BacklogItem; NoEmit nodes
// (journey/view) seed the anchors_above of the mapping nodes below them, never an Idea (no silent
// cast). The order is the topological rung order (rungOrder) — "the doc follows the architecture".
// Pure function of the graph.
func EmitFromGraph(g BesoinGraph) Backlog {
	// Resolved rung bodies, for ref resolution + anchor seeding.
	declared := map[Rung]bool{}
	for _, n := range g.Nodes {
		declared[n.Rung] = true
	}

	bl := Backlog{Source: "besoin-graph", Ordered: true, SourceHash: g.Hash()}
	rank := 0
	// Walk in the canonical top-down order so the backlog is deterministically ordered.
	for _, rung := range rungOrder {
		var node *Node
		for i := range g.Nodes {
			if g.Nodes[i].Rung == rung {
				node = &g.Nodes[i]
				break
			}
		}
		if node == nil {
			continue // rung not declared in this sketch
		}
		if !rung.emits() {
			bl.NoEmitSeeded++ // journey/view seed anchors, never an Idea
			continue
		}
		item := BacklogItem{
			Proposes:    rung.proposes(),
			Rung:        rung,
			TopoRank:    rank,
			RefResolves: node.RefTo == "" || declared[node.RefTo],
			FullyTyped:  node.fullyTyped(),
		}
		// anchors_above: every resolved rung ABOVE this one (incl. NoEmit journey/view).
		for _, above := range rungOrder {
			if above == rung {
				break
			}
			if declared[above] {
				item.AnchorsAbove = append(item.AnchorsAbove, string(above))
			}
		}
		bl.Items = append(bl.Items, item)
		rank++
	}
	return bl
}

// EmitFromFlat projects the flat prompt to a backlog — the HONEST model of what a single text box
// yields. A flat prompt has no rung structure, so the agent can only seed ONE undifferentiated
// candidate Idea (provenance human, the verbatim text); there is NO per-rung decomposition, NO
// topological order, NO resolved dependency edges, NO per-truth metadata (the agent would have to
// guess them — a prompt→code shortcut the wall forbids). Pure function of the prompt.
func EmitFromFlat(p FlatPrompt) Backlog {
	return Backlog{
		Source:     "flat-prompt",
		SourceHash: p.Hash(),
		Ordered:    false, // one blob — no order to speak of
		Items: []BacklogItem{
			{
				Proposes:     "product", // the only thing inferable: "it's some product idea"
				Rung:         RungProduct,
				TopoRank:     0,
				RefResolves:  false, // no declared deeper rung to resolve to
				FullyTyped:   false, // no metadata declared
				AnchorsAbove: nil,   // nothing above — it is one flat blob
			},
		},
	}
}

// Richness is the COUNTED, declared metric of a backlog's quality — every term is an integer
// computed by a pure function over the backlog, never an LLM judgment. The BesoinGraph backlog
// must be STRICTLY richer on these counts than the flat prompt for the verdict to be GO.
type Richness struct {
	Source        string
	NumIdeas      int  // # Ideas emitted (mapping rungs)
	NumResolved   int  // # Ideas whose outgoing ref resolves (dependency-edges present)
	NumFullyTyped int  // # Ideas carrying all four per-truth metadata
	NumAnchored   int  // # Ideas carrying ≥1 anchor_above (the compound grounding)
	Ordered       bool // is the backlog topologically ordered?
	NoEmitSeeded  int  // # NoEmit rungs that seeded anchors (journey/view)
	Hash          string
}

// Measure counts the richness of a backlog. Pure function (sort only for stable hashing).
func Measure(bl Backlog) Richness {
	r := Richness{Source: bl.Source, Ordered: bl.Ordered, NoEmitSeeded: bl.NoEmitSeeded, Hash: bl.SourceHash}
	for _, it := range bl.Items {
		r.NumIdeas++
		if it.RefResolves {
			r.NumResolved++
		}
		if it.FullyTyped {
			r.NumFullyTyped++
		}
		if len(it.AnchorsAbove) > 0 {
			r.NumAnchored++
		}
	}
	return r
}

// sortedRungs is a test/helper convenience: the canonical rung order as a fresh sorted-by-position
// slice (kept stable; never map-iterated).
func sortedRungs() []Rung {
	out := append([]Rung(nil), rungOrder...)
	// rungOrder is already in canonical order; this guards against accidental mutation.
	sort.SliceStable(out, func(i, j int) bool {
		return indexOf(rungOrder, out[i]) < indexOf(rungOrder, out[j])
	})
	return out
}

func indexOf(s []Rung, r Rung) int {
	for i, x := range s {
		if x == r {
			return i
		}
	}
	return -1
}
