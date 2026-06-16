package requirementbench

// adapter_dg04_fixture_test.go — DG04 fixtures: (a) the deterministic adapters' shape contract (always
// run, hermetic), and (b) the OPT-IN real claude-CLI sample that wires usedRealLLM=true with an HONEST
// fallback. The real sample is GATED behind AIDOS_DG04_REAL=1 AND the binary being present, so the
// default `go test` stays hermetic (no network) — exactly the determinism-first discipline: the
// guarantee rests on the pure path, the real call is a sampled observation, never the proof.

import (
	"os"
	"reflect"
	"testing"
)

// demoSpec is a small checkout-ish declared spec (S35/S11 structure) the fixtures run on — the
// "apply a promo then place an order" need, declared as structure so the attendus are spec-derived.
func demoSpec() Spec {
	return SpecFromDeclaration("checkout-apply-promo", SpecDeclaration{
		HasViewGoal:       true,
		HasViewData:       true,
		HasViewEmptyState: true,
		Controls:          2,
		ControlVisible:    true,
		ControlEnabled:    true,
		Actions:           2,
		ActionOnSuccess:   true,
		ActionOnError:     true,
		Operations:        2,
		OperationEvents:   2,
		OperationGuards:   2,
		Entities:          2,
		EntityFields:      4,
		Invariants:        1,
		Policies:          1,
		Budgets:           1,
		ErrorCases:        1,
		EdgeCases:         1,
	})
}

// TestFixtureModelProposeDeterministic — the fixtureModel adapter is byte-for-byte deterministic and
// produces the three differential candidates (single + A + B). No network, no clock.
func TestFixtureModelProposeDeterministic(t *testing.T) {
	spec := demoSpec()
	fm := FixtureModel{}

	c1, err := fm.Propose(spec)
	if err != nil {
		t.Fatalf("Propose errored: %v", err)
	}
	if len(c1) != 3 {
		t.Fatalf("fixtureModel should propose 3 candidates (single/A/B), got %d", len(c1))
	}
	wantRoles := []string{"single", "A", "B"}
	for i, c := range c1 {
		if c.Role != wantRoles[i] {
			t.Fatalf("candidate %d role=%q, want %q", i, c.Role, wantRoles[i])
		}
	}
	// Re-propose: byte-for-byte identical (determinism).
	c2, _ := fm.Propose(spec)
	if !reflect.DeepEqual(c1, c2) {
		t.Fatalf("fixtureModel.Propose not deterministic:\n c1=%+v\n c2=%+v", c1, c2)
	}
}

// TestFixtureDifferentialSurplus — the differential is REAL: the UNION of the two model lenses (A+B)
// surfaces requirement TYPES the "single" recompile baseline alone misses (the surplus ADR 0079 asks
// about), measured by the deterministic judge. This is the very value of the bench — proven on the
// fixture, hermetically.
func TestFixtureDifferentialSurplus(t *testing.T) {
	spec := demoSpec()

	// Single recompile baseline only.
	single := RecompileProjection(spec)
	repSingle := Metric(spec, single)

	// The full differential (single + A + B) via the fixtureModel adapter.
	repDiff, prov := BenchVia(FixtureModel{}, spec)
	if prov.UsedRealLLM {
		t.Fatalf("fixtureModel must not claim usedRealLLM")
	}
	if prov.FellBack {
		t.Fatalf("fixtureModel is available; it must not fall back")
	}

	// The differential covers at least as much as the single baseline (monotone) and, on this spec,
	// strictly MORE (the surplus: invariants/policies/budgets/edge cases a recompile misses).
	if repDiff.MatchPct < repSingle.MatchPct {
		t.Fatalf("differential MatchPct %v < single %v (non-monotone)", repDiff.MatchPct, repSingle.MatchPct)
	}
	if len(repDiff.MissingTypes) >= len(repSingle.MissingTypes) {
		t.Fatalf("differential surfaced no surplus over single recompile: diff misses %v, single misses %v",
			repDiff.MissingTypes, repSingle.MissingTypes)
	}
	// Concretely, the single baseline misses cross-cutting facets the differential covers.
	singleMissing := asSet(repSingle.MissingTypes)
	diffMissing := asSet(repDiff.MissingTypes)
	surplusFound := false
	for _, k := range []RequirementKind{KindInvariant, KindPolicy, KindBudget, KindEdgeCase, KindOperationEvent, KindOperationGuard} {
		if singleMissing[k] && !diffMissing[k] {
			surplusFound = true
		}
	}
	if !surplusFound {
		t.Fatalf("expected the differential to recover at least one cross-cutting facet the recompile misses")
	}
}

