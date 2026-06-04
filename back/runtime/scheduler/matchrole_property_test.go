package scheduler_test

// Reproducibility mirror (∀) for the BA21 ROLE-MATCHING + STARVATION detector.
// reflects=runtime.scheduler.MatchRole · test_kind=property · cert_language=rapid ·
// liveness=live · authority=below. Matching is a RUNTIME algorithm below the waterline,
// never a layer/truth — and an ALGORITHM, never an LLM (determinism-first, §6/§8).
//
// The invariants:
//  1. MatchRole is DETERMINISTIC + TOTAL: same (item, layer, agents) ⇒ same (ref, ok);
//     never panics, even on an empty/unknown layer or empty agent set.
//  2. MIRROR-FIRST + WALL: a match is ONLY ever an agent whose declared Role equals the
//     layer's required role (RoleFor) — never a wrong-role fallback. An unknown layer
//     ⇒ ok=false (fail-closed).
//  3. TIE-BREAK is a total order: the lexicographically smallest free matching Ref wins,
//     so the choice is reproducible and never picks a busy agent.
//  4. ANTI-FAMINE (gap E3): DetectStarvation surfaces still_red iff the head cannot be
//     matched AND waited >= threshold; it is silent when the head CAN be matched (any
//     wait) or threshold<=0; the signal carries the head item + required role.
//  5. HeadOf is mirror-first: it returns the lowest-LayerRank item (ties by id), total.

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/scheduler"
	"pgregory.net/rapid"
)

var allLayers = []scheduler.Layer{
	scheduler.LayerMirror,
	scheduler.LayerProjection,
	scheduler.LayerOperationAction,
	scheduler.LayerButton,
	scheduler.Layer("garbage"), // an unknown layer must be handled, never panic
}

func drawLayer(rt *rapid.T) scheduler.Layer {
	return allLayers[rapid.IntRange(0, len(allLayers)-1).Draw(rt, "layer")]
}

func drawAgents(rt *rapid.T) []scheduler.Candidate {
	n := rapid.IntRange(0, 6).Draw(rt, "n")
	roles := []string{"bdd-writer", "executor", "reviewer", ""}
	out := make([]scheduler.Candidate, n)
	for i := 0; i < n; i++ {
		out[i] = scheduler.Candidate{
			Ref:  rapid.StringN(1, 10, 10).Draw(rt, "ref"),
			Role: roles[rapid.IntRange(0, len(roles)-1).Draw(rt, "role")],
			Free: rapid.Bool().Draw(rt, "free"),
		}
	}
	return out
}

// (1) deterministic + total; (2) mirror-first + wall (only the matching role, never a
// fallback); (3) tie-break is the lex-smallest free matching ref, never a busy agent.
func TestProp_MatchRole_DeterministicTotalRoleBound(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		item := drawOpenItem(rt)
		layer := drawLayer(rt)
		agents := drawAgents(rt)

		ref1, ok1 := scheduler.MatchRole(item, layer, agents)
		ref2, ok2 := scheduler.MatchRole(item, layer, agents)
		if ref1 != ref2 || ok1 != ok2 {
			rt.Fatalf("MatchRole must be deterministic: (%q,%v) != (%q,%v)", ref1, ok1, ref2, ok2)
		}

		role, known := scheduler.RoleFor(layer)
		if !known {
			if ok1 {
				rt.Fatalf("an unknown layer %q must NOT match (fail-closed)", layer)
			}
			return // nothing more to assert for an unknown layer
		}

		// Recompute the wall-respecting expectation: lex-smallest free agent of the role.
		want := ""
		wantOK := false
		for _, a := range agents {
			if a.Free && a.Role == role {
				if !wantOK || a.Ref < want {
					want = a.Ref
					wantOK = true
				}
			}
		}
		if ok1 != wantOK || ref1 != want {
			rt.Fatalf("MatchRole(layer %q, role %q) = (%q,%v); want (%q,%v)", layer, role, ref1, ok1, want, wantOK)
		}
		if ok1 {
			// The chosen ref must be a FREE agent of the matching role (the wall).
			matched := false
			for _, a := range agents {
				if a.Ref == ref1 && a.Free && a.Role == role {
					matched = true
				}
			}
			if !matched {
				rt.Fatalf("the chosen ref %q must be a free agent of role %q", ref1, role)
			}
		}
	})
}

