package besoin

// interview_property_test.go — EL13 reproducibility mirror (rapid, N1): the interview's pure
// functions are DETERMINISTIC (CLAUDE.md §6/§8 determinism-first). Same input → same output, no
// clock/rng/IO/LLM. The properties pin:
//
//   - EnterableLevel is deterministic and ranges only over the SOURCE rungs (never a band);
//   - DispatchOf is TOTAL over the grammar (every level maps to a closed-set gesture);
//   - RecordAnswer is deterministic (same args → byte-identical InterviewResult);
//   - RecordAnswer's `resolved` is COMPUTED (it equals CanDescend.enough), never declared;
//   - an off-altitude / fuzzy turn leaves the graph_hash UNCHANGED (no descent);
//   - NextPrompt is deterministic and its OpenBranches equal BranchTree (no fork).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/truthtyping"
	"pgregory.net/rapid"
)

// propMeta is a fixed complete metadata for the property runs (the metadata enum space is exercised by
// EL04's mirror; here we vary the BODY and the level).
func propMeta() Metadata {
	return Metadata{
		TruthKind:     truthtyping.KindBehavioral,
		Verifiability: truthtyping.LevelDeterministic,
		Scope:         scope.TruthScope{Region: scope.RegionGlobal},
	}
}

// genProductBody draws a product-shaped body (sometimes complete, sometimes vacant) so RecordAnswer
// exercises both the record and the not-enough paths.
func genProductBody(t *rapid.T) map[string]any {
	withIntent := rapid.Bool().Draw(t, "withIntent")
	nScn := rapid.IntRange(0, 7).Draw(t, "nScenarios")
	nSel := rapid.IntRange(0, 3).Draw(t, "nSelects")
	body := map[string]any{}
	if withIntent {
		body["intent"] = "une intention"
	}
	scn := make([]any, nScn)
	for i := range scn {
		scn[i] = "scénario"
	}
	if nScn > 0 {
		body["scenarios"] = scn
	}
	archetypes := []string{"onboarding", "core-task", "settings"}
	sel := make([]any, 0, nSel)
	for i := 0; i < nSel && i < len(archetypes); i++ {
		sel = append(sel, archetypes[i])
	}
	if nSel > 0 {
		body["selects"] = sel
	}
	return body
}

func TestProp_DispatchOf_TotalOverGrammar(t *testing.T) {
	for _, l := range AllLevels() {
		g, ok := DispatchOf(l)
		if !ok {
			t.Fatalf("DispatchOf(%q) not ok — the table must be total over the grammar", l)
		}
		switch g {
		case GestureGrill, GestureView, GestureAction, GestureGeneric:
		default:
			t.Fatalf("DispatchOf(%q) = %q — outside the closed gesture set", l, g)
		}
	}
	// An out-of-grammar level fails closed.
	if g, ok := DispatchOf(Level("nonsense")); ok || g != GestureGeneric {
		t.Fatalf("out-of-grammar DispatchOf must be (generic,false), got (%q,%v)", g, ok)
	}
}

func TestProp_EnterableLevel_OnlySourceRungs(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := NewGraph("p")
		meta := func(Level) Metadata { return propMeta() }
		l, ok := EnterableLevel(g, meta)
		if !ok {
			rt.Fatal("a fresh graph must have an enterable level (product)")
		}
		// The enterable level is always a SOURCE rung, never a transversal band.
		if !IsSourceRung(l) {
			rt.Fatalf("EnterableLevel returned %q which is not a SOURCE rung", l)
		}
		// Determinism: a second call yields the same answer.
		l2, _ := EnterableLevel(g, meta)
		if l != l2 {
			rt.Fatalf("EnterableLevel not deterministic: %q vs %q", l, l2)
		}
	})
}

