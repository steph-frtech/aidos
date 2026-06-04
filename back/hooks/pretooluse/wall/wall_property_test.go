package wall_test

// Reproducibility / invariant mirror (rapid, N1) for the EXTRACTED, single-sourced
// waterline classifier (OQ-S52-wall, resolved at BA03).
// reflects=runtime.wall · test_kind=invariant · cert_language=rapid · liveness=live ·
// authority=below.
//
// The wall's invariant (CLAUDE.md §2): for ANY target, Classify(target) ⇒ Deny IFF
// the target resolves above the waterline; Allow otherwise; there is no third verdict;
// Deny ⇒ code AGENT_WRITE_ABOVE_WATERLINE with a non-empty how_to_fix. Determinism-first:
// Classify and IsAboveWaterline are pure total functions of the target — same input ⇒
// same verdict. This package is the ONE source; the hook re-exports it and its own
// regression mirrors (wall_bdd_test, wall_property_test in package main) pass unchanged.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/hooks/pretooluse/wall"
	"pgregory.net/rapid"
)

func TestProp_Classify_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		target := rapid.String().Draw(rt, "target")
		a := wall.Classify(target)
		b := wall.Classify(target)
		if a != b {
			rt.Fatalf("Classify not deterministic for %q", target)
		}
		if a.Verdict != wall.VerdictAllow && a.Verdict != wall.VerdictDeny {
			rt.Fatalf("third verdict %q for %q", a.Verdict, target)
		}
		// Classify and IsAboveWaterline agree (single predicate).
		if (a.Verdict == wall.VerdictDeny) != wall.IsAboveWaterline(target) {
			rt.Fatalf("Classify/IsAboveWaterline disagree for %q", target)
		}
		if a.Verdict == wall.VerdictDeny {
			if a.BlockReason == nil || a.BlockReason.Code != wall.CodeAgentWriteAboveWaterline {
				rt.Fatalf("deny without the canonical code for %q: %+v", target, a.BlockReason)
			}
			if len(a.BlockReason.HowToFix) == 0 {
				rt.Fatalf("deny with empty how_to_fix for %q", target)
			}
		}
		if a.Verdict == wall.VerdictAllow && a.BlockReason != nil {
			rt.Fatalf("allow carried a BlockReason for %q", target)
		}
	})
}

func TestProp_ForbiddenZones_StableAndAboveWaterline(t *testing.T) {
	z1 := wall.ForbiddenZones()
	z2 := wall.ForbiddenZones()
	if len(z1) == 0 {
		t.Fatal("ForbiddenZones must be non-empty (the wall always carries its zones)")
	}
	if len(z1) != len(z2) {
		t.Fatalf("ForbiddenZones must be stable: %v != %v", z1, z2)
	}
	for i := range z1 {
		if z1[i] != z2[i] {
			t.Fatalf("ForbiddenZones order must be stable: %v != %v", z1, z2)
		}
		if !wall.IsAboveWaterline(z1[i]) {
			t.Fatalf("every forbidden zone must resolve above the waterline: %q", z1[i])
		}
	}
	// A fresh copy each call (no caller can mutate the canonical set).
	z1[0] = "MUTATED"
	if wall.ForbiddenZones()[0] == "MUTATED" {
		t.Fatal("ForbiddenZones must return a fresh copy")
	}
}