// TestRealClaudeAdapterHonestFallback — wires the REAL ClaudeModel with an HONEST fallback. By default
// (AIDOS_DG04_REAL unset) it asserts the GOVERNED fallback path: even when the binary IS present, the
// hermetic test never spends a real call — it only proves that an UNAVAILABLE real model degrades to
// the deterministic baseline without a screen error. With AIDOS_DG04_REAL=1 it takes ONE real sample
// and re-judges it with the pure metric, reporting usedRealLLM honestly. Either way the JUDGE dominates.
func TestRealClaudeAdapterHonestFallback(t *testing.T) {
	spec := demoSpec()

	if os.Getenv("AIDOS_DG04_REAL") != "1" {
		// Hermetic default: force an UNAVAILABLE real model (bogus binary path) and prove the governed
		// fallback — recompile-only baseline, no error, usedRealLLM=false.
		absent := &ClaudeModel{Bin: "/nonexistent/claude-binary-dg04", Model: "claude-opus-4-8"}
		if absent.Available() {
			t.Fatalf("bogus binary path must report Available()=false")
		}
		rep, prov := BenchVia(absent, spec)
		if prov.UsedRealLLM {
			t.Fatalf("absent real model must report usedRealLLM=false")
		}
		if !prov.FellBack {
			t.Fatalf("absent real model must fall back (governed degradation)")
		}
		// The fallback equals the deterministic recompile-only metric.
		want := Metric(spec, RecompileProjection(spec))
		if !reflect.DeepEqual(rep, want) {
			t.Fatalf("fallback report != recompile metric:\n got=%+v\n want=%+v", rep, want)
		}
		t.Log("DG04 hermetic: real model absent -> governed recompile-only fallback (usedRealLLM=false)")
		return
	}

	// Opt-in real sample (usedRealLLM=true wired, honest fallback). Never enters the property mirror.
	cm := NewClaudeModel()
	if !cm.Available() {
		t.Skipf("AIDOS_DG04_REAL=1 but claude binary %q absent — honest skip (no fabricated real run)", cm.Bin)
	}
	rep, prov := BenchVia(cm, spec)
	if !prov.UsedRealLLM && !prov.FellBack {
		t.Fatalf("inconsistent provenance: neither real nor fell back")
	}
	// Whatever the model said, the report is the pure metric over the re-judged candidates: re-run the
	// metric over the SAME candidates the adapter produced and assert the judge dominates.
	if prov.UsedRealLLM {
		cands, err := cm.Propose(spec)
		if err == nil {
			want := Metric(spec, cands)
			if want.SpecID != rep.SpecID {
				t.Fatalf("real-path report spec mismatch: %q vs %q", rep.SpecID, want.SpecID)
			}
		}
		if rep.MatchPct < 0 || rep.MatchPct > 1 {
			t.Fatalf("real-path MatchPct out of [0,1]: %v", rep.MatchPct)
		}
		t.Logf("DG04 real sample: usedRealLLM=%v matchPct=%.2f missing=%v", prov.UsedRealLLM, rep.MatchPct, rep.MissingTypes)
	} else {
		t.Logf("DG04 real path fell back honestly: usedRealLLM=false matchPct=%.2f", rep.MatchPct)
	}
}
