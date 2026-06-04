// Package scheduler is the runtime ORDONNANCEUR primitive (BA20): the pure, total
// transition a RedWorkItem undergoes when the (distinct, privileged-only-here)
// scheduler role claims it — open→claimed — and the AgentAssignment it produces,
// carrying the monotone LeaseEpoch fencing token (gap E2).
//
// THE WALL (CLAUDE.md §2). The scheduler is the ONLY role that may transition a
// RedWorkItem: the S22 migration delivers runtime.red_work_queue WRITE-ONLY to the
// agent (INSERT+SELECT, NO UPDATE), so the agent records its worklist but cannot
// claim it. The BA20 migration (scheduler_role_baseline.sql) creates aidos_scheduler
// with UPDATE on exactly {status, owner_agent, lease_until, lease_epoch} and SELECT on
// kernel.agent_layer (read the CoucheAgent specs for MatchRole, gap E4) — and NO write
// on any truth schema. This package is the deterministic core that COMPUTES the
// transition; the impure shell that issues the UPDATE under that role is BA22.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Claim is a pure function: no clock (leaseUntil
// is SUPPLIED), no rng, no I/O. A claim is a deterministic transform of (item, owner,
// leaseUntil) — never an LLM judgment. Same input ⇒ same Claimed item + same
// AgentAssignment (the reproducibility mirror pins it). The epoch is bumped by a
// declared rule (prevEpoch+1), never learned.
package scheduler

import "fmt"

// ItemStatus is the closed lifecycle of a RedWorkItem in runtime.red_work_queue
// (S22 §49.4). BA20 implements exactly the open→claimed transition; blocked/resolved
// are honoured by later steps (BA22).
type ItemStatus string

const (
	StatusOpen     ItemStatus = "open"
	StatusClaimed  ItemStatus = "claimed"
	StatusBlocked  ItemStatus = "blocked"
	StatusResolved ItemStatus = "resolved"
)

// AssignmentStatus is the closed status of an AgentAssignment (mirrors the S52 enum).
type AssignmentStatus string

const (
	AssignmentLeased   AssignmentStatus = "leased"
	AssignmentRunning  AssignmentStatus = "running"
	AssignmentReleased AssignmentStatus = "released"
	AssignmentExpired  AssignmentStatus = "expired"
)

// WorkItem is the scheduler's view of one runtime.red_work_queue row — only the
// fields a claim reads or writes. The immutable identity columns (target, reason,
// wave_id, dependencies, created_at) are NOT here: the scheduler cannot rewrite them
// (the column-scoped GRANT enforces it), so the transition core never touches them.
type WorkItem struct {
	ItemID     string     `json:"item_id"`
	Status     ItemStatus `json:"status"`
	OwnerAgent string     `json:"owner_agent"` // empty until claimed
	LeaseUntil string     `json:"lease_until"` // RFC3339, empty until leased
	LeaseEpoch int64      `json:"lease_epoch"` // monotone fencing token; 0 = never leased
}

// AgentAssignment leases a RedWorkItem to an agent for a bounded window. It carries
// the LeaseEpoch fencing token (BA20, gap E2) — the write-path (BA22) refuses any
// agent write bearing a STALE epoch, so a woken-late agent cannot lost-update an item
// that has been re-leased. BELOW the line; not a layer (no Version, no Mirror).
type AgentAssignment struct {
	Agent       string           `json:"agent"`         // the CoucheAgent @version
	RedWorkItem string           `json:"red_work_item"` // the item_id leased
	LeaseJusqua string           `json:"lease_jusqua"`  // RFC3339, SUPPLIED (no arg-less clock)
	LeaseEpoch  int64            `json:"lease_epoch"`   // == the item's bumped epoch (BA20 fencing)
	Statut      AssignmentStatus `json:"statut"`        // leased | running | released | expired
}

// Claim errors — Claim is total: it returns an error rather than panicking.
var (
	// ErrNotOpen — Claim was handed an item that is not open (only open→claimed is legal here).
	ErrNotOpen = fmt.Errorf("scheduler: only an open item may be claimed")
	// ErrEmptyOwner — a claim needs an owning agent ref.
	ErrEmptyOwner = fmt.Errorf("scheduler: claim needs a non-empty owner agent")
	// ErrEmptyLease — a claim needs a supplied lease expiry (no arg-less clock here).
	ErrEmptyLease = fmt.Errorf("scheduler: claim needs a supplied lease_until")
)

// Claim is the PURE, TOTAL transition a RedWorkItem undergoes when the scheduler role
// claims it: open→claimed, stamping owner_agent, lease_until and a BUMPED, monotone
// lease_epoch (prev+1 — the fencing token). It returns the transitioned item AND the
// AgentAssignment that pins the lease at that same epoch. No clock, no rng, no I/O;
// same (item, owner, leaseUntil) ⇒ same outputs (the reproducibility mirror pins it).
//
// It refuses (returns an error, never a panic) a non-open item, an empty owner, or an
// empty lease — the four transition columns the scheduler role is the ONLY one allowed
// to write are exactly the ones Claim sets.
func Claim(item WorkItem, owner string, leaseUntil string) (WorkItem, AgentAssignment, error) {
	if item.Status != StatusOpen {
		return WorkItem{}, AgentAssignment{}, fmt.Errorf("%w: item %q is %q", ErrNotOpen, item.ItemID, item.Status)
	}
	if owner == "" {
		return WorkItem{}, AgentAssignment{}, ErrEmptyOwner
	}
	if leaseUntil == "" {
		return WorkItem{}, AgentAssignment{}, ErrEmptyLease
	}

	epoch := item.LeaseEpoch + 1 // monotone bump — the fencing token (declared rule, never learned)

	claimed := WorkItem{
		ItemID:     item.ItemID,
		Status:     StatusClaimed,
		OwnerAgent: owner,
		LeaseUntil: leaseUntil,
		LeaseEpoch: epoch,
	}
	assignment := AgentAssignment{
		Agent:       owner,
		RedWorkItem: item.ItemID,
		LeaseJusqua: leaseUntil,
		LeaseEpoch:  epoch,
		Statut:      AssignmentLeased,
	}
	return claimed, assignment, nil
}

// UpdateColumns is the exact, ordered set of runtime.red_work_queue columns the
// scheduler role (and ONLY the scheduler role) may write. It is the Go-side mirror of
// the column-scoped GRANT in scheduler_role_baseline.sql — the migration GRANT and
// this constant must list the same four columns (the roundtrip+GRANT mirror asserts
// the GRANT; this keeps the impure shell honest about what it writes).
var UpdateColumns = []string{"status", "owner_agent", "lease_until", "lease_epoch"}
