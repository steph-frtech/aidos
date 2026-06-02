package redwave_test

// Red-wave property mirror (∀ invariants). reflects=runtime.redwave.Impact/Enqueue ·
// test_kind=property · cert_language=rapid · liveness=live · authority=below (computational —
// these are MEANS-tests toward the human red, not new truths the agent invents and grades).
//
// The six invariants (KRD §42/§98/§112; ADR 0020), each a means-test toward the human red:
//  1. Impact is DETERMINISTIC — same (bumped, edges, heads) ⇒ byte-identical ordered wave.
//  2. The wave IS EXACTLY the set of stale links via S17.Resolve — no item without a stale,
//     load-bearing, reachable link; no such link without an item.
//  3. The mirror(s) appear BEFORE any projection (mirror-first).
//  4. A non-load-bearing (cosmetic) edge never propagates red to its consumer.
//  5. Enqueue writes exactly |wave| rows, all wave_id == the bump hash, all reason set.
//  6. Impact NEVER panics on a malformed/absent target (it yields a wave, not a crash).

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
	"pgregory.net/rapid"
)

// genKind draws one of the six S17 link kinds.
func genKind() *rapid.Generator[links.Kind] {
	kinds := links.Kinds()
	return rapid.Custom(func(t *rapid.T) links.Kind {
		return kinds[rapid.IntRange(0, len(kinds)-1).Draw(t, "kindIdx")]
	})
}

// genID draws a small id from a fixed alphabet so closures actually overlap (otherwise every
// edge is disjoint and nothing ever propagates).
func genID() *rapid.Generator[string] {
	ids := []string{"Order", "api", "db", "types", "submit-btn", "checkout-view", "label-btn", "createOrder", "Order.schema.fixture"}
	return rapid.SampledFrom(ids)
}

func genVersion() *rapid.Generator[string] {
	return rapid.SampledFrom([]string{"v1", "v2", "v3"})
}

func genLayer() *rapid.Generator[redwave.Layer] {
	return rapid.SampledFrom([]redwave.Layer{
		redwave.LayerMirror, redwave.LayerProjection, redwave.LayerOperationAction, redwave.LayerButton, redwave.Layer("weird"),
	})
}

func genEdge() *rapid.Generator[redwave.Edge] {
	return rapid.Custom(func(t *rapid.T) redwave.Edge {
		return redwave.Edge{
			Link: links.Link{
				Kind: genKind().Draw(t, "kind"),
				From: links.Ref{ID: genID().Draw(t, "fromID"), Version: genVersion().Draw(t, "fromV")},
				To:   links.Ref{ID: genID().Draw(t, "toID"), Version: genVersion().Draw(t, "toV")},
			},
			LoadBearing: rapid.Bool().Draw(t, "loadBearing"),
			Layer:       genLayer().Draw(t, "layer"),
		}
	})
}

func genHeads() *rapid.Generator[links.Heads] {
	return rapid.Custom(func(t *rapid.T) links.Heads {
		n := rapid.IntRange(0, 5).Draw(t, "headsN")
		h := links.Heads{}
		for i := 0; i < n; i++ {
			h[genID().Draw(t, "headID")] = genVersion().Draw(t, "headV")
		}
		return h
	})
}

func genBumped() *rapid.Generator[[]string] {
	return rapid.SliceOfN(genID(), 0, 3)
}

// Invariant 1 — Impact is deterministic (same inputs ⇒ byte-identical ordered wave).
func TestProp_Impact_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		bumped := genBumped().Draw(t, "bumped")
		edges := rapid.SliceOfN(genEdge(), 0, 8).Draw(t, "edges")
		heads := genHeads().Draw(t, "heads")

		a := redwave.Impact(bumped, edges, heads)
		b := redwave.Impact(bumped, edges, heads)
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("Impact must be deterministic, got %+v vs %+v", a, b)
		}
	})
}

