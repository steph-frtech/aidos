package main

import (
	"strings"
	"testing"

	"pgregory.net/rapid"
)

// Reproducibility / invariant mirror (rapid, N1) for the waterline classifier.
// reflects=runtime.wall, test_kind=invariant, cert_language=rapid, liveness=live,
// authority=below.
//
// The single invariant of the wall (CLAUDE.md §2): for ANY write target,
// Classify(target) ⇒ Deny IFF the target resolves to a zone above the waterline
// (kernel / mirrors / fitness — the schemas, or back/kernel/** which by ADR 0002
// covers back/kernel/mirror/**); Allow otherwise. There is no third verdict, and
// Deny ⇒ the BlockReason code is always AGENT_WRITE_ABOVE_WATERLINE.
//
// Determinism-first: Classify is a pure total function of its target string — no
// clock, no rng, no I/O — so the same target always yields the same verdict.

// aboveZones are the canonical above-the-waterline schema names.
var aboveZones = []string{"kernel", "mirrors", "fitness"}

// belowExamples are representative below-the-waterline targets the agent may write.
var belowExamples = []string{
	"back/gen/",
	"back/gen/order.go",
	"front/web/app/wall/page.tsx",
	"archive",
	"changesets",
	"dag",
	"ideas",
	"provenance",
	"docs/plan/S04-the-wall.md",
	"back/runtime/wall/notes.go",
}

func TestClassifyDeterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		target := rapid.String().Draw(rt, "target")
		a := Classify(target)
		b := Classify(target)
		if a != b {
			rt.Fatalf("Classify not deterministic for %q: %v != %v", target, a, b)
		}
		// No third verdict.
		if a.Verdict != VerdictAllow && a.Verdict != VerdictDeny {
			rt.Fatalf("Classify returned a third verdict %q for %q", a.Verdict, target)
		}
		// Deny ⇒ the BlockReason code is always AGENT_WRITE_ABOVE_WATERLINE.
		if a.Verdict == VerdictDeny {
			if a.BlockReason == nil {
				rt.Fatalf("Deny without a BlockReason for %q", target)
			}
			if a.BlockReason.Code != CodeAgentWriteAboveWaterline {
				rt.Fatalf("Deny code %q != %q for %q", a.BlockReason.Code, CodeAgentWriteAboveWaterline, target)
			}
			if len(a.BlockReason.HowToFix) == 0 {
				rt.Fatalf("Deny with empty how_to_fix for %q", target)
			}
		}
		// Allow ⇒ no BlockReason.
		if a.Verdict == VerdictAllow && a.BlockReason != nil {
			rt.Fatalf("Allow carried a BlockReason for %q", target)
		}
	})
}

func TestClassifyDeniesAboveWaterlineSchemas(t *testing.T) {
	for _, zone := range aboveZones {
		d := Classify(zone)
		if d.Verdict != VerdictDeny {
			t.Fatalf("zone %q should be denied, got %q", zone, d.Verdict)
		}
		if d.BlockReason == nil || d.BlockReason.Code != CodeAgentWriteAboveWaterline {
			t.Fatalf("zone %q denied without the canonical code: %+v", zone, d.BlockReason)
		}
	}
}

func TestClassifyDeniesAboveWaterlinePaths(t *testing.T) {
	paths := []string{
		"back/kernel/records/store.go",
		"back/kernel/mirror/cart.feature",
		"kernel.truth",
		"mirrors.mirror",
		"fitness.waterline",
	}
	for _, p := range paths {
		if Classify(p).Verdict != VerdictDeny {
			t.Fatalf("path %q should be denied", p)
		}
	}
}

func TestClassifyAllowsBelowWaterline(t *testing.T) {
	for _, p := range belowExamples {
		d := Classify(p)
		if d.Verdict != VerdictAllow {
			t.Fatalf("path %q should be allowed, got %q (reason: %+v)", p, d.Verdict, d.BlockReason)
		}
	}
}

// The invariant, exhaustively over a generated label: deny IFF above the line.
func TestClassifyDenyIffAbove(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		// Compose a target either from an above-zone or a below-example, possibly
		// with a path suffix, so the generator covers both sides of the boundary.
		var target string
		var wantAbove bool
		if rapid.Bool().Draw(rt, "pickAbove") {
			z := aboveZones[rapid.IntRange(0, len(aboveZones)-1).Draw(rt, "z")]
			suffix := rapid.SampledFrom([]string{"", ".truth", "/x.go", ".any"}).Draw(rt, "suffix")
			target = z + suffix
			wantAbove = true
		} else {
			target = belowExamples[rapid.IntRange(0, len(belowExamples)-1).Draw(rt, "b")]
			wantAbove = false
		}
		got := Classify(target).Verdict
		if wantAbove && got != VerdictDeny {
			rt.Fatalf("above-line target %q got %q, want deny", target, got)
		}
		if !wantAbove && got != VerdictAllow {
			rt.Fatalf("below-line target %q got %q, want allow", target, got)
		}
	})
}

func TestBlockReasonHowToFixNamesTheDoor(t *testing.T) {
	d := Classify("kernel")
	joined := strings.Join(d.BlockReason.HowToFix, " ")
	for _, token := range []string{"idea", "mirror", "/goal"} {
		if !strings.Contains(joined, token) {
			t.Fatalf("how_to_fix should name the %q door; got %q", token, joined)
		}
	}
}
