package scheduler_test

// BA25 — MULTI-AGENT coordination invariants (∀ property mirror).
// reflects=runtime.scheduler-team · test_kind=property · cert_language=rapid ·
// liveness=live · authority=below. ScheduleTeam is PURE: same (queue, agents, policy,
// now, leaseUntil) ⇒ same result. No clock (now SUPPLIED), no rng, no I/O.
//
// Invariants (determinism-first, CLAUDE.md §6/§8):
//   1. determinism — same inputs ⇒ byte-identical ScheduleTeam outputs.
//   2. declared-concurrency — the number of LIVE leases NEVER exceeds the policy's
//      MaxConcurrency (gap F1; a cap of 0 = unbounded, so only > 0 is asserted).
//   3. at-most-one-lease-per-item — every item id appears at most once as a claimed row;
//      a claimed-live item the tick started with is never silently re-leased.
//   4. zero-lost-update on a shared target — at most ONE live lease per target at any
//      `now`; the conflict loser stays open (waits), its work is never thrown away.
//   5. never-lease-blocked — an item with an unresolved dependency is never claimed.

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/runtime/scheduler"
	"pgregory.net/rapid"
)

const tNow = "2026-06-04T12:00:00Z"
const tLease = "2026-06-04T14:00:00Z"

// drawTeamQueue draws a queue where SOME items share a target (to exercise the conflict
// path), reusing the same status/dep generation shape as drawQueue.
func drawTeamQueue(rt *rapid.T) []scheduler.QueueEntry {
	q := drawQueue(rt)
	// a small pool of targets; "" means no target contention. Re-using a target across
	// OPEN/blocked/resolved items models a same-file conflict the scheduler must serialise.
	// A pre-CLAIMED item gets a UNIQUE live target instead: two pre-claimed-live items on
	// the SAME target is MALFORMED input the scheduler never PRODUCES (it would already be
	// a lost-update), so we don't generate it — we test what the scheduler CREATES.
	sharedTargets := []string{"", "", "src/a.go", "src/b.go"}
	for i := range q {
		if q[i].Item.Status == scheduler.StatusClaimed {
			// a unique live target + a live (or expiring) lease relative to tNow.
			q[i].Target = "claimed-" + q[i].Item.ItemID
			q[i].Item.OwnerAgent = "executor@v1"
			if rapid.Bool().Draw(rt, "liveTeam") {
				q[i].Item.LeaseUntil = "2026-06-04T15:00:00Z" // > tNow → live
			} else {
				q[i].Item.LeaseUntil = "2026-06-04T09:00:00Z" // < tNow → expires
			}
		} else {
			q[i].Target = sharedTargets[rapid.IntRange(0, len(sharedTargets)-1).Draw(rt, "target")]
		}
	}
	return q
}

func drawPolicy(rt *rapid.T) agentlayer.OrchestrationPolicy {
	return agentlayer.OrchestrationPolicy{
		ClaimArbitrage:     agentlayer.ConflictSerialiseThenMerge,
		FanOut:             agentlayer.FanModeParallel,
		FanIn:              agentlayer.FanModeSequential,
		ConflitMemeFichier: agentlayer.ConflictSerialiseThenMerge,
		MaxConcurrency:     rapid.IntRange(0, 4).Draw(rt, "maxConcurrency"),
	}
}

// (1) determinism — same inputs ⇒ identical results.
func TestProp_ScheduleTeam_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		q := drawTeamQueue(rt)
		agents := drawAgents(rt)
		pol := drawPolicy(rt)
		a := scheduler.ScheduleTeam(q, agents, pol, tNow, tLease)
		b := scheduler.ScheduleTeam(q, agents, pol, tNow, tLease)
		if !reflect.DeepEqual(a, b) {
			rt.Fatalf("ScheduleTeam not deterministic:\n a=%+v\n b=%+v", a, b)
		}
	})
}

