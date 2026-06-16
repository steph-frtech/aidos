package changesetsrv

// Fan-out mirror (reflects=mcp.changeset.apply→red-wave, test_kind=integration, liveness=live).
//
// THE BEHAVIOUR (Trou dormant #2): a ChangeSet flipping DRAFT → APPLIED IS a kernel bump, and a
// bump MUST fire the red-wave fan-out (KRD §42/§74/§98). This mirror pins the discriminant:
//
//   (a) POSITIVE — a VALID apply (cs.Apply admits, Stamp succeeds) fires the fan-out exactly once,
//       carrying the applied changeset (so the wave_id == the changeset id, the bump's content
//       hash). The wave is computed by the PURE engine; here we assert the SEAM is reached.
//   (b) NEGATIVE — a BLOCKED apply (completeness gate returns INCOMPLETE_CHANGESET, Stamp is never
//       reached) fires the fan-out ZERO times. No fan-out on a non-apply.
//   (c) DISCRIMINANT — neutralise the wiring (a nil fan-out) and the POSITIVE path no longer fires:
//       this proves the assertion is load-bearing, not vacuous (CLAUDE.md §5 hook-honesty).
//
// The fan-out here is a SPY (a pure in-memory recorder) so the discriminant needs no DB — the
// apply gate is the sole discriminant. The end-to-end enqueue-into-Postgres path is proven by the
// redwork package's Testcontainers mirror (back/runtime/redwork) + the real-DB wiring below
// (TestApply_FiresRealRedWorkQueue), which reuses the same throwaway-Postgres harness.

import (
	"context"
	"testing"

	cs "github.com/steph-frtech/aidos/back/archive/changeset"
)

// spyFanOut records every applied changeset handed to the seam. It is the recorder the positive/
// negative discriminant reads back.
type spyFanOut struct {
	fired []cs.ChangeSet
}

func (s *spyFanOut) onApplied(_ context.Context, applied cs.ChangeSet) error {
	s.fired = append(s.fired, applied)
	return nil
}

// TestApply_FiresFanOutOnValidApply — (a) a valid DRAFT→APPLIED fires the fan-out exactly once,
// carrying the applied changeset (its id is the wave's bump hash).
func TestApply_FiresFanOutOnValidApply(t *testing.T) {
	s := startServer(t)
	spy := &spyFanOut{}
	s.fanOut = spy.onApplied

	ctx := context.Background()
	_, opened, err := s.open(ctx, nil, openInput{
		Label: "add order discount", ParentPhase: "phase-7",
		SpecDelta:   &deltaIO{Kind: "add", Target: "Order.discount"},
		MirrorDelta: &deltaIO{Kind: "add", Target: "Order.discount.fixture"},
	})
	if err != nil {
		t.Fatalf("open: %v", err)
	}

	_, applied, err := s.apply(ctx, nil, idInput{ID: opened.ID})
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if applied.Blocked || applied.Status != "APPLIED" {
		t.Fatalf("apply = %+v, want APPLIED unblocked", applied)
	}

	if len(spy.fired) != 1 {
		t.Fatalf("a valid apply must fire the fan-out exactly once, fired %d times", len(spy.fired))
	}
	if spy.fired[0].ID != opened.ID {
		t.Fatalf("the fan-out must carry the APPLIED changeset (wave bump hash = its id); got %q want %q",
			spy.fired[0].ID, opened.ID)
	}
	if spy.fired[0].Status != cs.StatusApplied {
		t.Fatalf("the fan-out must fire on the APPLIED envelope, got status %q", spy.fired[0].Status)
	}
}

// TestApply_DoesNotFireWhenBlocked — (b) a blocked apply (no mirror_delta → INCOMPLETE_CHANGESET,
// Stamp never reached) fires the fan-out ZERO times.
func TestApply_DoesNotFireWhenBlocked(t *testing.T) {
	s := startServer(t)
	spy := &spyFanOut{}
	s.fanOut = spy.onApplied

	ctx := context.Background()
	_, opened, err := s.open(ctx, nil, openInput{
		Label: "spec without mirror", ParentPhase: "phase-7",
		SpecDelta: &deltaIO{Kind: "add", Target: "Order.discount"}, // NO mirror_delta → gate blocks
	})
	if err != nil {
		t.Fatalf("open: %v", err)
	}

	_, res, err := s.apply(ctx, nil, idInput{ID: opened.ID})
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if !res.Blocked || res.BlockCode != string(cs.CodeIncompleteChangeSet) {
		t.Fatalf("incomplete apply = %+v, want blocked INCOMPLETE_CHANGESET", res)
	}

	if len(spy.fired) != 0 {
		t.Fatalf("a BLOCKED apply must NOT fire the fan-out (no bump on a non-apply), fired %d times", len(spy.fired))
	}
}

// TestApply_NilFanOutIsSafe — (c) the discriminant: with the wiring NEUTRALISED (nil fan-out), the
// positive path still applies but fires nothing — proving the positive assertion is load-bearing
// (a vacuous test would pass even with the seam removed) and that prod call sites passing no
// fan-out (NewServer) never crash.
func TestApply_NilFanOutIsSafe(t *testing.T) {
	s := startServer(t)
	s.fanOut = nil // wiring neutralised

	ctx := context.Background()
	_, opened, err := s.open(ctx, nil, openInput{
		Label: "add order discount", ParentPhase: "phase-7",
		SpecDelta:   &deltaIO{Kind: "add", Target: "Order.discount"},
		MirrorDelta: &deltaIO{Kind: "add", Target: "Order.discount.fixture"},
	})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	_, applied, err := s.apply(ctx, nil, idInput{ID: opened.ID})
	if err != nil {
		t.Fatalf("apply with nil fan-out must not error: %v", err)
	}
	if applied.Blocked || applied.Status != "APPLIED" {
		t.Fatalf("apply with nil fan-out = %+v, want APPLIED unblocked", applied)
	}
}

// TestApply_FanOutErrorDoesNotFailApply — the fan-out is BEST-EFFORT: the apply is already
// committed (Stamp succeeded) before the seam fires, so a fan-out error must NOT roll the apply
// back nor surface as an apply error. The APPLIED stamp stands.
func TestApply_FanOutErrorDoesNotFailApply(t *testing.T) {
	s := startServer(t)
	s.fanOut = func(_ context.Context, _ cs.ChangeSet) error {
		return context.DeadlineExceeded // the seam fails
	}

	ctx := context.Background()
	_, opened, err := s.open(ctx, nil, openInput{
		Label: "add order discount", ParentPhase: "phase-7",
		SpecDelta:   &deltaIO{Kind: "add", Target: "Order.discount"},
		MirrorDelta: &deltaIO{Kind: "add", Target: "Order.discount.fixture"},
	})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	_, applied, err := s.apply(ctx, nil, idInput{ID: opened.ID})
	if err != nil {
		t.Fatalf("a failing fan-out must not surface as an apply error (best-effort): %v", err)
	}
	if applied.Blocked || applied.Status != "APPLIED" {
		t.Fatalf("a failing fan-out must not roll the apply back, got %+v", applied)
	}
	// The APPLIED stamp must stand (the apply was committed before the seam fired).
	_, st, err := s.status(ctx, nil, idInput{ID: opened.ID})
	if err != nil {
		t.Fatalf("status after failing fan-out: %v", err)
	}
	if st.Status != "APPLIED" {
		t.Fatalf("after a failing fan-out the changeset must stay APPLIED, got %q", st.Status)
	}
}
