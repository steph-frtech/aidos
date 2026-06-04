package scheduler_test

// BA22 — TICK DRIVER fixture (gap E1): the impure shell that reclaims a dead-agent item
// at the NEXT tick, WITHOUT human action. reflects=runtime.scheduler-tick ·
// test_kind=fixture · cert_language=fixture(go) · liveness=live · authority=below.
//
// The driver is the ONLY impure shell; here we inject a deterministic stepping clock and a
// capturing applier so the loop is reproducible. The behaviours pinned:
//   1. one Tick reads the snapshot, supplies `now`, runs the PURE planner, applies once.
//   2. a claimed item whose lease lapsed BEFORE this tick's `now` is reclaimed at the
//      tick — no human click (the anti-dead-agent guarantee).
//   3. LeaseWindow.Until stamps now+Duration deterministically (fail-closed on bad now).
//   4. the loop is deterministic: same clock sequence + same snapshot ⇒ same applied result.

import (
	"testing"
	"time"

	"github.com/steph-frtech/aidos/back/runtime/scheduler"
)

// stepClock is a deterministic Clock: it returns each supplied instant in turn, so a test
// drives the tick loop second-by-second with no wall clock.
type stepClock struct {
	instants []string
	i        int
}

func (c *stepClock) Now() string {
	v := c.instants[c.i]
	if c.i < len(c.instants)-1 {
		c.i++
	}
	return v
}

// staticSource returns a fixed snapshot — the queue the driver plans over this tick.
type staticSource struct {
	queue  []scheduler.QueueEntry
	agents []scheduler.Candidate
}

func (s staticSource) Snapshot() ([]scheduler.QueueEntry, []scheduler.Candidate) {
	return s.queue, s.agents
}

// captureApplier records the last applied ScheduleResult (the BA23 UPDATE seam stand-in).
type captureApplier struct {
	last  scheduler.ScheduleResult
	calls int
}

func (a *captureApplier) Apply(r scheduler.ScheduleResult) error {
	a.last = r
	a.calls++
	return nil
}

// (2) a dead-agent lease is reclaimed at the next tick, no human action.
func TestTick_ReclaimsDeadAgentLeaseWithoutHuman(t *testing.T) {
	// an item claimed by an agent whose lease lapsed at 11:00 — the agent is "dead".
	q := []scheduler.QueueEntry{
		{
			Item: scheduler.WorkItem{
				ItemID:     "x1",
				Status:     scheduler.StatusClaimed,
				OwnerAgent: "executor@v1",
				LeaseUntil: "2026-06-03T11:00:00Z",
				LeaseEpoch: 2,
			},
			Layer: scheduler.LayerProjection,
		},
	}
	applier := &captureApplier{}
	d := scheduler.Driver{
		Clock:  &stepClock{instants: []string{"2026-06-03T12:00:00Z"}}, // now > lease → expired
		Source: staticSource{queue: q, agents: nil},
		Apply:  applier,
		Lease:  scheduler.LeaseWindow{Duration: 2 * time.Hour},
	}

	res, err := d.Tick()
	if err != nil {
		t.Fatalf("Tick: %v", err)
	}
	if applier.calls != 1 {
		t.Fatalf("one Tick must apply exactly once: %d", applier.calls)
	}
	x1 := findEntry(t, res.Queue, "x1")
	if x1.Item.Status != scheduler.StatusOpen {
		t.Fatalf("dead-agent lease must be reclaimed at the tick (claimed→open): got %q", x1.Item.Status)
	}
	if x1.Item.OwnerAgent != "" || x1.Item.LeaseUntil != "" {
		t.Fatalf("reclaimed item must drop owner+lease: %+v", x1.Item)
	}
	// the applier saw the same reclaimed result (the hand-off the BA23 UPDATE replays).
	if findEntry(t, applier.last.Queue, "x1").Item.Status != scheduler.StatusOpen {
		t.Fatal("the applier must receive the reclaimed queue")
	}
}

// (1)+(2 continued) a free matching agent re-leases the reclaimed item at the SAME tick.
func TestTick_ReclaimsThenReleasesToLiveAgent(t *testing.T) {
	q := []scheduler.QueueEntry{
		{
			Item: scheduler.WorkItem{
				ItemID: "x1", Status: scheduler.StatusClaimed, OwnerAgent: "old@v1",
				LeaseUntil: "2026-06-03T11:00:00Z", LeaseEpoch: 4,
			},
			Layer: scheduler.LayerProjection,
		},
	}
	applier := &captureApplier{}
	d := scheduler.Driver{
		Clock:  &stepClock{instants: []string{"2026-06-03T12:00:00Z"}},
		Source: staticSource{queue: q, agents: []scheduler.Candidate{{Ref: "new@v1", Role: "executor", Free: true}}},
		Apply:  applier,
		Lease:  scheduler.LeaseWindow{Duration: 2 * time.Hour},
	}
	res, _ := d.Tick()
	x1 := findEntry(t, res.Queue, "x1")
	if x1.Item.Status != scheduler.StatusClaimed || x1.Item.OwnerAgent != "new@v1" {
		t.Fatalf("a free agent must re-lease the reclaimed item: %+v", x1.Item)
	}
	// the epoch is MONOTONE across the reclaim+re-lease: was 4 → bumped to 5 (fencing).
	if x1.Item.LeaseEpoch != 5 {
		t.Fatalf("re-lease must bump the monotone epoch 4→5 (fencing): got %d", x1.Item.LeaseEpoch)
	}
	// the new lease_until is now (12:00) + 2h = 14:00 (LeaseWindow, deterministic).
	if x1.Item.LeaseUntil != "2026-06-03T14:00:00Z" {
		t.Fatalf("fresh lease_until must be now+Duration: got %q", x1.Item.LeaseUntil)
	}
}

// (3) LeaseWindow.Until stamps now+Duration; fail-closed (empty) on a malformed now.
func TestLeaseWindow_Until(t *testing.T) {
	w := scheduler.LeaseWindow{Duration: 90 * time.Minute}
	if got := w.Until("2026-06-03T12:00:00Z"); got != "2026-06-03T13:30:00Z" {
		t.Fatalf("Until(now+90m) = %q; want 13:30", got)
	}
	if got := w.Until("not-a-time"); got != "" {
		t.Fatalf("a malformed now must yield empty (fail-closed): %q", got)
	}
}

// (4) the loop is deterministic: same clock + same snapshot ⇒ same applied result.
func TestTick_Deterministic(t *testing.T) {
	mk := func() (*captureApplier, scheduler.Driver) {
		ap := &captureApplier{}
		return ap, scheduler.Driver{
			Clock:  &stepClock{instants: []string{"2026-06-03T12:00:00Z"}},
			Source: staticSource{queue: []scheduler.QueueEntry{{Item: scheduler.WorkItem{ItemID: "m1", Status: scheduler.StatusOpen}, Layer: scheduler.LayerMirror}}, agents: roster()},
			Apply:  ap,
			Lease:  scheduler.LeaseWindow{Duration: time.Hour},
		}
	}
	a1, d1 := mk()
	a2, d2 := mk()
	_, _ = d1.Tick()
	_, _ = d2.Tick()
	if findEntry(t, a1.last.Queue, "m1").Item.OwnerAgent != findEntry(t, a2.last.Queue, "m1").Item.OwnerAgent {
		t.Fatal("the tick loop must be deterministic for the same clock + snapshot")
	}
}
