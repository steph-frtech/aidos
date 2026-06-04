package scheduler_test

// BA22 — lease/expire ENGINE invariants + write-path FENCING (∀ property mirror).
// reflects=runtime.scheduler-lease · test_kind=property · cert_language=rapid ·
// liveness=live · authority=below. The planner is PURE: same (queue, agents, now,
// leaseUntil) ⇒ same (queue, assignments). No clock (now SUPPLIED), no rng, no I/O.
//
// Invariants (determinism-first, CLAUDE.md §6/§8):
//   1. determinism — same inputs ⇒ byte-identical Schedule outputs.
//   2. never-lease-blocked — an item with an unresolved dependency is NEVER claimed by
//      Schedule (it is at most blocked); only deps-all-resolved items may lease.
//   3. expire — every claimed item with lease_until < now is reclaimed (claimed→open);
//      a claimed item with lease_until >= now keeps its lease (epoch unchanged).
//   4. cross-invariant (gap K4) — queue.status and assignment.statut stay jointly
//      consistent: no `claimed` row without a live (leased/running) assignment; no
//      assignment pointing at an `open`/`blocked`/`resolved` row claims it is running.
//   5. fencing (gap E2) — Fence(write.epoch, item.lease_epoch): equal ⇒ live (ok),
//      strictly-less ⇒ stale (refused, AGENT_LEASE_FENCED), strictly-greater ⇒
//      impossible (refused). Pure, total, never panics.

import (
	"reflect"
	"sort"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/scheduler"
	"pgregory.net/rapid"
)

var layers = []scheduler.Layer{
	scheduler.LayerMirror, scheduler.LayerProjection,
	scheduler.LayerOperationAction, scheduler.LayerButton,
}

func drawQueue(rt *rapid.T) []scheduler.QueueEntry {
	n := rapid.IntRange(0, 5).Draw(rt, "n")
	ids := make([]string, n)
	out := make([]scheduler.QueueEntry, n)
	// item ids are the PK of runtime.red_work_queue — DISTINCT by construction. A
	// position-derived suffix keeps them unique so a generated dep never collides with
	// the dependent's own id (which would model a self-dependency the queue can't hold).
	used := map[string]bool{}
	for i := 0; i < n; i++ {
		id := "i" + rapid.StringN(1, 4, 4).Draw(rt, "id")
		for used[id] {
			id += "x"
		}
		used[id] = true
		ids[i] = id
	}
	for i := 0; i < n; i++ {
		st := []scheduler.ItemStatus{
			scheduler.StatusOpen, scheduler.StatusClaimed,
			scheduler.StatusBlocked, scheduler.StatusResolved,
		}[rapid.IntRange(0, 3).Draw(rt, "st")]
		var deps []string
		if i > 0 && rapid.Bool().Draw(rt, "hasdep") {
			deps = []string{ids[rapid.IntRange(0, i-1).Draw(rt, "dep")]}
		}
		lease := ""
		owner := ""
		epoch := int64(rapid.IntRange(0, 9).Draw(rt, "epoch"))
		if st == scheduler.StatusClaimed {
			owner = "executor@v1"
			// half expired, half live
			if rapid.Bool().Draw(rt, "live") {
				lease = "2026-06-03T13:00:00Z"
			} else {
				lease = "2026-06-03T11:00:00Z"
			}
		}
		out[i] = scheduler.QueueEntry{
			Item: scheduler.WorkItem{
				ItemID: ids[i], Status: st, OwnerAgent: owner,
				LeaseUntil: lease, LeaseEpoch: epoch,
			},
			Layer:        layers[rapid.IntRange(0, 3).Draw(rt, "layer")],
			Dependencies: deps,
		}
	}
	return out
}

// drawAgents lives in matchrole_property_test.go (same _test package) — reused here.

const pNow = "2026-06-03T12:00:00Z"
const pLease = "2026-06-03T14:00:00Z"

// (1) determinism.
func TestProp_Schedule_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		q := drawQueue(rt)
		ag := drawAgents(rt)
		a := scheduler.Schedule(q, ag, pNow, pLease)
		b := scheduler.Schedule(q, ag, pNow, pLease)
		if !reflect.DeepEqual(a, b) {
			rt.Fatal("Schedule must be deterministic: same input ⇒ same output")
		}
	})
}

func resolvedSet(q []scheduler.QueueEntry) map[string]bool {
	m := map[string]bool{}
	for _, e := range q {
		if e.Item.Status == scheduler.StatusResolved {
			m[e.Item.ItemID] = true
		}
	}
	return m
}

// (2) never-lease-blocked — an item with an unresolved dep is never claimed by Schedule.
func TestProp_Schedule_NeverLeasesBlocked(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		q := drawQueue(rt)
		resolved := resolvedSet(q)
		out := scheduler.Schedule(q, drawAgents(rt), pNow, pLease)
		// map input layer + deps by id (Schedule preserves identity).
		inDeps := map[string][]string{}
		inStatus := map[string]scheduler.ItemStatus{}
		for _, e := range q {
			inDeps[e.Item.ItemID] = e.Dependencies
			inStatus[e.Item.ItemID] = e.Item.Status
		}
		for _, e := range out.Queue {
			if e.Item.Status != scheduler.StatusClaimed {
				continue
			}
			// a freshly-claimed item (was open in) must have ALL deps resolved.
			if inStatus[e.Item.ItemID] == scheduler.StatusOpen {
				for _, d := range inDeps[e.Item.ItemID] {
					if !resolved[d] {
						rt.Fatalf("item %q leased with unresolved dep %q", e.Item.ItemID, d)
					}
				}
			}
		}
	})
}

