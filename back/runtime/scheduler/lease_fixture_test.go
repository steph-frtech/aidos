package scheduler_test

// BA22 — lease/expire ENGINE hand-off fixtures (N2 workflow mirror).
// reflects=runtime.scheduler-lease · test_kind=fixture · cert_language=fixture(go) ·
// liveness=live · authority=below. These are state→tick→state fixtures: a queue state
// + a roster + a supplied `now` drive Schedule, and we assert the transitions + the
// AgentAssignments it emits. The planner is PURE (now is SUPPLIED by the tick driver,
// the only impure shell); the fixture pins the hand-off the BA23 MCP shell will apply.
//
// The behaviours pinned here (the red set):
//   1. dependency-gated lease — an item with an UNRESOLVED dependency is NOT leased; it
//      is surfaced blocked; its upstream resolved ⇒ it leases at the next tick.
//   2. expire — a claimed item whose lease_until < now is RECLAIMED (claimed→open),
//      and its assignment is marked expired, WITHOUT human action (the tick does it).
//   3. mirror-first staffing — among leasable items, the mirror-first head is leased to
//      the role-matched agent (lex-smallest free agent of the matching role).
//   4. idempotent — running Schedule twice with no progress and the same now is a no-op
//      on already-claimed-live items (no double lease, no epoch churn).

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/scheduler"
)

const now0 = "2026-06-03T12:00:00Z"
const past = "2026-06-03T11:00:00Z"   // before now0 → an expired lease
const future = "2026-06-03T13:00:00Z" // after now0 → a still-live lease
const leaseDur = "2026-06-03T13:00:00Z"

func roster() []scheduler.Candidate {
	return []scheduler.Candidate{
		{Ref: "bdd-writer@v1", Role: "bdd-writer", Free: true},
		{Ref: "executor@v1", Role: "executor", Free: true},
	}
}

// (1) dependency-gated lease + (3) mirror-first staffing.
func TestFixture_Schedule_DependencyGate_BlocksThenLeases(t *testing.T) {
	// dep-resolved mirror head, and a projection that depends on the mirror (unresolved).
	q := []scheduler.QueueEntry{
		{
			Item:  scheduler.WorkItem{ItemID: "m1", Status: scheduler.StatusOpen, LeaseEpoch: 0},
			Layer: scheduler.LayerMirror,
		},
		{
			Item:         scheduler.WorkItem{ItemID: "p1", Status: scheduler.StatusOpen, LeaseEpoch: 0},
			Layer:        scheduler.LayerProjection,
			Dependencies: []string{"m1"}, // blocked until m1 resolves
		},
	}
	out := scheduler.Schedule(q, roster(), now0, leaseDur)

	// m1 leases (no deps), to the bdd-writer (mirror role).
	m1 := findEntry(t, out.Queue, "m1")
	if m1.Item.Status != scheduler.StatusClaimed {
		t.Fatalf("m1 (no deps) must lease: got %q", m1.Item.Status)
	}
	if m1.Item.OwnerAgent != "bdd-writer@v1" {
		t.Fatalf("m1 must be staffed by the bdd-writer: got %q", m1.Item.OwnerAgent)
	}
	if m1.Item.LeaseEpoch != 1 {
		t.Fatalf("m1 lease_epoch must bump to 1: got %d", m1.Item.LeaseEpoch)
	}
	// p1 is BLOCKED — its dependency m1 is not resolved.
	p1 := findEntry(t, out.Queue, "p1")
	if p1.Item.Status != scheduler.StatusBlocked {
		t.Fatalf("p1 (dep m1 unresolved) must be blocked: got %q", p1.Item.Status)
	}
	if p1.Item.OwnerAgent != "" {
		t.Fatalf("a blocked item must not be owned: got %q", p1.Item.OwnerAgent)
	}
	// exactly one assignment was emitted (for m1).
	if len(out.Assignments) != 1 || out.Assignments[0].RedWorkItem != "m1" {
		t.Fatalf("exactly the m1 lease must be emitted: %+v", out.Assignments)
	}

	// Now m1 is resolved → p1 unblocks at the next tick, leases to the executor.
	q2 := []scheduler.QueueEntry{
		{Item: scheduler.WorkItem{ItemID: "m1", Status: scheduler.StatusResolved, LeaseEpoch: 1}, Layer: scheduler.LayerMirror},
		{Item: scheduler.WorkItem{ItemID: "p1", Status: scheduler.StatusOpen, LeaseEpoch: 0}, Layer: scheduler.LayerProjection, Dependencies: []string{"m1"}},
	}
	out2 := scheduler.Schedule(q2, roster(), now0, leaseDur)
	p1b := findEntry(t, out2.Queue, "p1")
	if p1b.Item.Status != scheduler.StatusClaimed {
		t.Fatalf("p1 must lease once m1 resolves: got %q", p1b.Item.Status)
	}
	if p1b.Item.OwnerAgent != "executor@v1" {
		t.Fatalf("p1 must be staffed by the executor: got %q", p1b.Item.OwnerAgent)
	}
}

