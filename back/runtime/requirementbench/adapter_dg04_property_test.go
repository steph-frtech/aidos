package requirementbench

// adapter_dg04_property_test.go — DG04's CONTRACT mirror (invariant ∀): the model-backed adapter
// behind the RequirementBench port is re-judged by the DETERMINISTIC DG03 metric, and the judge
// DOMINATES the model. Written RED-first (the done-criterion of DG04) and HERMETIC: every property
// here runs on the deterministic fixtureModel — NO network, no real claude call — so the guarantee
// rests on pure code. The real ClaudeModel is wired (adapter_dg04.go) but never enters the mirror;
// adapter_dg04_fixture_test.go opts into the real call only when claude is reachable, and reports the
// fallback honestly.
//
// The four properties proven (mapping the DG04 done-criteria, ROADMAP-diffusiongemma.md):
//
//  1. JUDGE DOMINATES MODEL IDENTITY. The CompletenessReport is INVARIANT to the model's identity:
//     two DIFFERENT adapters that emit the SAME candidate outputs (same Texts, same order) yield the
//     SAME report byte-for-byte. The model only proposes Text; the pure Derive/Metric counts the
//     types. (The deterministic judge dominates — §8.)
//  2. MODEL ABSENT ⇒ GOVERNED FALLBACK. An adapter that is unavailable (returns an error / has no
//     model) NEVER produces a screen error: BenchVia falls back to the deterministic recompile-only
//     baseline and still returns a valid report, with usedRealLLM=false. A model absent is a governed
//     degradation, not a crash.
//  3. AI OFF ⇒ REPLAY STAYS GREEN. With the AI disabled (fixtureModel / disabled adapter), the report
//     re-judged from the produced candidates is byte-for-byte reproducible across 100 replays — the
//     reproducibility mirror holds with zero network.
//  4. JUDGE DETERMINISM INTACT. BenchVia's report equals the pure Metric over the SAME candidates the
//     adapter produced — the adapter adds NOTHING the judge does not re-derive. The model's Text is
//     always re-extracted; nothing the model says is trusted unre-judged.

import (
	"errors"
	"reflect"
	"testing"

	"pgregory.net/rapid"
)

// genSpecDeclaration draws a random declared spec structure (the DG03 "attendus" source), so the
// adapter mirror exercises spec-derived expected sets, not just hand-listed ones.
func genSpecDeclaration(t *rapid.T) SpecDeclaration {
	b := func(name string) bool { return rapid.Bool().Draw(t, name) }
	n := func(name string) int { return rapid.IntRange(0, 3).Draw(t, name) }
	return SpecDeclaration{
		HasViewGoal:       b("hasViewGoal"),
		HasViewData:       b("hasViewData"),
		HasViewEmptyState: b("hasViewEmptyState"),
		Controls:          n("controls"),
		ControlVisible:    b("controlVisible"),
		ControlEnabled:    b("controlEnabled"),
		Actions:           n("actions"),
		ActionOnSuccess:   b("actionOnSuccess"),
		ActionOnError:     b("actionOnError"),
		Operations:        n("operations"),
		OperationEvents:   n("operationEvents"),
		OperationGuards:   n("operationGuards"),
		Entities:          n("entities"),
		EntityFields:      n("entityFields"),
		EntityRelations:   n("entityRelations"),
		Invariants:        n("invariants"),
		Policies:          n("policies"),
		Budgets:           n("budgets"),
		ErrorCases:        n("errorCases"),
		EdgeCases:         n("edgeCases"),
	}
}

// staticModel is a SECOND deterministic adapter whose Propose returns a FIXED slice of candidate
// outputs — used to prove the report is invariant to which adapter produced identical Texts. It is a
// pure stand-in (no network), distinct in IDENTITY from fixtureModel but emitting the SAME outputs
// when handed the same canned Texts.
type staticModel struct {
	outputs []LLMOutput
}

func (m staticModel) Propose(_ Spec) ([]LLMOutput, error) { return m.outputs, nil }
func (m staticModel) Available() bool                     { return true }
func (m staticModel) Name() string                        { return "static-test" }

// brokenModel is an adapter that is UNAVAILABLE — Propose always errors and Available reports false.
// It stands for "the real DiffusionGemma weights/GPU are absent": BenchVia must fall back, never error.
type brokenModel struct{}

func (brokenModel) Propose(_ Spec) ([]LLMOutput, error) {
	return nil, errors.New("model unavailable (no weights/GPU): governed fallback expected")
}
func (brokenModel) Available() bool { return false }
func (brokenModel) Name() string    { return "broken-test" }

