// S107 REPRODUCIBILITY MIRROR (rapid) — the deterministic-able capabilities the `/learn`
// loop adds are PURE functions (CLAUDE.md §6/§8 determinism-first; ROADMAP §S107 "la
// détection de divergence est une comparaison déterministe … le monde enseigne, jamais
// l'agent lui-même"):
//
//   - BUMP: BumpHash is a content-address delta — same target + same mirror ⇒ byte-identical
//     (before, after) pair, and Moved is a pure function of whether the body changed.
//   - WAVE: TargetedWave is a deterministic redwave.Impact closure — same bump + edges +
//     heads ⇒ byte-identical ordered wave.
//   - THE WALL ALWAYS HOLDS: WallVerdict is non-nil (REALITY_CANNOT_DECLARE_TRUTH) for EVERY
//     drawn incident — reality never declares truth.
//   - NOTHING LEARNS ITS OWN FITNESS: the loop's Outcome carries WroteKernel==false for every
//     input, and the package never names the `fitness` schema (the anti-circularity guarantee).
package learn_test

import (
	"encoding/json"
	"fmt"
	"reflect"
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/learn"
	"github.com/steph-frtech/aidos/back/runtime/reality"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
)

// genTargetAndMirror draws a valid (target, approved-mirror) pair: the mirror reflects the
// target's ref, the body is a small JSON object, the kind is one of the closed set.
func genTargetAndMirror(t *rapid.T) (learn.Target, learn.ApprovedMirror) {
	kind := learn.TargetOperation
	if rapid.Bool().Draw(t, "policy") {
		kind = learn.TargetPolicy
	}
	id := "tgt-" + rapid.StringMatching(`[a-z]{1,6}`).Draw(t, "id")
	ver := "v" + fmt.Sprint(rapid.IntRange(1, 9).Draw(t, "ver"))
	name := rapid.StringMatching(`[a-z]{1,8}`).Draw(t, "name")
	body, _ := json.Marshal(map[string]any{"kind": string(kind), "name": name})
	target := learn.Target{Kind: kind, ID: id, Version: ver, SpecBody: body}
	mir := learn.ApprovedMirror{
		MirrorID: "mir-" + rapid.StringMatching(`[a-z]{1,6}`).Draw(t, "mid"),
		Reflects: target.Ref(),
	}
	return target, mir
}

// genIncident draws an arbitrary incident (the wall must refuse it whatever it is).
func genIncident(t *rapid.T) reality.Incident {
	inc, err := reality.Observe(reality.ObserveInput{
		Ref: "#" + fmt.Sprint(rapid.IntRange(1, 99999).Draw(t, "ref")),
		Signal: reality.Signal{
			Operation:  rapid.StringMatching(`[a-z]{1,8}`).Draw(t, "op"),
			Error:      rapid.StringMatching(`[a-z ]{1,20}`).Draw(t, "err"),
			Recurrence: rapid.IntRange(1, 1000).Draw(t, "rec"),
		},
		CauseSketch: rapid.StringMatching(`[a-z ]{1,30}`).Draw(t, "cause"),
		Taint:       []firewall.Taint{firewall.TaintIncidentDerived},
	})
	if err != nil {
		t.Fatalf("Observe: %v", err)
	}
	return inc
}

// Property 1 — BUMP is deterministic: same target + mirror ⇒ identical Bump.
func TestProperty_Bump_IsDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		target, mir := genTargetAndMirror(t)
		a, err1 := learn.BumpHash(target, mir)
		b, err2 := learn.BumpHash(target, mir)
		if (err1 == nil) != (err2 == nil) {
			t.Fatalf("nondeterministic error: %v vs %v", err1, err2)
		}
		if err1 != nil {
			return
		}
		if a != b {
			t.Fatalf("BumpHash not deterministic: %+v vs %+v", a, b)
		}
		// A fresh reflection on a body that did not carry it MUST move the address.
		if !a.Moved {
			t.Fatalf("a fresh reflection must move the address: %+v", a)
		}
	})
}

// Property 2 — WAVE (rédaction du worklist) is deterministic: same bump+edges+heads ⇒ same wave.
func TestProperty_Wave_IsDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		target, mir := genTargetAndMirror(t)
		bump, err := learn.BumpHash(target, mir)
		if err != nil {
			return
		}
		edges := []redwave.Edge{{
			Link: links.Link{
				Kind: links.KindMirrors,
				From: links.Ref{ID: mir.MirrorID, Version: "v1"},
				To:   target.Ref(),
			},
			LoadBearing: true,
			Layer:       redwave.LayerMirror,
		}}
		// heads advance the target so its mirror edge resolves stale.
		heads := links.Heads{target.ID: target.Version + "x"}
		w1 := learn.TargetedWave(bump, edges, heads)
		w2 := learn.TargetedWave(bump, edges, heads)
		if !reflect.DeepEqual(w1, w2) {
			t.Fatalf("TargetedWave not deterministic: %+v vs %+v", w1, w2)
		}
	})
}

// Property 3 — THE WALL ALWAYS HOLDS: for EVERY incident, WallVerdict refuses (non-nil,
// REALITY_CANNOT_DECLARE_TRUTH) — reality never declares truth.
func TestProperty_Wall_AlwaysHolds(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		inc := genIncident(t)
		br := learn.WallVerdict(inc)
		if br == nil {
			t.Fatal("WallVerdict returned nil — reality declared truth")
		}
		if br.Code != blockreason.CodeRealityCannotDeclareTruth {
			t.Fatalf("wall code: got %q", br.Code)
		}
	})
}

// Property 4 — NOTHING LEARNS ITS OWN FITNESS: the full loop's Outcome always carries
// WroteKernel==false, regardless of input.
func TestProperty_Close_NeverWritesKernel(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		inc := genIncident(t)
		target, mir := genTargetAndMirror(t)
		out, err := learn.Close(inc, mir, target, nil, links.Heads{})
		if err != nil {
			return
		}
		if out.WroteKernel || out.Candidate.WroteKernel {
			t.Fatal("the /learn loop must NEVER write the kernel (anti-circularity)")
		}
		if out.Wall.Code != blockreason.CodeRealityCannotDeclareTruth {
			t.Fatalf("the wall must hold in the outcome: %q", out.Wall.Code)
		}
	})
}
