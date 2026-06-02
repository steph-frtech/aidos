package records

// Reproducibility property mirror (rapid, N1): the completeness law is a pure,
// total, deterministic function — same input → same output (CLAUDE.md §6
// determinism-first; every deterministic-able op carries a reproducibility
// mirror). It also pins the load-bearing invariants of the law itself.

import (
	"reflect"
	"testing"

	"pgregory.net/rapid"
)

// genLayer draws an arbitrary kernel layer with a kind from the recorded profile
// plus a few unprofiled kinds (so both branches of NoTruthWithoutMirror run).
func genLayer(t *rapid.T) Layer {
	kinds := []string{"control", "view", "entity", "policy", "operation", "action", "api", "db", "types", "ui-web", "product", "journey"}
	return Layer{
		LayerID: rapid.SampledFrom([]string{"a", "b", "c", "checkout-button"}).Draw(t, "layer_id"),
		Version: rapid.SampledFrom([]string{"v1", "v2"}).Draw(t, "version"),
		Kind:    rapid.SampledFrom(kinds).Draw(t, "kind"),
	}
}

func genMirror(t *rapid.T) Mirror {
	certs := []CertLanguage{CertGherkin, CertFixture, CertRapid, CertZod, CertProse, CertUnit}
	tks := []TestKind{TestKindFixture, TestKindE2E, TestKindSchema, TestKindProperty, TestKindUnit, TestKindContract, TestKindSnapshot}
	return Mirror{
		MirrorID:     rapid.SampledFrom([]string{"m1", "m2", "m3", "m4"}).Draw(t, "mirror_id"),
		Reflects:     LayerRef{LayerID: rapid.SampledFrom([]string{"a", "b", "c", "checkout-button", "ghost"}).Draw(t, "rl"), Version: rapid.SampledFrom([]string{"v1", "v2", "v0"}).Draw(t, "rv")},
		TestKind:     rapid.SampledFrom(tks).Draw(t, "test_kind"),
		CertLanguage: rapid.SampledFrom(certs).Draw(t, "cert"),
		Authority:    rapid.SampledFrom([]Authority{AuthorityAbove, AuthorityBelow}).Draw(t, "auth"),
		Liveness:     rapid.SampledFrom([]Liveness{LivenessAlive, LivenessDead}).Draw(t, "live"),
	}
}

// TestReproducible: ComputeCompleteness is deterministic — same input → same
// output, byte-for-byte in the monster set order.
func TestReproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		layers := rapid.SliceOfN(rapid.Custom(genLayer), 0, 5).Draw(t, "layers")
		mirrors := rapid.SliceOfN(rapid.Custom(genMirror), 0, 6).Draw(t, "mirrors")
		a := ComputeCompleteness(mirrors, layers)
		b := ComputeCompleteness(mirrors, layers)
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("non-deterministic: %+v != %+v", a, b)
		}
	})
}

// TestVerdictMatchesMonsterSet: the verdict is COMPLETE iff the monster set is
// empty — the verdict can never disagree with the set (anti-Goodhart: the verdict
// is computed FROM the set, never declared independently).
func TestVerdictMatchesMonsterSet(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		layers := rapid.SliceOfN(rapid.Custom(genLayer), 0, 5).Draw(t, "layers")
		mirrors := rapid.SliceOfN(rapid.Custom(genMirror), 0, 6).Draw(t, "mirrors")
		r := ComputeCompleteness(mirrors, layers)
		empty := len(r.Monsters) == 0
		if empty && r.Verdict != VerdictComplete {
			t.Fatalf("empty monster set must be COMPLETE, got %s", r.Verdict)
		}
		if !empty && r.Verdict != VerdictRedMonster {
			t.Fatalf("non-empty monster set must be RED_MONSTER, got %s", r.Verdict)
		}
	})
}

// TestNonExecutableNeverCounts: a mirror with a non-executable cert_language
// NEVER satisfies completeness — KRD §805. For any layer whose only mirrors are
// prose, the layer is a no_truth_without_mirror monster.
func TestNonExecutableNeverCounts(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		layer := Layer{LayerID: "x", Version: "v1", Kind: rapid.SampledFrom([]string{"control", "view", "entity"}).Draw(t, "kind")}
		// One prose mirror correctly reflecting the layer with the right test_kind.
		req := RequiredTestKinds(layer.Kind)
		tk := req[0]
		mirrors := []Mirror{{
			MirrorID:     "prose",
			Reflects:     layer.Ref(),
			TestKind:     tk,
			CertLanguage: CertProse,
			Authority:    AuthorityAbove,
			Liveness:     LivenessAlive,
		}}
		r := ComputeCompleteness(mirrors, []Layer{layer})
		if r.Verdict != VerdictRedMonster {
			t.Fatalf("prose-only layer must be RED_MONSTER, got %s", r.Verdict)
		}
	})
}

// TestOrphanAlwaysMonster: a mirror reflecting a (layer,version) absent from the
// kernel cut is ALWAYS a no_orphan_mirror monster, regardless of its fields.
func TestOrphanAlwaysMonster(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genMirror(t)
		// Empty kernel: nothing exists → every mirror is an orphan.
		r := ComputeCompleteness([]Mirror{m}, nil)
		found := false
		for _, mon := range r.Monsters {
			if mon.Reason == ReasonNoOrphanMirror && mon.MirrorID == m.MirrorID {
				found = true
			}
		}
		if !found {
			t.Fatalf("mirror %s over empty kernel must be an orphan monster; got %+v", m.MirrorID, r.Monsters)
		}
	})
}