// (2) declared-concurrency — live leases never exceed MaxConcurrency (when > 0).
func TestProp_ScheduleTeam_RespectsMaxConcurrency(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		q := drawTeamQueue(rt)
		agents := drawAgents(rt)
		pol := drawPolicy(rt)
		out := scheduler.ScheduleTeam(q, agents, pol, tNow, tLease)
		// count pre-existing LIVE leases (claimed + lease_until >= now) that survive expiry
		// — they are the INPUT's, the scheduler did not create them and cannot un-lease them.
		preLive := 0
		for _, e := range q {
			if e.Item.Status == scheduler.StatusClaimed && e.Item.LeaseUntil >= tNow {
				preLive++
			}
		}
		live := 0
		for _, e := range out.Queue {
			if e.Item.Status == scheduler.StatusClaimed {
				live++
			}
		}
		// gap F1: the scheduler never CREATES a lease that pushes live past the cap. The
		// ceiling is max(cap, preLive): a sub-cap queue stays ≤ cap; an already-over-cap
		// input (malformed) is never made worse (the scheduler adds no fresh lease).
		if pol.MaxConcurrency > 0 {
			ceiling := pol.MaxConcurrency
			if preLive > ceiling {
				ceiling = preLive
			}
			if live > ceiling {
				rt.Fatalf("live leases %d exceed ceiling %d (cap %d, preLive %d)", live, ceiling, pol.MaxConcurrency, preLive)
			}
		}
	})
}

// (3) at-most-one-lease-per-item — no item id is claimed twice; live items kept.
func TestProp_ScheduleTeam_AtMostOneLeasePerItem(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		q := drawTeamQueue(rt)
		agents := drawAgents(rt)
		pol := drawPolicy(rt)
		out := scheduler.ScheduleTeam(q, agents, pol, tNow, tLease)
		seen := map[string]int{}
		for _, e := range out.Queue {
			seen[e.Item.ItemID]++
			if seen[e.Item.ItemID] > 1 {
				rt.Fatalf("item %q appears %d times in the queue", e.Item.ItemID, seen[e.Item.ItemID])
			}
		}
		// a live-leased item the tick started with (lease_until >= now) keeps its lease.
		for _, in := range q {
			if in.Item.Status == scheduler.StatusClaimed && in.Item.LeaseUntil >= tNow {
				outE := findEntry(t, out.Queue, in.Item.ItemID)
				if outE.Item.Status != scheduler.StatusClaimed || outE.Item.OwnerAgent != in.Item.OwnerAgent || outE.Item.LeaseEpoch != in.Item.LeaseEpoch {
					rt.Fatalf("live item %q must keep its lease: got %+v", in.Item.ItemID, outE.Item)
				}
			}
		}
	})
}

// (4) zero-lost-update — at most one LIVE lease per non-empty target at any now.
func TestProp_ScheduleTeam_AtMostOneLeasePerTarget(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		q := drawTeamQueue(rt)
		agents := drawAgents(rt)
		pol := drawPolicy(rt)
		out := scheduler.ScheduleTeam(q, agents, pol, tNow, tLease)
		perTarget := map[string]int{}
		for _, e := range out.Queue {
			if e.Item.Status == scheduler.StatusClaimed && e.Target != "" {
				perTarget[e.Target]++
				if perTarget[e.Target] > 1 {
					rt.Fatalf("target %q has %d live leases (lost-update)", e.Target, perTarget[e.Target])
				}
			}
		}
	})
}

// (5) never-lease-blocked — an unresolved-dependency item is never claimed.
func TestProp_ScheduleTeam_NeverLeasesBlocked(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		q := drawTeamQueue(rt)
		agents := drawAgents(rt)
		pol := drawPolicy(rt)
		out := scheduler.ScheduleTeam(q, agents, pol, tNow, tLease)
		resolved := map[string]bool{}
		inStatus := map[string]scheduler.ItemStatus{}
		for _, e := range q {
			inStatus[e.Item.ItemID] = e.Item.Status
		}
		for _, e := range out.Queue {
			if e.Item.Status == scheduler.StatusResolved {
				resolved[e.Item.ItemID] = true
			}
		}
		for _, e := range out.Queue {
			if e.Item.Status != scheduler.StatusClaimed {
				continue
			}
			// only a FRESHLY-leased item (was open in the input) must have all deps
			// resolved — a pre-claimed item is the input's own (the scheduler did not
			// create it; BA22 Schedule treats it the same).
			if inStatus[e.Item.ItemID] != scheduler.StatusOpen {
				continue
			}
			for _, d := range e.Dependencies {
				if !resolved[d] {
					rt.Fatalf("item %q FRESHLY leased with unresolved dep %q", e.Item.ItemID, d)
				}
			}
		}
	})
}
