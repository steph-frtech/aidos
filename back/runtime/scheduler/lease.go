// BA22 — the lease/expire ENGINE + write-path FENCING.
//
// THE WALL (CLAUDE.md §2). Schedule is the PURE planner the scheduler role runs each
// tick: it COMPUTES the open→claimed / claimed→open transitions and the AgentAssignments,
// it writes nothing. The impure shell (the tick driver below, and the BA23 MCP server)
// applies the result under the aidos_scheduler role — UPDATE on exactly the four
// transition columns of runtime.red_work_queue, SELECT on kernel.agent_layer, NO write on
// any truth schema (scheduler_role_baseline.sql, BA20). The agent role still cannot
// transition (INSERT+SELECT only) — Schedule never lets the agent claim.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Schedule is a pure, total function of
// (queue, agents, now, leaseUntil): no clock (now is SUPPLIED by the tick driver, the
// ONLY impure shell), no rng, no I/O. Same input ⇒ same (queue, assignments). The lease
// epoch bump, the expire rule (lease_until < now), the dependency gate (all deps
// resolved), and the staffing choice (mirror-first head, role-matched, lex-smallest free
// agent) are all DECLARED rules — never an LLM judgment. The reproducibility mirror
// (lease_property_test.go) pins it. Fence is the deterministic epoch comparator.
package scheduler