// TestJudgeDominatesModelIdentity — property (1): the report is INVARIANT to the adapter's identity.
// Two DIFFERENT adapters that emit the SAME candidate outputs produce the SAME report.
func TestJudgeDominatesModelIdentity(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		decl := genSpecDeclaration(t)
		spec := SpecFromDeclaration(rapid.StringMatching(`[a-z]{1,6}`).Draw(t, "id"), decl)

		// Produce a canned slice of candidate outputs with fixtureModel.
		fm := FixtureModel{}
		cands, err := fm.Propose(spec)
		if err != nil {
			t.Fatalf("fixtureModel.Propose errored: %v", err)
		}

		// Two distinct adapters, SAME outputs.
		a := fm                          // identity "fixture"
		b := staticModel{outputs: cands} // identity "static-test"

		repA, provA := BenchVia(a, spec)
		repB, provB := BenchVia(b, spec)
		// both are deterministic adapters; usedRealLLM must be false (no real claude).
		if provA.UsedRealLLM || provB.UsedRealLLM {
			t.Fatalf("expected usedRealLLM=false on deterministic adapters")
		}
		if !reflect.DeepEqual(repA, repB) {
			t.Fatalf("report not invariant to model identity:\n A=%+v\n B=%+v", repA, repB)
		}

		// And it must equal the pure Metric over the very same candidates (judge authoritative).
		want := Metric(spec, cands)
		if !reflect.DeepEqual(repA, want) {
			t.Fatalf("BenchVia report != pure Metric over the produced candidates:\n got=%+v\n want=%+v", repA, want)
		}
	})
}

// TestModelAbsentGovernedFallback — property (2): an unavailable adapter falls back to the
// deterministic recompile-only baseline; it NEVER errors and the report stays valid.
func TestModelAbsentGovernedFallback(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		decl := genSpecDeclaration(t)
		spec := SpecFromDeclaration(rapid.StringMatching(`[a-z]{1,6}`).Draw(t, "id"), decl)

		rep, prov := BenchVia(brokenModel{}, spec)
		if prov.UsedRealLLM {
			t.Fatalf("a broken/absent model must not claim usedRealLLM=true")
		}
		if !prov.FellBack {
			t.Fatalf("a broken/absent model must mark FellBack=true (the governed degradation)")
		}
		// The fallback report must equal the deterministic recompile-only bench over the recompile
		// projection of the spec — a valid report, never a panic/error path.
		recompileCands := RecompileProjection(spec)
		want := Metric(spec, recompileCands)
		if !reflect.DeepEqual(rep, want) {
			t.Fatalf("fallback report != recompile-only metric:\n got=%+v\n want=%+v", rep, want)
		}
		// MatchPct stays in [0,1] — a real value, not NaN.
		if rep.MatchPct < 0 || rep.MatchPct > 1 {
			t.Fatalf("fallback MatchPct out of [0,1]: %v", rep.MatchPct)
		}
	})
}

// TestAIOffReplayStaysGreen — property (3): with the AI disabled (fixtureModel), the re-judged report
// is byte-for-byte reproducible across 100 replays, with zero network.
func TestAIOffReplayStaysGreen(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		decl := genSpecDeclaration(t)
		spec := SpecFromDeclaration(rapid.StringMatching(`[a-z]{1,6}`).Draw(t, "id"), decl)

		first, prov := BenchVia(FixtureModel{}, spec)
		if prov.UsedRealLLM {
			t.Fatalf("fixtureModel must never use the real LLM")
		}
		for i := 0; i < 100; i++ {
			again, _ := BenchVia(FixtureModel{}, spec)
			if !reflect.DeepEqual(first, again) {
				t.Fatalf("AI-off replay %d non-reproducible:\n first=%+v\n again=%+v", i, first, again)
			}
		}
	})
}

// TestJudgeDeterminismIntact — property (4): BenchVia's report equals the pure Metric over the exact
// candidates the adapter produced; the adapter adds NOTHING the deterministic judge does not re-derive.
func TestJudgeDeterminismIntact(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		decl := genSpecDeclaration(t)
		spec := SpecFromDeclaration(rapid.StringMatching(`[a-z]{1,6}`).Draw(t, "id"), decl)

		fm := FixtureModel{}
		cands, err := fm.Propose(spec)
		if err != nil {
			t.Fatalf("fixtureModel.Propose errored: %v", err)
		}
		rep, _ := BenchVia(fm, spec)
		want := Metric(spec, cands)
		if !reflect.DeepEqual(rep, want) {
			t.Fatalf("judge not authoritative — BenchVia != Metric:\n got=%+v\n want=%+v", rep, want)
		}
		// And every present type in the report is one Extract genuinely surfaces from a candidate Text
		// (nothing the model "said" is trusted unre-judged).
		reExtract := map[RequirementKind]bool{}
		for _, c := range cands {
			for _, k := range Extract(c.Text) {
				reExtract[k] = true
			}
		}
		for _, p := range rep.PresentTypes {
			if !reExtract[p] {
				t.Fatalf("report claims present type %q that Extract does not re-surface (judge bypassed)", p)
			}
		}
	})
}