func TestProp_RecordAnswer_Deterministic_And_ResolvedComputed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		body := genProductBody(rt)
		g := NewGraph("p")
		r1 := RecordAnswer(g, LevelProduct, body, "u", propMeta())
		r2 := RecordAnswer(g, LevelProduct, body, "u", propMeta())

		// Determinism: byte-identical results.
		b1, b2 := canonicalJSON(r1), canonicalJSON(r2)
		if string(b1) != string(b2) {
			rt.Fatalf("RecordAnswer not deterministic:\n%s\n%s", b1, b2)
		}

		// `resolved` is COMPUTED — it equals CanDescend.enough over the RESULT graph (never declared).
		want := CanDescend(r1.Graph, LevelProduct, propMeta()).Enough
		if r1.Resolved != want {
			rt.Fatalf("Resolved=%v but CanDescend.enough=%v — resolved must be computed, never declared", r1.Resolved, want)
		}
		// On a RECORD routing the verdict.enough must equal resolved; on a non-record routing the graph
		// is unchanged.
		switch r1.Routing {
		case RouteRecord:
			if r1.Resolved != r1.Verdict.Enough {
				rt.Fatalf("record turn: Resolved %v != Verdict.Enough %v", r1.Resolved, r1.Verdict.Enough)
			}
		case RouteOffAltitude, RouteSpike:
			h0, _ := g.Hash()
			h1, _ := r1.Graph.Hash()
			if h0 != h1 {
				rt.Fatalf("non-record routing %q must leave the graph unchanged: %q != %q", r1.Routing, h0, h1)
			}
			if r1.Resolved {
				rt.Fatalf("non-record routing %q must not be resolved", r1.Routing)
			}
		}
	})
}

func TestProp_RecordAnswer_OffAltitude_GraphUnchanged(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		// An entity attributes body submitted at product is ALWAYS off-altitude (schema mismatch).
		body := map[string]any{"attributes": []any{"id", "title"}}
		g := NewGraph("p")
		r := RecordAnswer(g, LevelProduct, body, "u", propMeta())
		if r.Routing != RouteOffAltitude {
			rt.Fatalf("an entity body at product must route off_altitude, got %q", r.Routing)
		}
		h0, _ := g.Hash()
		h1, _ := r.Graph.Hash()
		if h0 != h1 {
			rt.Fatalf("off-altitude turn changed the graph: %q != %q", h0, h1)
		}
		if r.BlockReason == nil {
			rt.Fatal("off-altitude turn must carry a BlockReason naming the door")
		}
	})
}

func TestProp_RecordAnswer_Fuzzy_RoutesSpike(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		body := map[string]any{
			"intent":    "une intention",
			"scenarios": []any{"un scénario"},
			"selects":   []any{"onboarding"},
		}
		meta := propMeta()
		meta.Verifiability = truthtyping.LevelUnverifiable // routes to /spike
		g := NewGraph("p")
		r := RecordAnswer(g, LevelProduct, body, "u", meta)
		if r.Routing != RouteSpike {
			rt.Fatalf("an unverifiable answer must route to spike, got %q", r.Routing)
		}
		if len(r.SpikeRoute) != 3 || r.SpikeRoute[0] != "idea_capture" || r.SpikeRoute[2] != "idea_spike" {
			rt.Fatalf("the spike route must be the legal three-hop gate, got %v", r.SpikeRoute)
		}
	})
}

func TestProp_NextPrompt_OpenBranchesEqualBranchTree(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := NewGraph("p")
		meta := func(Level) Metadata { return propMeta() }
		p1 := NextPrompt(g, meta)
		p2 := NextPrompt(g, meta)
		if string(canonicalJSON(p1)) != string(canonicalJSON(p2)) {
			rt.Fatal("NextPrompt not deterministic")
		}
		if p1.Done {
			rt.Fatal("a fresh graph is not done")
		}
		// The prompt's OpenBranches are the EL12 BranchTree (no fork) over the enterable level's body.
		var body map[string]any
		if node, ok := g.Node(p1.Level); ok {
			body, _ = decodeBody(node.Body)
		}
		want := BranchTree(p1.Level, body)
		if string(canonicalJSON(p1.OpenBranches)) != string(canonicalJSON(want)) {
			rt.Fatal("NextPrompt.OpenBranches diverge from BranchTree — a fork")
		}
	})
}
