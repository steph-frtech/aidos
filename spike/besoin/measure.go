// measure.go — THROWAWAY (EL01 spike). The deterministic measurement harness + the COMPUTED
// go/no-go verdict. ALL pure functions (determinism-first): same need → same numbers, so the
// verdict is reproducible. The verdict is COMPUTED against DECLARED thresholds, never declared.
package besoin

// Comparison is the core EL01 measurement: the SAME need (S46 checkout) captured as a BesoinGraph
// vs as a flat prompt, with both richness profiles side by side and the strict-dominance deltas.
type Comparison struct {
	Need  string
	Graph Richness // the architecturally-ordered capture
	Flat  Richness // the single free-text box (control)

	// Strict-dominance deltas — every one must be ≥0 and the headline ones >0 for GO.
	DeltaIdeas      int // graph emits more Ideas (per-rung decomposition vs one blob)
	DeltaResolved   int // graph resolves dependency edges the flat prompt cannot
	DeltaFullyTyped int // graph carries per-truth metadata the flat prompt lacks
	DeltaAnchored   int // graph carries the compound anchors_above grounding
	GraphOrdered    bool
	FlatOrdered     bool
}

// Compare measures one need both ways and computes the deltas. Pure function.
func Compare(need string, g BesoinGraph, p FlatPrompt) Comparison {
	gr := Measure(EmitFromGraph(g))
	fl := Measure(EmitFromFlat(p))
	return Comparison{
		Need:            need,
		Graph:           gr,
		Flat:            fl,
		DeltaIdeas:      gr.NumIdeas - fl.NumIdeas,
		DeltaResolved:   gr.NumResolved - fl.NumResolved,
		DeltaFullyTyped: gr.NumFullyTyped - fl.NumFullyTyped,
		DeltaAnchored:   gr.NumAnchored - fl.NumAnchored,
		GraphOrdered:    gr.Ordered,
		FlatOrdered:     fl.Ordered,
	}
}

// MinIdeaGain is the DECLARED go-threshold (above the line, not learned — CLAUDE.md §8): the
// BesoinGraph must emit at least this many MORE Ideas than the flat prompt. The S46 checkout has 5
// mapping rungs (product, control, action, operation, entity) + 2 NoEmit (journey, view); the flat
// prompt yields exactly 1 undifferentiated candidate. We gate on a strictly positive gain ≥3 — a
// deliberately modest bar that still proves per-rung decomposition is materially richer.
const MinIdeaGain = 3

// Verdict is the spike's go/no-go decision, COMPUTED (never declared) from the measurements. GO iff
// the BesoinGraph backlog STRICTLY DOMINATES the flat prompt on every richness axis (more Ideas,
// more resolved edges, more typed nodes, more anchored nodes), is topologically ordered while the
// flat prompt is not, and the whole measurement is reproducible.
type Verdict struct {
	Go bool

	Cmp Comparison

	MinIdeaGain  int  // declared minimum Idea-count gain on the worked need
	Reproducible bool // same need → same comparison + same hashes (filled by Decide)
	Rationale    string
}

// Decide computes the go/no-go verdict on the S46 checkout need. GO iff the BesoinGraph capture
// strictly dominates the flat prompt on every counted richness axis (with the headline Idea gain ≥
// the declared floor), the graph is ordered and the flat prompt is not, and the measurement is
// reproducible. Otherwise NO-GO and (per the roadmap spike-gate) the EL track stops.
func Decide() Verdict {
	g := checkoutGraph()
	p := checkoutFlat()
	cmp := Compare("demo-checkout: a customer places an order from their cart", g, p)

	// Reproducibility (determinism-first): recompute and compare the driver numbers + hashes.
	again := Compare("demo-checkout: a customer places an order from their cart", g, p)
	reproducible := again.DeltaIdeas == cmp.DeltaIdeas &&
		again.Graph.Hash == cmp.Graph.Hash &&
		again.Flat.Hash == cmp.Flat.Hash &&
		g.Hash() == g.Hash() && p.Hash() == p.Hash()

	v := Verdict{
		Cmp:          cmp,
		MinIdeaGain:  MinIdeaGain,
		Reproducible: reproducible,
	}

	strictlyRicher := cmp.DeltaIdeas >= MinIdeaGain &&
		cmp.DeltaResolved > 0 &&
		cmp.DeltaFullyTyped > 0 &&
		cmp.DeltaAnchored > 0
	orderedDominance := cmp.GraphOrdered && !cmp.FlatOrdered

	v.Go = strictlyRicher && orderedDominance && reproducible

	switch {
	case v.Go:
		v.Rationale = "GO: on the S46 demo checkout, capturing the need as a top-down BesoinGraph with a per-level forcing gate yields a backlog STRICTLY richer/ordered than the single free-text box — " +
			itoa(cmp.Graph.NumIdeas) + " ordered, dependency-resolved, fully-typed Ideas (+" + itoa(cmp.DeltaIdeas) + " over the flat prompt's lone untyped blob), " +
			itoa(cmp.Graph.NumResolved) + " with resolving outgoing refs (+" + itoa(cmp.DeltaResolved) + "), " +
			itoa(cmp.Graph.NumFullyTyped) + " carrying all four per-truth metadata (+" + itoa(cmp.DeltaFullyTyped) + "), " +
			itoa(cmp.Graph.NumAnchored) + " carrying anchors_above grounding (+" + itoa(cmp.DeltaAnchored) + "), and " +
			itoa(cmp.Graph.NoEmitSeeded) + " NoEmit rungs (journey/view) seeding anchors without a silent cast — versus a flat prompt that is ONE unordered, untyped, edge-less candidate the agent must guess the rest from. The flat box forces prompt→code (the wall forbids it); the BesoinGraph forces the user to explain the app level by level, above the wall. The measurement is reproducible (pure function, no LLM). The track is NECESSARY → proceed to EL02 (the closed BesoinLevel grammar). HARVEST the anchor Idea (see Harvest())."
	case !reproducible:
		v.Rationale = "NO-GO: the comparison is not reproducible — a determinism gap. The EL track stops (roadmap spike-gate)."
	case !orderedDominance:
		v.Rationale = "NO-GO: the BesoinGraph backlog is not strictly more ordered than the flat prompt — the architectural ordering claim fails. The EL track stops."
	default:
		v.Rationale = "NO-GO: the BesoinGraph backlog does not strictly dominate the flat prompt on the richness axes (Ideas +" + itoa(cmp.DeltaIdeas) + ", resolved +" + itoa(cmp.DeltaResolved) + ", typed +" + itoa(cmp.DeltaFullyTyped) + ", anchored +" + itoa(cmp.DeltaAnchored) + ") — the forcing gate does not pay enough to justify the machinery. The EL track stops (roadmap spike-gate)."
	}
	return v
}