import (
	"sort"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// ScheduleResult is the pure planner's output: the queue after this tick's transitions,
// plus the AgentAssignments the tick produced (fresh leases + expired-lease markers). It
// is a HAND-OFF: the impure shell applies the queue transitions under the scheduler role
// and records the assignments. BELOW the line — no Version, no Mirror.
type ScheduleResult struct {
	Queue       []QueueEntry      `json:"queue"`
	Assignments []AgentAssignment `json:"assignments"`
}

// Schedule is the pure lease/expire planner for ONE tick. Given the queue, the candidate
// agents, the SUPPLIED now (RFC3339, from the tick driver) and the lease expiry to stamp
// on fresh leases, it returns the transitioned queue + the assignments. The rules, in order:
//
//  1. EXPIRE — every claimed item whose lease_until is non-empty and < now is reclaimed
//     (claimed→open, owner+lease dropped); its dead lease surfaces an `expired` assignment.
//     This is the anti-dead-agent reclaim (gap E1): it happens at the tick, no human click.
//  2. BLOCK/UNBLOCK — an open (or already-blocked) item whose Dependencies are not ALL
//     resolved is surfaced `blocked`; one whose deps are all resolved is leasable.
//  3. LEASE — among the now-leasable open items, the mirror-first head is staffed to its
//     role-matched agent (lex-smallest free agent of the layer's role, MatchRole); that
//     agent is then marked busy for the rest of this tick so two heads never take it.
//     Repeats until no leasable head can be staffed (a free matching agent runs out).
//
// It never leases a blocked item, never claims for the agent role, never panics. The
// assignments are returned in a stable (item id, then statut) order — never map order.
func Schedule(queue []QueueEntry, agents []Candidate, now, leaseUntil string) ScheduleResult {
	// Work on a copy — Schedule never mutates the caller's slice.
	out := make([]QueueEntry, len(queue))
	copy(out, queue)

	var assignments []AgentAssignment

	// (1) EXPIRE stale leases first — reclaim dead-agent items without human action.
	for i := range out {
		it := out[i].Item
		if it.Status == StatusClaimed && it.LeaseUntil != "" && it.LeaseUntil < now {
			assignments = append(assignments, AgentAssignment{
				Agent:       it.OwnerAgent,
				RedWorkItem: it.ItemID,
				LeaseJusqua: it.LeaseUntil,
				LeaseEpoch:  it.LeaseEpoch,
				Statut:      AssignmentExpired,
			})
			out[i].Item = WorkItem{
				ItemID:     it.ItemID,
				Status:     StatusOpen,
				OwnerAgent: "",
				LeaseUntil: "",
				LeaseEpoch: it.LeaseEpoch, // epoch is monotone — NOT reset on reclaim (fencing)
			}
		}
	}

	// resolved set (after expiry — expiry never produces a resolved).
	resolved := map[string]bool{}
	for _, e := range out {
		if e.Item.Status == StatusResolved {
			resolved[e.Item.ItemID] = true
		}
	}

	// (2) BLOCK/UNBLOCK — recompute the dependency gate for open/blocked items.
	for i := range out {
		st := out[i].Item.Status
		if st != StatusOpen && st != StatusBlocked {
			continue
		}
		if depsResolved(out[i].Dependencies, resolved) {
			if st == StatusBlocked {
				out[i].Item.Status = StatusOpen // unblocked: deps are now all resolved
			}
		} else {
			out[i].Item.Status = StatusBlocked
		}
	}

	// (3) LEASE — staff leasable open items mirror-first, role-matched, greedily.
	// A local mutable roster lets a leased agent become busy for the rest of the tick.
	roster := make([]Candidate, len(agents))
	copy(roster, agents)

	for {
		// the leasable open items this round (status open, after the gate).
		var leasable []QueueEntry
		for _, e := range out {
			if e.Item.Status == StatusOpen {
				leasable = append(leasable, e)
			}
		}
		head, ok := HeadOf(leasable)
		if !ok {
			break
		}
		owner, matched := MatchRole(head.Item, head.Layer, roster)
		if !matched {
			break // the mirror-first head cannot be staffed → stop (anti-famine surfaces it)
		}
		claimed, asg, err := Claim(head.Item, owner, leaseUntil)
		if err != nil {
			break // defensive: HeadOf only yields open items, so this is unreachable
		}
		// apply the claim in the queue
		for i := range out {
			if out[i].Item.ItemID == head.Item.ItemID {
				out[i].Item = claimed
				break
			}
		}
		assignments = append(assignments, asg)
		// mark the chosen agent busy for the rest of this tick
		for i := range roster {
			if roster[i].Ref == owner {
				roster[i].Free = false
				break
			}
		}
	}

	sortAssignments(assignments)
	return ScheduleResult{Queue: out, Assignments: assignments}
}

// depsResolved is true iff every dependency id is in the resolved set. No deps ⇒ true.
func depsResolved(deps []string, resolved map[string]bool) bool {
	for _, d := range deps {
		if !resolved[d] {
			return false
		}
	}
	return true
}

// sortAssignments orders assignments by (RedWorkItem, Statut) for a stable, deterministic
// hand-off — never map-iteration order.
func sortAssignments(a []AgentAssignment) {
	sort.SliceStable(a, func(i, j int) bool {
		if a[i].RedWorkItem != a[j].RedWorkItem {
			return a[i].RedWorkItem < a[j].RedWorkItem
		}
		return a[i].Statut < a[j].Statut
	})
}

// FenceVerdict is the result of the write-path epoch fence: OK iff the write may land,
// else a non-nil BlockReason (AGENT_LEASE_FENCED) naming the door out. BELOW the line.
type FenceVerdict struct {
	OK          bool                     `json:"ok"`
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// Fence is the deterministic write-path FENCING comparator (gap E2). An agent write
// carries the LeaseEpoch it was granted; the item's CURRENT lease_epoch is the truth. The
// rule, total and never panicking:
//
//   - writeEpoch == currentEpoch ⇒ LIVE: the write may land (OK, no BlockReason).
//   - writeEpoch <  currentEpoch ⇒ STALE: the item was re-leased since (an agent woken
//     late after its lease expired) — refused with AGENT_LEASE_FENCED to prevent a
//     lost update.
//   - writeEpoch >  currentEpoch ⇒ IMPOSSIBLE: no write may bear a future epoch (the
//     scheduler alone bumps it) — refused too, fail-closed.
//
// It is the Go-side mirror of the scheduler-role UPDATE's own `WHERE lease_epoch =
// $writeEpoch` guard: the same deterministic compare, never an LLM judgment (§8).
func Fence(writeEpoch, currentEpoch int64) FenceVerdict {
	if writeEpoch == currentEpoch {
		return FenceVerdict{OK: true}
	}
	br := blockreason.For(blockreason.CodeAgentLeaseFenced)
	return FenceVerdict{OK: false, BlockReason: &br}
}