// (2) expire — a claimed item with lease_until < now is reclaimed at the tick.
func TestFixture_Schedule_ExpiresStaleLeaseWithoutHuman(t *testing.T) {
	q := []scheduler.QueueEntry{
		{
			Item: scheduler.WorkItem{
				ItemID:     "x1",
				Status:     scheduler.StatusClaimed,
				OwnerAgent: "executor@v1",
				LeaseUntil: past, // EXPIRED relative to now0
				LeaseEpoch: 3,
			},
			Layer: scheduler.LayerProjection,
		},
	}
	// No free agents → it cannot be re-leased the same tick; assert it is at least reclaimed.
	out := scheduler.Schedule(q, nil, now0, leaseDur)
	x1 := findEntry(t, out.Queue, "x1")
	if x1.Item.Status != scheduler.StatusOpen {
		t.Fatalf("an expired lease must be reclaimed (claimed→open): got %q", x1.Item.Status)
	}
	if x1.Item.OwnerAgent != "" || x1.Item.LeaseUntil != "" {
		t.Fatalf("a reclaimed item must drop owner+lease: %+v", x1.Item)
	}
	// the reclaim emits an EXPIRED assignment marker (audit of the dead lease).
	var sawExpired bool
	for _, a := range out.Assignments {
		if a.RedWorkItem == "x1" && a.Statut == scheduler.AssignmentExpired {
			sawExpired = true
		}
	}
	if !sawExpired {
		t.Fatalf("the expired lease must surface an expired AgentAssignment: %+v", out.Assignments)
	}
}

// A still-live claimed lease is NOT touched (lease_until >= now).
func TestFixture_Schedule_LiveLeaseUntouched(t *testing.T) {
	q := []scheduler.QueueEntry{
		{
			Item: scheduler.WorkItem{
				ItemID:     "x1",
				Status:     scheduler.StatusClaimed,
				OwnerAgent: "executor@v1",
				LeaseUntil: future, // still live
				LeaseEpoch: 5,
			},
			Layer: scheduler.LayerProjection,
		},
	}
	out := scheduler.Schedule(q, roster(), now0, leaseDur)
	x1 := findEntry(t, out.Queue, "x1")
	if x1.Item.Status != scheduler.StatusClaimed || x1.Item.LeaseEpoch != 5 {
		t.Fatalf("a live lease must be untouched: %+v", x1.Item)
	}
	if len(out.Assignments) != 0 {
		t.Fatalf("a live lease emits no new assignment: %+v", out.Assignments)
	}
}

// (4) idempotent — re-running with no progress + same now does not double-lease.
func TestFixture_Schedule_Idempotent(t *testing.T) {
	q := []scheduler.QueueEntry{
		{Item: scheduler.WorkItem{ItemID: "m1", Status: scheduler.StatusOpen, LeaseEpoch: 0}, Layer: scheduler.LayerMirror},
	}
	out1 := scheduler.Schedule(q, roster(), now0, leaseDur)
	out2 := scheduler.Schedule(out1.Queue, roster(), now0, leaseDur)
	if !reflect.DeepEqual(out1.Queue, out2.Queue) {
		t.Fatalf("Schedule must be idempotent on a settled queue:\n a=%+v\n b=%+v", out1.Queue, out2.Queue)
	}
	// the second pass emits NO new lease (m1 is already claimed-live).
	if len(out2.Assignments) != 0 {
		t.Fatalf("the idempotent re-tick must emit no new assignment: %+v", out2.Assignments)
	}
}

func findEntry(t *testing.T, q []scheduler.QueueEntry, id string) scheduler.QueueEntry {
	t.Helper()
	for _, e := range q {
		if e.Item.ItemID == id {
			return e
		}
	}
	t.Fatalf("item %q not found in queue", id)
	return scheduler.QueueEntry{}
}
