package scheduler_test

// BA25 — MULTI-AGENT coordination hand-off fixtures (N2 workflow mirror).
// reflects=runtime.scheduler-team · test_kind=fixture · cert_language=fixture(go) ·
// liveness=live · authority=below. These are state→tick→state fixtures: a queue state +
// a roster of N contending agents + an OrchestrationPolicy (pinned @version) + a supplied
// `now` drive ScheduleTeam, and we assert the coordinated transitions + the
// AgentAssignments it emits. ScheduleTeam is PURE (now is SUPPLIED); it COORDINATES N
// agents under the policy — it never writes truth, the wall holds for every member.
//
// The RED journey pinned here (the BA25 red set):
//   1. dependency-driven HAND-OFF across distinct roles — items A→B (B depends on A),
//      role-A agent + role-B agent → A leases to the role-A agent, B stays BLOCKED; A
//      resolves; at the next tick B leases to the role-B agent. Full hand-off proven.
//   2. MaxConcurrency NEVER exceeded — N leasable items but a cap of K ⇒ at most K live
//      leases this tick (gap F1, the DECLARED number enforced, never a phantom).
//   3. SAME-TARGET conflict serialised — two leasable items render the SAME target ⇒
//      ResolveConflict picks who passes first (mirror-first), the loser WAITS (stays open,
//      no lease), zero lost-update; NextAction = serialise_then_merge.
//   4. at-most-one lease live per item at any `now` (re-stated: a claimed-live item is
//      never re-leased to a second agent in the same tick).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/runtime/scheduler"
)

const teamNow = "2026-06-04T12:00:00Z"
const teamLease = "2026-06-04T13:00:00Z"

// twoRoleRoster: one bdd-writer (mirror role) + one executor (everything below).
func twoRoleRoster() []scheduler.Candidate {
	return []scheduler.Candidate{
		{Ref: "bdd-writer@v1", Role: "bdd-writer", Free: true},
		{Ref: "executor@v1", Role: "executor", Free: true},
	}
}

// policy with a global cap; serialise_then_merge conflict policy (the only zero-lost-update one).
func teamPolicy(maxConcurrency int) agentlayer.OrchestrationPolicy {
	return agentlayer.OrchestrationPolicy{
		ClaimArbitrage:     agentlayer.ConflictSerialiseThenMerge,
		FanOut:             agentlayer.FanModeParallel,
		FanIn:              agentlayer.FanModeSequential,
		ConflitMemeFichier: agentlayer.ConflictSerialiseThenMerge,
		MaxConcurrency:     maxConcurrency,
	}
}

// (1) dependency-driven HAND-OFF across two distinct roles.
func TestFixture_ScheduleTeam_HandOffAcrossRoles(t *testing.T) {
	// mirror item A (no deps), projection item B depends on A.
	q := []scheduler.QueueEntry{
		{Item: scheduler.WorkItem{ItemID: "A", Status: scheduler.StatusOpen, LeaseEpoch: 0}, Layer: scheduler.LayerMirror},
		{Item: scheduler.WorkItem{ItemID: "B", Status: scheduler.StatusOpen, LeaseEpoch: 0}, Layer: scheduler.LayerProjection, Dependencies: []string{"A"}},
	}
	pol := teamPolicy(2) // cap high enough not to bind here

	// tick 1: A leases to the role-A (bdd-writer) agent; B stays BLOCKED (dep A unresolved).
	out := scheduler.ScheduleTeam(q, twoRoleRoster(), pol, teamNow, teamLease)
	a := findEntry(t, out.Queue, "A")
	if a.Item.Status != scheduler.StatusClaimed || a.Item.OwnerAgent != "bdd-writer@v1" {
		t.Fatalf("tick1: A must lease to bdd-writer@v1, got status=%q owner=%q", a.Item.Status, a.Item.OwnerAgent)
	}
	b := findEntry(t, out.Queue, "B")
	if b.Item.Status != scheduler.StatusBlocked {
		t.Fatalf("tick1: B must be BLOCKED until A resolves, got %q", b.Item.Status)
	}

	// A resolves (the agent finished). Re-stamp A resolved, keep B blocked, re-tick.
	q2 := []scheduler.QueueEntry{
		{Item: scheduler.WorkItem{ItemID: "A", Status: scheduler.StatusResolved, LeaseEpoch: a.Item.LeaseEpoch}, Layer: scheduler.LayerMirror},
		{Item: scheduler.WorkItem{ItemID: "B", Status: scheduler.StatusBlocked, LeaseEpoch: 0}, Layer: scheduler.LayerProjection, Dependencies: []string{"A"}},
	}
	out2 := scheduler.ScheduleTeam(q2, twoRoleRoster(), pol, teamNow, teamLease)
	b2 := findEntry(t, out2.Queue, "B")
	if b2.Item.Status != scheduler.StatusClaimed || b2.Item.OwnerAgent != "executor@v1" {
		t.Fatalf("tick2: B must lease to executor@v1 after A resolves, got status=%q owner=%q", b2.Item.Status, b2.Item.OwnerAgent)
	}
}