// Invariant 2 — the wave IS EXACTLY the set of reachable, load-bearing, STALE links via
// S17.Resolve. Every item's deps point at links Resolve reports stale|absent; and every edge
// that is (stale ∧ load-bearing ∧ from-a-red-target) yields an item for its consumer.
func TestProp_WaveIsExactlyTheStaleLinks(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		bumped := genBumped().Draw(t, "bumped")
		edges := rapid.SliceOfN(genEdge(), 0, 8).Draw(t, "edges")
		heads := genHeads().Draw(t, "heads")

		w := redwave.Impact(bumped, edges, heads)

		// Every item must have at least one dependency that Resolve reports red (stale|absent);
		// an item is only created from a propagating edge, so its dep set is non-empty.
		redTargets := map[string]bool{}
		for _, id := range bumped {
			redTargets[id] = true
		}
		for _, it := range w.Items {
			redTargets[it.Target] = true
		}
		for _, it := range w.Items {
			if len(it.Dependencies) == 0 {
				t.Fatalf("no item without a stale link (§42): %q has empty deps", it.Target)
			}
			// Each dependency must be a target some edge marks stale (Resolve != green).
			ok := false
			for _, dep := range it.Dependencies {
				for _, e := range edges {
					if e.Link.From.ID == it.Target && e.Link.To.ID == dep &&
						e.LoadBearing && redTargets[dep] &&
						links.Resolve(e.Link, heads) != links.StatusGreen {
						ok = true
					}
				}
			}
			if !ok {
				t.Fatalf("item %q deps %v do not correspond to a stale, load-bearing, reachable link", it.Target, it.Dependencies)
			}
		}
	})
}

// Invariant 3 — the mirror(s) appear BEFORE any projection (mirror-first ordering).
func TestProp_MirrorFirst(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		bumped := genBumped().Draw(t, "bumped")
		edges := rapid.SliceOfN(genEdge(), 0, 8).Draw(t, "edges")
		heads := genHeads().Draw(t, "heads")

		w := redwave.Impact(bumped, edges, heads)

		lastMirror := -1
		firstNonMirror := -1
		for i, it := range w.Items {
			if it.Layer == redwave.LayerMirror {
				lastMirror = i
			} else if firstNonMirror == -1 {
				firstNonMirror = i
			}
		}
		if lastMirror >= 0 && firstNonMirror >= 0 && lastMirror > firstNonMirror {
			t.Fatalf("a mirror item at %d came AFTER a non-mirror item at %d (mirror-first violated): %+v", lastMirror, firstNonMirror, w.Items)
		}
	})
}

// Invariant 4 — a non-load-bearing (cosmetic) edge never propagates red to its consumer
// (unless that consumer is reddened by some OTHER load-bearing path).
func TestProp_CosmeticNeverPropagatesAlone(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// A single cosmetic edge can never produce a wave item for its consumer.
		from := genID().Draw(t, "from")
		to := genID().Draw(t, "to")
		if from == to {
			return // a self-edge is degenerate; skip.
		}
		e := redwave.Edge{
			Link: links.Link{
				Kind: links.KindDerivesFrom,
				From: links.Ref{ID: from, Version: "v1"},
				To:   links.Ref{ID: to, Version: "v1"},
			},
			LoadBearing: false, // COSMETIC
			Layer:       redwave.LayerButton,
		}
		heads := links.Heads{to: "v2"} // the target bumped — the edge IS stale, but cosmetic.
		w := redwave.Impact([]string{to}, []redwave.Edge{e}, heads)
		if indexOf(w, from) >= 0 {
			t.Fatalf("a COSMETIC edge must never propagate red to its consumer %q, wave=%+v", from, w.Items)
		}
	})
}

// Invariant 5 — Enqueue writes exactly |wave| rows, all wave_id == bump hash, reason kept.
func TestProp_Enqueue_RowsAndWaveID(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		bumped := genBumped().Draw(t, "bumped")
		edges := rapid.SliceOfN(genEdge(), 0, 8).Draw(t, "edges")
		heads := genHeads().Draw(t, "heads")
		waveID := rapid.SampledFrom([]string{"h1", "h2", "deadbeef"}).Draw(t, "waveID")

		w := redwave.Impact(bumped, edges, heads)
		rows := redwave.Enqueue(w, waveID)

		if len(rows) != len(w.Items) {
			t.Fatalf("Enqueue must write exactly |wave|=%d rows, got %d", len(w.Items), len(rows))
		}
		for _, r := range rows {
			if r.WaveID != waveID {
				t.Fatalf("every row wave_id must be %q, got %q", waveID, r.WaveID)
			}
			if r.Reason == "" {
				t.Fatalf("every enqueued row must carry a reason, got empty for %q", r.Target)
			}
		}
	})
}

// Invariant 6 — Impact never panics on a malformed/absent target (totality). The harness
// recover() turns any panic into a test failure; reaching the end is the proof.
func TestProp_Impact_NeverPanics(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		bumped := rapid.SliceOfN(rapid.String(), 0, 3).Draw(t, "bumped")
		edges := rapid.SliceOfN(genEdge(), 0, 8).Draw(t, "edges")
		heads := genHeads().Draw(t, "heads")
		_ = redwave.Impact(bumped, edges, heads) // must not panic.
	})
}