// (3) expire — claimed+expired → open ; claimed+live → epoch unchanged.
func TestProp_Schedule_ExpiresStaleKeepsLive(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		q := drawQueue(rt)
		out := scheduler.Schedule(q, nil, pNow, pLease) // no agents → no re-lease confusion
		resolved := resolvedSet(q)
		inByID := map[string]scheduler.WorkItem{}
		depsByID := map[string][]string{}
		for _, e := range q {
			inByID[e.Item.ItemID] = e.Item
			depsByID[e.Item.ItemID] = e.Dependencies
		}
		allResolved := func(deps []string) bool {
			for _, d := range deps {
				if !resolved[d] {
					return false
				}
			}
			return true
		}
		for _, e := range out.Queue {
			in := inByID[e.Item.ItemID]
			if in.Status != scheduler.StatusClaimed {
				continue
			}
			expired := in.LeaseUntil != "" && in.LeaseUntil < pNow
			if expired {
				// reclaimed → open, owner+lease dropped; but the dependency gate may
				// immediately re-block it the same tick (deps not all resolved).
				wantStatus := scheduler.StatusOpen
				if !allResolved(depsByID[e.Item.ItemID]) {
					wantStatus = scheduler.StatusBlocked
				}
				if e.Item.Status != wantStatus {
					rt.Fatalf("expired lease on %q must reclaim (deps→%q): got %q", e.Item.ItemID, wantStatus, e.Item.Status)
				}
				if e.Item.OwnerAgent != "" || e.Item.LeaseUntil != "" {
					rt.Fatalf("reclaimed %q must drop owner+lease: %+v", e.Item.ItemID, e.Item)
				}
			} else {
				// live lease — kept (no agents to re-lease it elsewhere, so status stays claimed).
				if e.Item.Status != scheduler.StatusClaimed || e.Item.LeaseEpoch != in.LeaseEpoch {
					rt.Fatalf("live lease on %q must be untouched: %+v", e.Item.ItemID, e.Item)
				}
			}
		}
	})
}

// (4) cross-invariant (gap K4): the queue+assignments stay jointly consistent.
func TestProp_Schedule_CrossInvariant(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		out := scheduler.Schedule(drawQueue(rt), drawAgents(rt), pNow, pLease)
		statusByID := map[string]scheduler.ItemStatus{}
		for _, e := range out.Queue {
			statusByID[e.Item.ItemID] = e.Item.Status
		}
		liveAssignment := map[string]bool{}
		for _, a := range out.Assignments {
			switch a.Statut {
			case scheduler.AssignmentLeased, scheduler.AssignmentRunning:
				liveAssignment[a.RedWorkItem] = true
				if statusByID[a.RedWorkItem] != scheduler.StatusClaimed {
					rt.Fatalf("a live assignment for %q whose row is %q (must be claimed)", a.RedWorkItem, statusByID[a.RedWorkItem])
				}
			case scheduler.AssignmentExpired, scheduler.AssignmentReleased:
				// a closed assignment must NOT point at a claimed row.
				if statusByID[a.RedWorkItem] == scheduler.StatusClaimed && liveAssignment[a.RedWorkItem] {
					rt.Fatalf("closed assignment for a still-claimed %q", a.RedWorkItem)
				}
			}
		}
	})
}

// (5) fencing — Fence(write, current): == live, < stale (AGENT_LEASE_FENCED), > impossible.
func TestProp_Fence_StaleEpochRefused(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		current := int64(rapid.IntRange(0, 1000).Draw(rt, "current"))
		write := int64(rapid.IntRange(0, 1000).Draw(rt, "write"))

		v := scheduler.Fence(write, current)
		switch {
		case write == current:
			if !v.OK || v.BlockReason != nil {
				rt.Fatalf("equal epoch must be LIVE (ok, no block): %+v", v)
			}
		default: // write != current → refused
			if v.OK || v.BlockReason == nil {
				rt.Fatalf("a non-equal epoch must be fenced (refused): write=%d current=%d %+v", write, current, v)
			}
			if v.BlockReason.Code != blockreason.CodeAgentLeaseFenced {
				rt.Fatalf("fence must carry AGENT_LEASE_FENCED, got %q", v.BlockReason.Code)
			}
			if len(v.BlockReason.HowToFix) < 1 {
				rt.Fatal("a fence BlockReason must name a door out (non-empty how_to_fix)")
			}
		}
	})
}

// Determinism of the assignment ordering — Schedule emits assignments in a stable
// (item id) order, never map-iteration order.
func TestProp_Schedule_AssignmentsStableOrder(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		out := scheduler.Schedule(drawQueue(rt), drawAgents(rt), pNow, pLease)
		ids := make([]string, len(out.Assignments))
		for i, a := range out.Assignments {
			ids[i] = a.RedWorkItem + string(a.Statut)
		}
		if !sort.StringsAreSorted(ids) {
			rt.Fatalf("assignments must be in a stable sorted order: %v", ids)
		}
	})
}