// (2) MaxConcurrency is NEVER exceeded.
func TestFixture_ScheduleTeam_RespectsMaxConcurrency(t *testing.T) {
	// three independent executor items, but a cap of 1 ⇒ only one leases this tick.
	q := []scheduler.QueueEntry{
		{Item: scheduler.WorkItem{ItemID: "p1", Status: scheduler.StatusOpen}, Layer: scheduler.LayerProjection},
		{Item: scheduler.WorkItem{ItemID: "p2", Status: scheduler.StatusOpen}, Layer: scheduler.LayerProjection},
		{Item: scheduler.WorkItem{ItemID: "p3", Status: scheduler.StatusOpen}, Layer: scheduler.LayerProjection},
	}
	// a roster of three free executors — agents are NOT the bottleneck; the cap is.
	roster := []scheduler.Candidate{
		{Ref: "executor@a", Role: "executor", Free: true},
		{Ref: "executor@b", Role: "executor", Free: true},
		{Ref: "executor@c", Role: "executor", Free: true},
	}
	out := scheduler.ScheduleTeam(q, roster, teamPolicy(1), teamNow, teamLease)

	live := 0
	for _, e := range out.Queue {
		if e.Item.Status == scheduler.StatusClaimed {
			live++
		}
	}
	if live != 1 {
		t.Fatalf("MaxConcurrency=1 must yield exactly 1 live lease, got %d", live)
	}
	// the one leased is the mirror-first head by id (p1 < p2 < p3 within same layer).
	p1 := findEntry(t, out.Queue, "p1")
	if p1.Item.Status != scheduler.StatusClaimed {
		t.Fatalf("the single lease must go to the head p1, got %q", p1.Item.Status)
	}
}

// (3) SAME-TARGET conflict is serialised — the loser WAITS, no lost update.
func TestFixture_ScheduleTeam_SameTargetSerialised(t *testing.T) {
	// two open items rendering the SAME target file; both leasable, two free executors.
	q := []scheduler.QueueEntry{
		{Item: scheduler.WorkItem{ItemID: "x1", Status: scheduler.StatusOpen}, Layer: scheduler.LayerProjection, Target: "src/foo.go"},
		{Item: scheduler.WorkItem{ItemID: "x2", Status: scheduler.StatusOpen}, Layer: scheduler.LayerOperationAction, Target: "src/foo.go"},
	}
	roster := []scheduler.Candidate{
		{Ref: "executor@a", Role: "executor", Free: true},
		{Ref: "executor@b", Role: "executor", Free: true},
	}
	out := scheduler.ScheduleTeam(q, roster, teamPolicy(2), teamNow, teamLease)

	// exactly ONE of the same-target items leases this tick (the conflict winner), the
	// other WAITS (stays open) — never both, never a lost update.
	live := 0
	for _, e := range out.Queue {
		if e.Item.Status == scheduler.StatusClaimed {
			live++
		}
	}
	if live != 1 {
		t.Fatalf("same-target conflict must serialise to exactly 1 live lease, got %d", live)
	}
	// mirror-first: x1 (projection, rank 1) beats x2 (operation_action, rank 2) → x1 wins.
	x1 := findEntry(t, out.Queue, "x1")
	x2 := findEntry(t, out.Queue, "x2")
	if x1.Item.Status != scheduler.StatusClaimed {
		t.Fatalf("conflict winner x1 (lower rank) must lease, got %q", x1.Item.Status)
	}
	if x2.Item.Status != scheduler.StatusOpen {
		t.Fatalf("conflict loser x2 must WAIT (stay open, no lost update), got %q", x2.Item.Status)
	}
	// the coordination reports the conflict + the declared NextAction (serialise_then_merge).
	if len(out.Conflicts) != 1 {
		t.Fatalf("exactly one same-target conflict expected, got %d", len(out.Conflicts))
	}
	c := out.Conflicts[0]
	if !c.SameTarget || c.NextAction != agentlayer.ConflictSerialiseThenMerge {
		t.Fatalf("conflict must be same-target + serialise_then_merge, got sameTarget=%v next=%q", c.SameTarget, c.NextAction)
	}
	if c.Winner.Target != "src/foo.go" || c.Loser.Target != "src/foo.go" {
		t.Fatalf("conflict winner/loser must both name the contended target, got w=%q l=%q", c.Winner.Target, c.Loser.Target)
	}
}

// (4) an already-claimed-live item is never re-leased (at-most-one lease per item).
func TestFixture_ScheduleTeam_NeverRelesesLiveItem(t *testing.T) {
	q := []scheduler.QueueEntry{
		{Item: scheduler.WorkItem{ItemID: "p1", Status: scheduler.StatusClaimed, OwnerAgent: "executor@a", LeaseUntil: teamLease, LeaseEpoch: 1}, Layer: scheduler.LayerProjection},
		{Item: scheduler.WorkItem{ItemID: "p2", Status: scheduler.StatusOpen}, Layer: scheduler.LayerProjection},
	}
	roster := []scheduler.Candidate{
		{Ref: "executor@b", Role: "executor", Free: true},
	}
	out := scheduler.ScheduleTeam(q, roster, teamPolicy(2), teamNow, teamLease)
	p1 := findEntry(t, out.Queue, "p1")
	if p1.Item.Status != scheduler.StatusClaimed || p1.Item.OwnerAgent != "executor@a" || p1.Item.LeaseEpoch != 1 {
		t.Fatalf("a live-leased item must not be re-leased: got status=%q owner=%q epoch=%d", p1.Item.Status, p1.Item.OwnerAgent, p1.Item.LeaseEpoch)
	}
}
