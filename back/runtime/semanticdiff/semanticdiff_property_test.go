package semanticdiff_test

// Property mirror (∀) for the SemanticDiff classifier. reflects=runtime.semanticdiff.Classify,
// test_kind=property, cert_language=rapid, liveness=live, authority=below (the COMPUTATIONAL
// invariants — determinism, totality, no-panic, no-write — pinned over the human rule of §44.1).
// Run via `go test` (rapid is the frozen invariant slot, ADR 0003).
//
// The invariants (KRD §44.1 + CLAUDE.md §6/§8 determinism-first):
//
//  1. DETERMINISM. ∀ (old,new): Classify is deterministic — same (old,new) ⇒ same change_type.
//  2. TOTALITY. ∀ (old,new): change_type ∈ {add,refine,override,rescope,reweight,deprecate} ∨
//     {none, unclassifiable} — never an undeclared value.
//  3. IDENTITY. ∀ old: Classify(old, old) ⇒ none (never a spurious type).
//  4. SCOPE-ONLY ⇒ RESCOPE. ∀ old,new differing ONLY in scope (body equal) ⇒ rescope (never override).
//  5. WEIGHT-ONLY ⇒ REWEIGHT. ∀ old,new (composes) differing ONLY in weight ⇒ reweight (never override).
//  6. ENABLED_WHEN CHANGE ⇒ OVERRIDE. ∀ control old,new differing ONLY in enabled_when (not equal) ⇒ override.
//  7. NO PANIC. ∀ arbitrary bytes: Classify never panics — a malformed/partial pair yields a verdict.
//  8. NO WRITE / PURITY. Classify returns a value; it touches no DB/clock/rng (pure by construction —
//     no such dependency is importable here; this property pins the determinism that proves it).

import (
	"encoding/json"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/semanticdiff"
	"pgregory.net/rapid"
)

// validVerdict reports whether c is a declared change_type: one of the six landed §44.1 types,
// or the special none / unclassifiable verdicts. Nothing else may ever be returned (totality).
func validVerdict(c semanticdiff.ChangeType) bool {
	if c == semanticdiff.ChangeNone || c == semanticdiff.ChangeUnclassifiable {
		return true
	}
	return semanticdiff.IsLanded(c)
}

// drawArtifact draws an Artifact: sometimes absent, otherwise a small random JSON object body.
func drawArtifact(rt *rapid.T, label string) semanticdiff.Artifact {
	if rapid.IntRange(0, 4).Draw(rt, label+"_absent") == 0 {
		return semanticdiff.Artifact{Version: rapid.StringN(0, 8, 8).Draw(rt, label+"_v")}
	}
	n := rapid.IntRange(0, 4).Draw(rt, label+"_nfields")
	m := map[string]any{"kind": rapid.SampledFrom([]string{"truth", "control", "policy", "link"}).Draw(rt, label+"_kind")}
	for i := 0; i < n; i++ {
		k := rapid.SampledFrom([]string{"name", "scope", "weight", "enabled_when", "allow", "foo", "deny_after"}).Draw(rt, label+"_k")
		m[k] = rapid.SampledFrom([]any{"alpha", "beta", "cosmetic", "load-bearing", true, float64(1)}).Draw(rt, label+"_val")
	}
	b, err := json.Marshal(m)
	if err != nil {
		panic(err)
	}
	return semanticdiff.Artifact{Version: rapid.StringN(0, 8, 8).Draw(rt, label+"_v"), Body: b}
}

// 1+2 — determinism and totality on arbitrary artifacts.
func TestProp_DeterministicAndTotal(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		old := drawArtifact(rt, "old")
		new := drawArtifact(rt, "new")
		a := semanticdiff.Classify(old, new)
		b := semanticdiff.Classify(old, new)
		if a != b {
			t.Fatalf("determinism: Classify(%v,%v) returned %v then %v", old, new, a, b)
		}
		if !validVerdict(a.ChangeType) {
			t.Fatalf("totality: change_type %q is not a declared verdict", a.ChangeType)
		}
		// An unclassifiable verdict MUST carry an OpenQuestion (never silent).
		if a.ChangeType == semanticdiff.ChangeUnclassifiable && a.OpenQuestion == "" {
			t.Fatalf("unclassifiable without an OpenQuestion — a silent monster")
		}
	})
}

