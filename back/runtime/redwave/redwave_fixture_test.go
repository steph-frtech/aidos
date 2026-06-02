package redwave_test

// Red-wave impact fixture (state links+heads → command bump → events ordered red set),
// interpreted in Go. reflects=runtime.redwave.Impact/Enqueue · test_kind=fixture ·
// cert_language=fixture · liveness=live · authority=above (the human's rule — an entity
// change reddens api/db/types; a button reddens its view iff load-bearing; the wave STARTS
// at the mirror; KRD §42/§98/§112).
//
// Materialized source: tests/runtime/redwave_impact.fixture.md (conceptually stored in the
// `mirrors` schema; persisted to Postgres at S06 — bootstrap exception). It is the LIEN
// PORTEUR: these rows mirror that file fixture-by-fixture (A–E); if the fixture intention
// disappears the test breaks (no silent rot into a monster).
//
// The targets (Order, Order.schema.fixture, api/db/types, submit-btn, createOrder,
// checkout-view, label-btn) are REUSED from S11/S17/S21's pinned example artifacts — the
// agent coins no new target, no new kind, no new business rule. The wave is EXACTLY the set
// of stale links (§42), ordered mirror-first (§42/§98). "Load-bearing" is the declared
// composes weight (S18/S19 §112; ADR 0020).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
)

// edge is a tiny constructor: a derives_from / binds / mirrors edge pinned from@v1 → to@v1.
func edge(kind links.Kind, from, to string, loadBearing bool, layer redwave.Layer) redwave.Edge {
	return redwave.Edge{
		Link: links.Link{
			Kind: kind,
			From: links.Ref{ID: from, Version: "v1"},
			To:   links.Ref{ID: to, Version: "v1"},
		},
		LoadBearing: loadBearing,
		Layer:       layer,
	}
}

// indexOf returns the position of target in the wave, or -1.
func indexOf(w redwave.RedWave, target string) int {
	for i, it := range w.Items {
		if it.Target == target {
			return i
		}
	}
	return -1
}

// Fixture A — an entity bump reddens its mirror FIRST, then api/db/types (done part 1).
func TestFixtureA_EntityBump_MirrorFirstThenProjections(t *testing.T) {
	edges := []redwave.Edge{
		edge(links.KindMirrors, "Order.schema.fixture", "Order", true, redwave.LayerMirror),
		edge(links.KindDerivesFrom, "api", "Order", true, redwave.LayerProjection),
		edge(links.KindDerivesFrom, "db", "Order", true, redwave.LayerProjection),
		edge(links.KindDerivesFrom, "types", "Order", true, redwave.LayerProjection),
	}
	// The bump moved Order's head v1 → v2, so the consumers pinned to Order@v1 are now stale.
	heads := links.Heads{"Order": "v2"}

	w := redwave.Impact([]string{"Order"}, edges, heads)

	if len(w.Items) != 4 {
		t.Fatalf("the wave must be EXACTLY the 4 stale links (§42), got %d: %+v", len(w.Items), w.Items)
	}
	mirrorIdx := indexOf(w, "Order.schema.fixture")
	if mirrorIdx != 0 {
		t.Fatalf("the wave must START at the mirror (mirror-first, §42/§98), got index %d", mirrorIdx)
	}
	for _, proj := range []string{"api", "db", "types"} {
		idx := indexOf(w, proj)
		if idx < 0 {
			t.Fatalf("an entity bump must redden %q (done part 1), but it is not in the wave", proj)
		}
		if idx <= mirrorIdx {
			t.Fatalf("the mirror must come BEFORE %q (mirror-first), mirror=%d %s=%d", proj, mirrorIdx, proj, idx)
		}
	}
	for _, it := range w.Items {
		if it.Reason != redwave.ReasonVersionStale {
			t.Fatalf("every item must be version_stale, got %q for %q", it.Reason, it.Target)
		}
	}
}

// Fixture B — a load-bearing button change reddens its view (done part 2).
func TestFixtureB_LoadBearingButton_ReddensView(t *testing.T) {
	edges := []redwave.Edge{
		// checkout-view derives from the LOAD-BEARING submit-btn.
		edge(links.KindDerivesFrom, "checkout-view", "submit-btn", true, redwave.LayerButton),
	}
	heads := links.Heads{"submit-btn": "v2"} // the button bumped v1 → v2

	w := redwave.Impact([]string{"submit-btn"}, edges, heads)

	idx := indexOf(w, "checkout-view")
	if idx < 0 {
		t.Fatalf("a LOAD-BEARING button bump must redden its view (done part 2), but checkout-view is green")
	}
	if w.Items[idx].Reason != redwave.ReasonVersionStale {
		t.Fatalf("checkout-view must be version_stale, got %q", w.Items[idx].Reason)
	}
}

// Fixture C — a cosmetic button change does NOT redden the view (the negative).
func TestFixtureC_CosmeticButton_DoesNotReddenView(t *testing.T) {
	edges := []redwave.Edge{
		// checkout-view derives from the COSMETIC label-btn (NOT load-bearing).
		edge(links.KindDerivesFrom, "checkout-view", "label-btn", false, redwave.LayerButton),
	}
	heads := links.Heads{"label-btn": "v2"} // the cosmetic button bumped v1 → v2

	w := redwave.Impact([]string{"label-btn"}, edges, heads)

	if indexOf(w, "checkout-view") >= 0 {
		t.Fatalf("a COSMETIC button bump must NOT redden the view (negative), but checkout-view is in the wave: %+v", w.Items)
	}
}

// Fixture D — the wave is enqueued as `open` RedWorkItems (wave_id == bump hash, mirror first).
func TestFixtureD_EnqueuedAsOpenItems(t *testing.T) {
	edges := []redwave.Edge{
		edge(links.KindMirrors, "Order.schema.fixture", "Order", true, redwave.LayerMirror),
		edge(links.KindDerivesFrom, "api", "Order", true, redwave.LayerProjection),
		edge(links.KindDerivesFrom, "db", "Order", true, redwave.LayerProjection),
		edge(links.KindDerivesFrom, "types", "Order", true, redwave.LayerProjection),
	}
	heads := links.Heads{"Order": "v2"}
	w := redwave.Impact([]string{"Order"}, edges, heads)

	const waveID = "bump-hash-abc123"
	rows := redwave.Enqueue(w, waveID)

	if len(rows) != len(w.Items) {
		t.Fatalf("Enqueue must write exactly |wave| rows, got %d for a wave of %d", len(rows), len(w.Items))
	}
	if rows[0].Target != "Order.schema.fixture" {
		t.Fatalf("the FIRST enqueued target must be the mirror_id, got %q", rows[0].Target)
	}
	for _, r := range rows {
		if r.WaveID != waveID {
			t.Fatalf("every row's wave_id must be the bump hash %q, got %q", waveID, r.WaveID)
		}
	}
}

// Fixture E — no bump ⇒ empty wave, queue unchanged.
func TestFixtureE_NoBump_EmptyWave(t *testing.T) {
	edges := []redwave.Edge{
		edge(links.KindDerivesFrom, "api", "Order", true, redwave.LayerProjection),
	}
	heads := links.Heads{"Order": "v2"}

	w := redwave.Impact(nil, edges, heads)
	if !w.IsEmpty() {
		t.Fatalf("no bump ⇒ empty wave, got %+v", w.Items)
	}
	rows := redwave.Enqueue(w, "irrelevant")
	if len(rows) != 0 {
		t.Fatalf("an empty wave must enqueue 0 rows, got %d", len(rows))
	}
}