// (4) DetectStarvation surfaces still_red iff head unmatched AND waited >= threshold;
// silent when matchable or threshold<=0; signal carries head + required role.
func TestProp_DetectStarvation_OnlyWhenUnstaffedAndOverThreshold(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		layer := drawLayer(rt)
		head := scheduler.QueueEntry{
			Item:  scheduler.WorkItem{ItemID: rapid.StringN(1, 8, 8).Draw(rt, "id"), Status: scheduler.StatusOpen},
			Layer: layer,
		}
		agents := drawAgents(rt)
		ticks := rapid.IntRange(0, 50).Draw(rt, "ticks")
		threshold := rapid.IntRange(-3, 20).Draw(rt, "threshold")

		sig, starving := scheduler.DetectStarvation(head, agents, ticks, threshold)

		_, matchable := scheduler.MatchRole(head.Item, head.Layer, agents)
		expect := threshold > 0 && !matchable && ticks >= threshold
		if starving != expect {
			rt.Fatalf("DetectStarvation = %v; want %v (matchable=%v ticks=%d threshold=%d)", starving, expect, matchable, ticks, threshold)
		}
		if starving {
			if sig.Class != scheduler.SignalStillRed {
				rt.Fatalf("a starvation signal must be still_red-class, got %q", sig.Class)
			}
			if sig.Item != head.Item.ItemID || sig.Layer != head.Layer || sig.TicksWaited != ticks {
				rt.Fatal("the signal must carry the starving head item, its layer and the wait count")
			}
			role, _ := scheduler.RoleFor(head.Layer)
			if sig.RequiredRole != role {
				rt.Fatalf("the signal must carry the required role %q, got %q", role, sig.RequiredRole)
			}
		}
	})
}

// (5) HeadOf is mirror-first + total: the returned head has the minimal LayerRank, and
// an empty queue yields ok=false; deterministic.
func TestProp_HeadOf_MirrorFirstTotal(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		n := rapid.IntRange(0, 8).Draw(rt, "n")
		queue := make([]scheduler.QueueEntry, n)
		for i := 0; i < n; i++ {
			queue[i] = scheduler.QueueEntry{
				Item:  scheduler.WorkItem{ItemID: rapid.StringN(1, 8, 8).Draw(rt, "id"), Status: scheduler.StatusOpen},
				Layer: drawLayer(rt),
			}
		}
		h1, ok1 := scheduler.HeadOf(queue)
		h2, ok2 := scheduler.HeadOf(queue)
		if !reflect.DeepEqual(h1, h2) || ok1 != ok2 {
			rt.Fatal("HeadOf must be deterministic")
		}
		if n == 0 {
			if ok1 {
				rt.Fatal("an empty queue has no head")
			}
			return
		}
		if !ok1 {
			rt.Fatal("a non-empty queue must have a head")
		}
		headRank := scheduler.LayerRank(h1.Layer)
		for _, e := range queue {
			if scheduler.LayerRank(e.Layer) < headRank {
				rt.Fatalf("HeadOf chose rank %d but a lower-rank item (%d) exists — not mirror-first", headRank, scheduler.LayerRank(e.Layer))
			}
		}
	})
}

// Determinism guardrail: the layer→role map and rank are DECLARED constants (above the
// line), so RoleFor/LayerRank never vary across calls. A fixed table check pins them.
func TestMatchRole_DeclaredRoleTable(t *testing.T) {
	cases := map[scheduler.Layer]struct {
		role  string
		known bool
		rank  int
	}{
		scheduler.LayerMirror:          {"bdd-writer", true, 0},
		scheduler.LayerProjection:      {"executor", true, 1},
		scheduler.LayerOperationAction: {"executor", true, 2},
		scheduler.LayerButton:          {"executor", true, 3},
		scheduler.Layer("garbage"):     {"", false, 4},
	}
	for l, want := range cases {
		got, known := scheduler.RoleFor(l)
		if got != want.role || known != want.known {
			t.Fatalf("RoleFor(%q) = (%q,%v); want (%q,%v)", l, got, known, want.role, want.known)
		}
		if r := scheduler.LayerRank(l); r != want.rank {
			t.Fatalf("LayerRank(%q) = %d; want %d", l, r, want.rank)
		}
	}
}
