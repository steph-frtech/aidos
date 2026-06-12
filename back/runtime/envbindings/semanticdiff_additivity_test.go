package envbindings_test

// SemanticDiff additivity proof (Amendement A6, ADR 0065): widening the closed
// environment set {prod,staging,dev} → +{local,future_cloud} classifies as
// REFINE (a strict, consistent superset — KRD §11), NEVER override — no
// existing scoped truth is invalidated. The classifier is S21
// (back/runtime/semanticdiff), REUSED verbatim, never forked.
//
// reflects=runtime.envbindings/environment-set-widening, test_kind=property,
// cert_language=rapid, liveness=live.

import (
	"encoding/json"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/runtime/semanticdiff"
	"pgregory.net/rapid"
)

// environmentSetBody renders the closed environment set as a flat truth body —
// one field per member — so the §44.1 classifier reads the widening's NATURE:
// new fields added, every old field intact ⇒ refine.
func environmentSetBody(envs []scope.Environment) json.RawMessage {
	m := map[string]any{"kind": "truth", "truth": "scope.Environment closed set"}
	for _, e := range envs {
		m["env_"+string(e)] = true
	}
	b, _ := json.Marshal(m)
	return b
}

// TestEnvironmentWideningIsRefine — the A6 proof: the DP06 widening classifies
// as refine (additive), and the widened set still carries the legacy trio.
func TestEnvironmentWideningIsRefine(t *testing.T) {
	legacy := []scope.Environment{scope.EnvProd, scope.EnvStaging, scope.EnvDev}
	widened := scope.Environments()

	old := semanticdiff.Artifact{Version: "v-s15", Body: environmentSetBody(legacy)}
	new := semanticdiff.Artifact{Version: "v-dp06", Body: environmentSetBody(widened)}

	diff := semanticdiff.Classify(old, new)
	if diff.ChangeType != semanticdiff.ChangeRefine {
		t.Fatalf("the environment-set widening must classify as refine (additive, KRD §11), got %q (open question: %s)",
			diff.ChangeType, diff.OpenQuestion)
	}

	// The legacy trio is a PREFIX of the widened canonical order — existing
	// scoped truths keep their meaning and their position.
	if len(widened) < len(legacy) {
		t.Fatalf("the widened set lost members: %v", widened)
	}
	for i, e := range legacy {
		if widened[i] != e {
			t.Fatalf("canonical order must preserve the S15 prefix: widened[%d] = %q, want %q", i, widened[i], e)
		}
	}
}

// TestWideningNeverOverride — ∀ subset growth of the closed set: adding
// members while keeping every existing one classifies refine, never override
// (the property form of the additivity proof).
func TestWideningNeverOverride(t *testing.T) {
	all := scope.Environments()
	rapid.Check(t, func(rt *rapid.T) {
		// draw a non-empty strict prefix, then the full set: a pure widening.
		cut := rapid.IntRange(1, len(all)-1).Draw(rt, "cut")
		old := semanticdiff.Artifact{Version: "v-old", Body: environmentSetBody(all[:cut])}
		new := semanticdiff.Artifact{Version: "v-new", Body: environmentSetBody(all)}
		diff := semanticdiff.Classify(old, new)
		if diff.ChangeType == semanticdiff.ChangeOverride {
			rt.Fatalf("a pure widening must NEVER classify override (cut %d)", cut)
		}
		if diff.ChangeType != semanticdiff.ChangeRefine {
			rt.Fatalf("a pure widening must classify refine, got %q (cut %d)", diff.ChangeType, cut)
		}
	})
}