// 3 — identity ⇒ none.
func TestProp_Identity_None(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		a := drawArtifact(rt, "a")
		if a.IsAbsent() {
			return // identity of "both absent" is the unclassifiable case, covered elsewhere
		}
		got := semanticdiff.Classify(a, a)
		if got.ChangeType != semanticdiff.ChangeNone {
			t.Fatalf("identity: Classify(a,a) = %q, want none", got.ChangeType)
		}
	})
}

// 4 — a scope-only delta ⇒ rescope (never override).
func TestProp_ScopeOnly_Rescope(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		base := map[string]any{
			"kind": "truth",
			"name": rapid.StringN(1, 6, 6).Draw(rt, "name"),
		}
		oldBody := cloneWith(base, "scope", map[string]any{"cells": []any{"EU"}})
		newBody := cloneWith(base, "scope", map[string]any{"cells": []any{"EU", "US"}})
		got := semanticdiff.Classify(jsonArt("v1", oldBody), jsonArt("v2", newBody))
		if got.ChangeType != semanticdiff.ChangeRescope {
			t.Fatalf("scope-only: change_type = %q, want rescope", got.ChangeType)
		}
	})
}

// 5 — a weight-only delta (composes) ⇒ reweight (never override).
func TestProp_WeightOnly_Reweight(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		base := map[string]any{
			"kind":      "link",
			"link_kind": "composes",
			"parent":    map[string]any{"id": "p", "version": "v1"},
			"child":     map[string]any{"id": rapid.StringN(1, 6, 6).Draw(rt, "child"), "version": "v1"},
		}
		oldBody := cloneWith(base, "weight", "cosmetic")
		newBody := cloneWith(base, "weight", "load-bearing")
		got := semanticdiff.Classify(jsonArt("v1", oldBody), jsonArt("v2", newBody))
		if got.ChangeType != semanticdiff.ChangeReweight {
			t.Fatalf("weight-only: change_type = %q, want reweight", got.ChangeType)
		}
	})
}

// 6 — a control's enabled_when changed (not equal) ⇒ override.
func TestProp_EnabledWhenChange_Override(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		oldCond := rapid.StringN(1, 8, 8).Draw(rt, "old")
		newCond := rapid.StringN(1, 8, 8).Draw(rt, "new")
		if oldCond == newCond {
			return // equal enabled_when is not a change
		}
		base := map[string]any{"kind": "control", "name": "checkout-button"}
		got := semanticdiff.Classify(
			jsonArt("v1", cloneWith(base, "enabled_when", oldCond)),
			jsonArt("v2", cloneWith(base, "enabled_when", newCond)),
		)
		if got.ChangeType != semanticdiff.ChangeOverride {
			t.Fatalf("enabled_when change: change_type = %q, want override", got.ChangeType)
		}
	})
}

// 7 — no panic on arbitrary bytes (malformed/partial pairs included).
func TestProp_NeverPanics(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		ob := rapid.SliceOf(rapid.Byte()).Draw(rt, "oldBytes")
		nb := rapid.SliceOf(rapid.Byte()).Draw(rt, "newBytes")
		defer func() {
			if r := recover(); r != nil {
				t.Fatalf("Classify panicked on arbitrary bytes: %v", r)
			}
		}()
		got := semanticdiff.Classify(
			semanticdiff.Artifact{Version: "vo", Body: ob},
			semanticdiff.Artifact{Version: "vn", Body: nb},
		)
		if !validVerdict(got.ChangeType) {
			t.Fatalf("arbitrary bytes yielded undeclared verdict %q", got.ChangeType)
		}
	})
}

// cloneWith returns a shallow copy of base with key=val set.
func cloneWith(base map[string]any, key string, val any) map[string]any {
	out := make(map[string]any, len(base)+1)
	for k, v := range base {
		out[k] = v
	}
	out[key] = val
	return out
}

// jsonArt builds an Artifact from a Go body.
func jsonArt(version string, body any) semanticdiff.Artifact {
	b, err := json.Marshal(body)
	if err != nil {
		panic(err)
	}
	return semanticdiff.Artifact{Version: version, Body: b}
}
