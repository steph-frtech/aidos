package phases_test

// PROPERTY MIRROR (∀) for archive.phases.IsStable — conceptually stored in the `mirrors`
// schema, materialized here for the Go runner (rapid is the frozen invariant slot, ADR 0003).
//
//   # reflects: archive.phases.IsStable · test_kind: property · cert_language: rapid · authority: below
//
// The invariants are KRD §43 (the coherent-cut LAW), pinned as computational properties of
// the pure IsStable (the staleness/green RULE itself is the human's, above the line, pinned by
// the fixture). The properties:
//
//  1. DETERMINISTIC. ∀ cut,heads,links,sensors ⇒ same input ⇒ same (stable, reasons).
//  2. EMPTY ⇒ STABLE. The empty cut is ALWAYS stable (vacuous truth — the base case).
//  3. ANY RED ⇒ UNSTABLE. ≥1 red sensor OR ≥1 non-green link ⇒ stable == false.
//  4. STABLE ⇒ ALL GREEN (both ways). stable ⇔ every link resolves green ∧ every sensor green.
//  5. REASONS ⇔ ¬STABLE. reasons empty iff stable; every reason names a real offending id.
//  6. NEVER PANICS. ∀ input ⇒ IsStable yields a verdict, never crashes (a malformed cut too).

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"pgregory.net/rapid"
)

// genHeads draws a small heads map over the canonical example ids.
func genHeads(t *rapid.T) links.Heads {
	h := links.Heads{}
	if rapid.Bool().Draw(t, "createOrder.present") {
		h["createOrder"] = rapid.SampledFrom([]string{"v1", "v2", "v3"}).Draw(t, "createOrder.head")
	}
	if rapid.Bool().Draw(t, "Order.present") {
		h["Order"] = rapid.SampledFrom([]string{"v1", "v2"}).Draw(t, "Order.head")
	}
	return h
}

// genLink draws a pinned link over the canonical example ids/targets.
func genLink(t *rapid.T) links.Link {
	to := rapid.SampledFrom([]string{"createOrder", "Order"}).Draw(t, "to.id")
	return links.Link{
		Kind: links.KindBinds,
		From: links.Ref{ID: "checkout-submit", Version: "v1"},
		To:   links.Ref{ID: to, Version: rapid.SampledFrom([]string{"v1", "v2", "v3"}).Draw(t, "to.version")},
	}
}

// genSensor draws a sensor status over the canonical ids.
func genSensor(t *rapid.T) phases.SensorStatus {
	return phases.SensorStatus{
		ID:   rapid.SampledFrom([]string{"createOrder.fixture", "Order.schema.fixture"}).Draw(t, "sensor.id"),
		Pass: rapid.Bool().Draw(t, "sensor.pass"),
	}
}

func genInput(t *rapid.T) (links.Heads, []links.Link, []phases.SensorStatus) {
	heads := genHeads(t)
	ls := rapid.SliceOfN(rapid.Custom(genLink), 0, 4).Draw(t, "links")
	sensors := rapid.SliceOfN(rapid.Custom(genSensor), 0, 4).Draw(t, "sensors")
	return heads, ls, sensors
}

// allGreen reports the reference oracle: every link resolves green AND every sensor is green.
func allGreen(heads links.Heads, ls []links.Link, sensors []phases.SensorStatus) bool {
	for _, l := range ls {
		if links.Resolve(l, heads) != links.StatusGreen {
			return false
		}
	}
	for _, s := range sensors {
		if !s.Pass {
			return false
		}
	}
	return true
}

// TestIsStable_Deterministic — same input ⇒ same (stable, reasons).
func TestIsStable_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		cut := phases.Cut{"createOrder": "v3"}
		heads, ls, sensors := genInput(t)
		a := phases.IsStable(cut, heads, ls, sensors)
		b := phases.IsStable(cut, heads, ls, sensors)
		if a.Stable != b.Stable {
			t.Fatalf("non-deterministic stable: %v vs %v", a.Stable, b.Stable)
		}
		if strings.Join(a.Reasons, "|") != strings.Join(b.Reasons, "|") {
			t.Fatalf("non-deterministic reasons: %v vs %v", a.Reasons, b.Reasons)
		}
	})
}

// TestIsStable_EmptyAlwaysStable — the empty cut is ALWAYS stable (the base case).
func TestIsStable_EmptyAlwaysStable(t *testing.T) {
	p := phases.IsStable(phases.Cut{}, links.Heads{}, nil, nil)
	if !p.Stable || len(p.Reasons) != 0 {
		t.Fatalf("the empty phase must be stable with no reasons, got stable=%v reasons=%v", p.Stable, p.Reasons)
	}
}

// TestIsStable_StableIffAllGreen — stable ⇔ every link green ∧ every sensor green (both ways).
func TestIsStable_StableIffAllGreen(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		heads, ls, sensors := genInput(t)
		p := phases.IsStable(phases.Cut{}, heads, ls, sensors)
		want := allGreen(heads, ls, sensors)
		if p.Stable != want {
			t.Fatalf("stable=%v but allGreen=%v (reasons=%v)", p.Stable, want, p.Reasons)
		}
	})
}

// TestIsStable_AnyRedUnstable — ≥1 red sensor OR ≥1 non-green link ⇒ unstable.
func TestIsStable_AnyRedUnstable(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		heads, ls, sensors := genInput(t)
		hasRed := !allGreen(heads, ls, sensors)
		p := phases.IsStable(phases.Cut{}, heads, ls, sensors)
		if hasRed && p.Stable {
			t.Fatalf("a cut with a red mirror must be UNSTABLE: heads=%v links=%v sensors=%v", heads, ls, sensors)
		}
	})
}

// TestIsStable_ReasonsIffUnstable — reasons empty ⇔ stable; every reason names a real
// offending id (a red sensor id, or a non-green link's rendered form).
func TestIsStable_ReasonsIffUnstable(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		heads, ls, sensors := genInput(t)
		p := phases.IsStable(phases.Cut{}, heads, ls, sensors)

		if (len(p.Reasons) == 0) != p.Stable {
			t.Fatalf("reasons must be empty IFF stable: stable=%v reasons=%v", p.Stable, p.Reasons)
		}

		// Build the set of legitimate reason strings.
		legit := map[string]bool{}
		for _, s := range sensors {
			if !s.Pass {
				legit[s.ID] = true
			}
		}
		for _, l := range ls {
			if status := links.Resolve(l, heads); status != links.StatusGreen {
				legit[l.From.String()+"->"+l.To.String()+" ("+string(status)+")"] = true
			}
		}
		for _, r := range p.Reasons {
			if !legit[r] {
				t.Fatalf("reason %q does not name a real offending id (legit=%v)", r, legit)
			}
		}
	})
}

// TestIsStable_NeverPanics — IsStable yields a verdict on any input, never crashes (even a nil
// cut / nil links / nil sensors / malformed refs).
func TestIsStable_NeverPanics(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		heads, ls, sensors := genInput(t)
		// also throw in a malformed (unpinned) link to exercise totality.
		if rapid.Bool().Draw(t, "inject.malformed") {
			ls = append(ls, links.Link{Kind: links.KindBinds, From: links.Ref{}, To: links.Ref{}})
		}
		_ = phases.IsStable(nil, heads, ls, sensors) // must not panic
	})
}
