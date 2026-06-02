package completeness

// Reproducibility + gate-invariant property mirror (rapid, N1) for S12.
// mirror record: reflects=S12-completeness-stop-gate, test_kind=property,
//                cert_language=rapid, liveness=alive, authority=below.
//
// Pins the load-bearing invariants of the Stop gate (KRD §29, CLAUDE.md §8):
//   - block IFF |monsters| > 0, else pass — there is NO third verdict;
//   - block ⇒ code ∈ {MONSTER, INCOMPLETE} and the recorded monster set is EXACTLY
//     the input set (no silent drop — KRD §82 .passthrough());
//   - the cut hash is deterministic and order-independent (same cut ⇒ same hash).

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
	"pgregory.net/rapid"
)

func genMonster(t *rapid.T) records.Monster {
	reason := rapid.SampledFrom([]records.MonsterReason{
		records.ReasonNoTruthWithoutMirror,
		records.ReasonNoOrphanMirror,
	}).Draw(t, "reason")
	return records.Monster{
		Reason:   reason,
		LayerID:  rapid.SampledFrom([]string{"a", "b", "c"}).Draw(t, "layer"),
		Version:  rapid.SampledFrom([]string{"v1", "v2"}).Draw(t, "version"),
		Kind:     rapid.SampledFrom([]string{"control", "view", "entity"}).Draw(t, "kind"),
		MirrorID: rapid.SampledFrom([]string{"m1", "m2"}).Draw(t, "mirror"),
	}
}

// TestGateBlockIffMonsters: the central invariant — block iff the monster set is
// non-empty; pass otherwise. No third verdict.
func TestGateBlockIffMonsters(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		monsters := rapid.SliceOfN(rapid.Custom(genMonster), 0, 6).Draw(t, "monsters")
		d := Gate(monsters, Cut{})
		switch {
		case len(monsters) > 0:
			if d.Verdict != VerdictBlock {
				t.Fatalf("non-empty monster set must block, got %s", d.Verdict)
			}
			if d.BlockReason == nil {
				t.Fatal("block must carry a BlockReason")
			}
			if d.BlockReason.Code != CodeMonster && d.BlockReason.Code != CodeIncomplete {
				t.Fatalf("block code must be MONSTER|INCOMPLETE, got %s", d.BlockReason.Code)
			}
			if len(d.BlockReason.HowToFix) == 0 {
				t.Fatal("block must carry a non-empty how_to_fix")
			}
		default:
			if d.Verdict != VerdictPass {
				t.Fatalf("empty monster set must pass, got %s", d.Verdict)
			}
			if d.BlockReason != nil {
				t.Fatalf("pass must not carry a BlockReason, got %+v", d.BlockReason)
			}
		}
		if d.Verdict != VerdictBlock && d.Verdict != VerdictPass {
			t.Fatalf("there is no third verdict, got %q", d.Verdict)
		}
	})
}

// TestGateRecordsExactSet: on block, the recorded monster set is EXACTLY the input
// — no silent drop (KRD §82 .passthrough()).
func TestGateRecordsExactSet(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		monsters := rapid.SliceOfN(rapid.Custom(genMonster), 1, 6).Draw(t, "monsters")
		d := Gate(monsters, Cut{})
		if !reflect.DeepEqual(d.Monsters, monsters) {
			t.Fatalf("gate dropped/added monsters: in=%+v out=%+v", monsters, d.Monsters)
		}
	})
}

// TestGateErroredAlwaysBlocks: an errored completeness check ALWAYS blocks with
// code INCOMPLETE — a failure made explicit, never a silent pass.
func TestGateErroredAlwaysBlocks(t *testing.T) {
	d := GateErrored(Cut{}, errSentinel{})
	if d.Verdict != VerdictBlock {
		t.Fatalf("errored check must block, got %s", d.Verdict)
	}
	if d.BlockReason == nil || d.BlockReason.Code != CodeIncomplete {
		t.Fatalf("errored check must carry INCOMPLETE, got %+v", d.BlockReason)
	}
}

type errSentinel struct{}

func (errSentinel) Error() string { return "boom" }

// TestCutHashDeterministicAndOrderIndependent: same cut ⇒ same hash, regardless of
// input slice order (determinism-first).
func TestCutHashDeterministicAndOrderIndependent(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		layers := rapid.SliceOfN(rapid.Custom(genLayerC), 0, 4).Draw(t, "layers")
		mirrors := rapid.SliceOfN(rapid.Custom(genMirrorC), 0, 4).Draw(t, "mirrors")
		a := Cut{Layers: layers, Mirrors: mirrors}.Hash()
		// Reverse both slices: the hash must not change.
		rl := reverseLayers(layers)
		rm := reverseMirrors(mirrors)
		b := Cut{Layers: rl, Mirrors: rm}.Hash()
		if a != b {
			t.Fatalf("cut hash is order-dependent: %s != %s", a, b)
		}
	})
}

func genLayerC(t *rapid.T) records.Layer {
	return records.Layer{
		LayerID: rapid.SampledFrom([]string{"a", "b", "c"}).Draw(t, "lid"),
		Version: rapid.SampledFrom([]string{"v1", "v2"}).Draw(t, "lv"),
		Kind:    rapid.SampledFrom([]string{"control", "view"}).Draw(t, "lk"),
	}
}

func genMirrorC(t *rapid.T) records.Mirror {
	return records.Mirror{
		MirrorID:     rapid.SampledFrom([]string{"m1", "m2", "m3"}).Draw(t, "mid"),
		Reflects:     records.LayerRef{LayerID: rapid.SampledFrom([]string{"a", "b"}).Draw(t, "rl"), Version: "v1"},
		TestKind:     records.TestKindFixture,
		CertLanguage: records.CertFixture,
		Liveness:     records.LivenessAlive,
	}
}

func reverseLayers(in []records.Layer) []records.Layer {
	out := make([]records.Layer, len(in))
	for i, v := range in {
		out[len(in)-1-i] = v
	}
	return out
}

func reverseMirrors(in []records.Mirror) []records.Mirror {
	out := make([]records.Mirror, len(in))
	for i, v := range in {
		out[len(in)-1-i] = v
	}
	return out
}
