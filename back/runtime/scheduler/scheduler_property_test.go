package scheduler_test

// Reproducibility mirror (∀) for the BA20 scheduler CLAIM transition + fencing.
// reflects=runtime.red_work_queue (the open→claimed transition) · test_kind=property ·
// cert_language=rapid · liveness=live · authority=below. The claim is a RUNTIME
// transform below the waterline, never a layer/truth.
//
// The invariants (determinism-first, CLAUDE.md §6/§8):
//  1. Claim is DETERMINISTIC + TOTAL: same (item, owner, leaseUntil) ⇒ same Claimed
//     item AND same AgentAssignment (no clock, no rng).
//  2. The lease_epoch is a MONOTONE bump: claimed.LeaseEpoch == item.LeaseEpoch+1, and
//     the assignment pins that same epoch (the fencing token, gap E2).
//  3. open→claimed only: a non-open item is refused (ErrNotOpen), never panics; an
//     empty owner or empty lease is refused (no arg-less clock).
//  4. Claim sets EXACTLY the four scheduler-writable transition columns and leaves the
//     item id intact — UpdateColumns is the Go mirror of the column-scoped GRANT.
//  5. AgentAssignment is unrepresentable as a layer: NO Version, NO Mirror field
//     (a lease is a runtime event, not truth).

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/scheduler"
	"pgregory.net/rapid"
)

func drawOpenItem(rt *rapid.T) scheduler.WorkItem {
	return scheduler.WorkItem{
		ItemID:     rapid.StringN(1, 16, 16).Draw(rt, "item_id"),
		Status:     scheduler.StatusOpen,
		LeaseEpoch: rapid.Int64Range(0, 1_000_000).Draw(rt, "epoch"),
	}
}

// (1) deterministic + total, and (2) monotone epoch bump.
func TestProp_Claim_DeterministicAndMonotone(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		item := drawOpenItem(rt)
		owner := rapid.StringN(1, 12, 12).Draw(rt, "owner")
		lease := "2026-06-03T12:00:00Z"

		a1, asg1, err := scheduler.Claim(item, owner, lease)
		if err != nil {
			rt.Fatalf("Claim of an open item must succeed: %v", err)
		}
		a2, asg2, err := scheduler.Claim(item, owner, lease)
		if err != nil {
			rt.Fatalf("Claim must be total: %v", err)
		}
		if !reflect.DeepEqual(a1, a2) || !reflect.DeepEqual(asg1, asg2) {
			rt.Fatal("Claim must be deterministic: same input ⇒ same outputs")
		}
		if a1.Status != scheduler.StatusClaimed {
			rt.Fatalf("open must transition to claimed, got %q", a1.Status)
		}
		if a1.LeaseEpoch != item.LeaseEpoch+1 {
			rt.Fatalf("lease_epoch must bump by exactly 1: %d -> %d", item.LeaseEpoch, a1.LeaseEpoch)
		}
		if asg1.LeaseEpoch != a1.LeaseEpoch {
			rt.Fatalf("the assignment must pin the item's bumped epoch: %d != %d", asg1.LeaseEpoch, a1.LeaseEpoch)
		}
		if asg1.Statut != scheduler.AssignmentLeased {
			rt.Fatalf("a fresh claim must lease: %q", asg1.Statut)
		}
		if asg1.Agent != owner || asg1.RedWorkItem != item.ItemID {
			rt.Fatal("the assignment must point at the owner + claimed item")
		}
	})
}

// (3) open→claimed only; refuses non-open / empty owner / empty lease, never panics.
func TestProp_Claim_RefusesNonOpenAndEmpties(t *testing.T) {
	notOpen := []scheduler.ItemStatus{scheduler.StatusClaimed, scheduler.StatusBlocked, scheduler.StatusResolved}
	rapid.Check(t, func(rt *rapid.T) {
		// non-open is refused with ErrNotOpen
		st := notOpen[rapid.IntRange(0, len(notOpen)-1).Draw(rt, "st")]
		item := scheduler.WorkItem{ItemID: "x", Status: st}
		if _, _, err := scheduler.Claim(item, "agent@v1", "2026-06-03T12:00:00Z"); err == nil {
			rt.Fatalf("a %q item must NOT be claimable (only open→claimed)", st)
		}
		// empty owner is refused
		open := scheduler.WorkItem{ItemID: "y", Status: scheduler.StatusOpen}
		if _, _, err := scheduler.Claim(open, "", "2026-06-03T12:00:00Z"); err == nil {
			rt.Fatal("an empty owner must be refused")
		}
		// empty lease is refused (no arg-less clock)
		if _, _, err := scheduler.Claim(open, "agent@v1", ""); err == nil {
			rt.Fatal("an empty lease_until must be refused")
		}
	})
}

// (4) Claim sets exactly the four transition columns; the item id is untouched.
func TestProp_Claim_OnlyTransitionColumns(t *testing.T) {
	if got, want := len(scheduler.UpdateColumns), 4; got != want {
		t.Fatalf("the scheduler writes exactly %d transition columns, got %d: %v", want, got, scheduler.UpdateColumns)
	}
	want := map[string]bool{"status": true, "owner_agent": true, "lease_until": true, "lease_epoch": true}
	for _, c := range scheduler.UpdateColumns {
		if !want[c] {
			t.Fatalf("UpdateColumns lists a non-transition column %q", c)
		}
	}
	rapid.Check(t, func(rt *rapid.T) {
		item := drawOpenItem(rt)
		claimed, _, err := scheduler.Claim(item, "agent@v1", "2026-06-03T12:00:00Z")
		if err != nil {
			rt.Fatalf("claim: %v", err)
		}
		if claimed.ItemID != item.ItemID {
			rt.Fatal("Claim must NOT rewrite the item id (immutable identity)")
		}
	})
}

// (5) AgentAssignment is not a layer: NO Version, NO Mirror field. Structural.
func TestProp_Assignment_NotALayer(t *testing.T) {
	ty := reflect.TypeOf(scheduler.AgentAssignment{})
	for i := 0; i < ty.NumField(); i++ {
		name := ty.Field(i).Name
		if name == "Version" || name == "Mirror" {
			t.Fatalf("AgentAssignment must NOT carry a %q field — a lease is a runtime event, not truth", name)
		}
	}
}
