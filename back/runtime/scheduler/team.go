// BA25 — MULTI-AGENT coordination in the ordonnanceur (ScheduleTeam).
//
// THE WALL (CLAUDE.md §2). ScheduleTeam is the PURE planner the scheduler role runs each
// tick for an ORCHESTRATION layer's team: it COORDINATES N contending agents under a
// pinned OrchestrationPolicy and COMPUTES the open→claimed transitions + AgentAssignments
// — it writes nothing. The impure shell applies the result under aidos_scheduler
// (UPDATE on exactly the four transition columns, BA20). The wall holds for EVERY member:
// the orchestration coordinates, it never proposes a truth and never lets an agent claim
// (only the scheduler role's UPDATE lands a transition).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). The three BA25 coordination rules are all DECLARED
// algorithms, NEVER an LLM judgment:
//
//   - MaxConcurrency (gap F1): at most the DECLARED cap of live leases — the enforced
//     number is the policy's, never a phantom. (validatePolicy already bounded it by the
//     BA01 spec knob; here it is ENFORCED at lease time.)
//   - same-target conflict (gap F2): two leasable items on the SAME target are SERIALISED
//     — agentlayer.ResolveConflict (the kernel's total, symmetric tie-break: mirror-first,
//     then content-hash, then agent) picks WHO PASSES FIRST; the loser WAITS (stays open),
//     zero lost-update; NextAction is always serialise_then_merge, never a race/coin-flip.
//   - hand-off: the dependency gate (an item leases only when every dependency is resolved)
//     is the BA22 rule, here exercised across N distinct roles — A leases to the role-A
//     agent, B stays blocked until A resolves, then leases to the role-B agent.
//
// Same (queue, agents, policy, now, leaseUntil) ⇒ same result. No clock (now SUPPLIED), no
// rng, no I/O. The reproducibility mirror (team_property_test.go) pins it. ScheduleTeam
// REUSES Schedule's expire/block-unblock and the kernel's ResolveConflict — one
// implementation of each rule, the code is authoritative (§8).
package scheduler

import (
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
)

// TeamScheduleResult is ScheduleTeam's output: the queue after this tick's coordinated
// transitions, the AgentAssignments produced, and the same-target Conflicts it resolved
// (so the orchestrator can serialise+merge the losers). BELOW the line — no Version, no
// Mirror.
type TeamScheduleResult struct {
	Queue       []QueueEntry                    `json:"queue"`
	Assignments []AgentAssignment               `json:"assignments"`
	Conflicts   []agentlayer.ConflictResolution `json:"conflicts"`
}

