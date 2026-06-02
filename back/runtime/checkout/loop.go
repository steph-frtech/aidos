package checkout

import (
	"time"

	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
)

// unixNanos turns the Input's deterministic stamp into a time.Time WITHOUT calling
// the clock — the value is an argument all the way down (determinism-first). It is
// used only as the changeset applied_at (a lifecycle stamp, not part of the content
// address, so it never leaks into a hash).
func unixNanos(ns int64) time.Time { return time.Unix(0, ns).UTC() }

// staleVersion is the NON-head version the slice's red-set edge is pinned to so the
// createOrder mirror resolves STALE (red) — that single failing mirror IS the red set
// (S29). It is a fixed token (not the head id), so links.Resolve sees from@stale ≠
// head and reddens the consumer. A constant keeps the slice content-idempotent.
const staleVersion = "v-pre"

// checkoutMirrorRef is the consuming mirror ref of the slice's red-set edge — the
// mirror that reflects createOrder. It is the `from` (consumer) side; createOrder is
// the `to` (target) side. When createOrder's head moves (the bump), this mirror's
// pinned link goes stale and the mirror becomes the red set.
const checkoutMirrorRef = "examples.checkout.full-loop"

// checkoutEdge builds the single S22 red-wave edge of the slice: the createOrder
// mirror (consumer) → createOrder (target), pinned to a stale version, load-bearing,
// in the mirror layer. With heads pinning createOrder at its real head id, Resolve
// sees the link stale and Impact reddens the mirror — the red set is exactly that
// mirror. REUSES links.Link / redwave.Edge verbatim; invents no link kind.
func checkoutEdge(opHeadID string) redwave.Edge {
	return redwave.Edge{
		Link: links.Link{
			Kind: links.KindMirrors,
			From: links.Ref{ID: checkoutMirrorRef, Version: staleVersion},
			To:   links.Ref{ID: "createOrder", Version: staleVersion},
		},
		LoadBearing: true,
		Layer:       redwave.LayerMirror,
	}
}

// sealPhase seals a new STABLE phase on the dag (S23) for the slice. The cut pins the
// createOrder op id the slice promoted; the single mirror link now resolves GREEN
// (its `to` version equals the head), every (zero) sensor is green, so IsStable is
// true and the phase id is the content address of the cut — deterministic and
// chainable. REUSES phases.IsStable / links.Resolve verbatim; seals nothing if the
// cut is incoherent (it returns the phase's reasons as a BlockReason rather than a
// false "stable").
func sealPhase(asts KernelASTs) (string, *blockreason.BlockReason) {
	cut := phases.Cut{"createOrder": asts.OperationID}
	heads := links.Heads{"createOrder": asts.OperationID}
	// The slice's own link, now GREEN: the mirror is pinned to the head the cut seals.
	ls := []links.Link{{
		Kind: links.KindMirrors,
		From: links.Ref{ID: checkoutMirrorRef, Version: asts.OperationID},
		To:   links.Ref{ID: "createOrder", Version: asts.OperationID},
	}}
	phase := phases.IsStable(cut, heads, ls, nil)
	if !phase.Stable {
		br := blockreason.For(blockreason.CodeNoRedSet)
		return "", &br
	}
	version, err := phase.Version()
	if err != nil {
		br := blockreason.For(blockreason.CodeNoRedSet)
		return "", &br
	}
	return version, nil
}