// ScheduleTeam is the pure MULTI-AGENT lease planner for ONE tick under an
// OrchestrationPolicy. It applies, in order:
//
//  1. EXPIRE + BLOCK/UNBLOCK — identical to BA22 Schedule (reclaim dead leases, recompute
//     the dependency gate). Reused, never re-implemented.
//  2. CONFLICT SERIALISATION (gap F2) — among the leasable open items, any two on the SAME
//     target are a conflict: ResolveConflict (the kernel tie-break) keeps the winner
//     leasable and DROPS the loser from this tick's leasable set (it WAITS, stays open).
//  3. LEASE under the cap (gap F1) — staff the surviving leasable items mirror-first,
//     role-matched (MatchRole), each agent marked busy for the tick, STOPPING once
//     MaxConcurrency live leases (existing-live + freshly-leased) is reached. A policy
//     MaxConcurrency of 0 means "unbounded by the policy" (no cap binds).
//
// It never leases a blocked item, never re-leases a live item, never claims for the agent
// role, never panics. Assignments are returned in a stable order; conflicts in a stable
// (winner-target, loser-id) order.
func ScheduleTeam(queue []QueueEntry, agents []Candidate, policy agentlayer.OrchestrationPolicy, now, leaseUntil string) TeamScheduleResult {
	out := make([]QueueEntry, len(queue))
	copy(out, queue)

	var assignments []AgentAssignment

	// (1) EXPIRE — reclaim dead-agent leases (claimed→open) without human action. Same
	// rule as BA22 Schedule; surfaces an `expired` assignment per reclaimed lease.
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
				LeaseEpoch: it.LeaseEpoch, // epoch is monotone — NOT reset on reclaim (fencing)
			}
		}
	}

	// resolved set (after expiry).
	resolved := map[string]bool{}
	for _, e := range out {
		if e.Item.Status == StatusResolved {
			resolved[e.Item.ItemID] = true
		}
	}

	// (2) BLOCK/UNBLOCK — the dependency gate. An item leases only when EVERY dependency
	// is resolved; otherwise it is surfaced blocked. Drives the hand-off across roles.
	for i := range out {
		st := out[i].Item.Status
		if st != StatusOpen && st != StatusBlocked {
			continue
		}
		if depsResolved(out[i].Dependencies, resolved) {
			if st == StatusBlocked {
				out[i].Item.Status = StatusOpen
			}
		} else {
			out[i].Item.Status = StatusBlocked
		}
	}

	// count the leases already LIVE this tick (claimed, not expired above) — they count
	// against MaxConcurrency, so the cap is over total live leases, never just fresh ones.
	// Also record the targets ALREADY held by a live lease: an open item rendering such a
	// target must NOT lease this tick (zero lost-update — one lease per target at any now).
	liveLeases := 0
	liveTargets := map[string]bool{}
	for i := range out {
		if out[i].Item.Status == StatusClaimed {
			liveLeases++
			if out[i].Target != "" {
				liveTargets[out[i].Target] = true
			}
		}
	}

	// (3) LEASE under conflict-serialisation + the concurrency cap.
	roster := make([]Candidate, len(agents))
	copy(roster, agents)

	var conflicts []agentlayer.ConflictResolution
	// blocked-by-conflict: item ids that LOST a same-target conflict THIS tick — they wait.
	conflictLosers := map[string]bool{}

	for {
		// the concurrency cap binds (0 ⇒ unbounded by the policy).
		if policy.MaxConcurrency > 0 && liveLeases >= policy.MaxConcurrency {
			break
		}

		// the leasable open items this round, MINUS this tick's conflict losers and MINUS
		// any item whose target already carries a LIVE lease (one lease per target).
		var leasable []QueueEntry
		for _, e := range out {
			if e.Item.Status != StatusOpen || conflictLosers[e.Item.ItemID] {
				continue
			}
			if e.Target != "" && liveTargets[e.Target] {
				continue // a live lease already holds this target — wait (zero lost-update)
			}
			leasable = append(leasable, e)
		}
		head, ok := HeadOf(leasable)
		if !ok {
			break
		}

		// CONFLICT SERIALISATION (gap F2): if another leasable item shares the head's
		// target, ResolveConflict decides who passes first. If the head LOSES, it becomes a
		// conflict loser (waits) and we retry; the winner will be staffed in a later round.
		if head.Target != "" {
			rival, isConflict := firstSameTargetRival(leasable, head)
			if isConflict {
				res := agentlayer.ResolveConflict(contenderOf(head), contenderOf(rival))
				conflicts = append(conflicts, res)
				// the loser of THIS pair waits this tick.
				loserID := loserItemID(head, rival, res)
				conflictLosers[loserID] = true
				continue // re-evaluate the leasable head with the loser removed
			}
		}

		owner, matched := MatchRole(head.Item, head.Layer, roster)
		if !matched {
			break // the mirror-first head cannot be staffed → stop (anti-famine surfaces it)
		}
		claimed, asg, err := Claim(head.Item, owner, leaseUntil)
		if err != nil {
			break // defensive: HeadOf only yields open items
		}
		for i := range out {
			if out[i].Item.ItemID == head.Item.ItemID {
				out[i].Item = claimed
				break
			}
		}
		assignments = append(assignments, asg)
		liveLeases++
		if head.Target != "" {
			liveTargets[head.Target] = true // the fresh lease now holds this target too
		}
		for i := range roster {
			if roster[i].Ref == owner {
				roster[i].Free = false
				break
			}
		}
	}

	sortAssignments(assignments)
	sortConflicts(conflicts)
	return TeamScheduleResult{Queue: out, Assignments: assignments, Conflicts: conflicts}
}

// firstSameTargetRival returns the first leasable entry (other than head) that renders the
// SAME non-empty target as head, and whether one exists. Deterministic: leasable comes
// from HeadOf's mirror-first ordering source, scanned in queue order.
func firstSameTargetRival(leasable []QueueEntry, head QueueEntry) (QueueEntry, bool) {
	for _, e := range leasable {
		if e.Item.ItemID == head.Item.ItemID {
			continue
		}
		if e.Target != "" && e.Target == head.Target {
			return e, true
		}
	}
	return QueueEntry{}, false
}

// contenderOf projects a QueueEntry into the kernel's ClaimContender (agent left empty —
// the contender is the ITEM bidding on its target; the conflict tie-break is over
// mirror-rank then content-hash then the item id as the agent-field stand-in). The
// content-hash is the item id (a stable, total identifier) so the tie-break is total.
func contenderOf(e QueueEntry) agentlayer.ClaimContender {
	return agentlayer.ClaimContender{
		Agent:       e.Item.ItemID,
		Target:      e.Target,
		Layer:       string(e.Layer),
		ContentHash: e.Item.ItemID,
	}
}

// loserItemID maps a ConflictResolution back to the losing QueueEntry's item id. The
// contender's Agent field carries the item id (see contenderOf), so the loser's Agent is
// the losing item id.
func loserItemID(_, _ QueueEntry, res agentlayer.ConflictResolution) string {
	return res.Loser.Agent
}

// sortConflicts orders conflicts by (winner target, loser item id) for a stable,
// deterministic hand-off — never map order.
func sortConflicts(c []agentlayer.ConflictResolution) {
	sort.SliceStable(c, func(i, j int) bool {
		if c[i].Winner.Target != c[j].Winner.Target {
			return c[i].Winner.Target < c[j].Winner.Target
		}
		return c[i].Loser.Agent < c[j].Loser.Agent
	})
}
