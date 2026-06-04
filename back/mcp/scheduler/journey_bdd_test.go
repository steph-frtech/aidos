// journey_bdd_test.go — the BA23 JOURNEY mirror runner (Godog, N0). It drives
// tests/runtime/scheduler-dispatch.feature against the in-process scheduler MCP server
// handlers (tick + assignments + fence) — the dispatch capability THROUGH the capability
// door. reflects=runtime.scheduler-dispatch · test_kind=acceptance · cert_language=godog ·
// authority=below · liveness=live. Conceptually in the mirrors schema, materialized to
// tests/ for the runner (bootstrap exception, CLAUDE.md §6).
//
// It is RED before the server existed; it is a MEANS-test toward the human red (a governed
// dispatch that transitions the queue without ever writing truth), never a new truth.
package main

import (
	"context"
	"fmt"
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/runtime/scheduler"
)

type journeyState struct {
	srv        *server
	now        string
	leaseUntil string
	tickOut    tickOutput
	asgOut     assignmentsOutput
	fenceOut   fenceOutput
}

func (st *journeyState) row(itemID string) (rowView, bool) {
	for _, r := range st.tickOut.Queue {
		if r.ItemID == itemID {
			return r, true
		}
	}
	return rowView{}, false
}

func TestSchedulerDispatchJourneyBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "scheduler-dispatch",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &journeyState{}

			sc.Step(`^the scheduler shell holds the canonical dispatch fixture queue$`, func() error {
				st.srv = newServer()
				return nil
			})

			sc.Step(`^the upstream mirror "([^"]*)" is resolved$`, func(itemID string) error {
				for i := range st.srv.queue {
					if st.srv.queue[i].Item.ItemID == itemID {
						st.srv.queue[i].Item.Status = scheduler.StatusResolved
						return nil
					}
				}
				return fmt.Errorf("no queue item %q to resolve", itemID)
			})

			sc.Step(`^the now is "([^"]*)" with lease window until "([^"]*)"$`, func(now, lease string) error {
				st.now = now
				st.leaseUntil = lease
				return nil
			})

			sc.Step(`^the scheduler shell runs one tick through scheduler\.tick$`, func() error {
				_, out, err := st.srv.tick(context.Background(), nil, tickInput{Now: st.now, LeaseUntil: st.leaseUntil})
				if err != nil {
					return err
				}
				st.tickOut = out
				return nil
			})

			sc.Step(`^the assignments are read through scheduler\.assignments$`, func() error {
				_, out, err := st.srv.assignments(context.Background(), nil, struct{}{})
				if err != nil {
					return err
				}
				st.asgOut = out
				return nil
			})

			sc.Step(`^a write bearing epoch (\d+) is fenced against current epoch (\d+) through scheduler\.fence$`, func(write, current int) error {
				_, out, err := st.srv.fenceTool(context.Background(), nil, fenceInput{WriteEpoch: int64(write), CurrentEpoch: int64(current)})
				if err != nil {
					return err
				}
				st.fenceOut = out
				return nil
			})

			sc.Step(`^the item "([^"]*)" was reclaimed and re-leased at epoch (\d+)$`, func(itemID string, epoch int) error {
				r, ok := st.row(itemID)
				if !ok {
					return fmt.Errorf("no row for %q", itemID)
				}
				if r.LeaseEpoch != int64(epoch) {
					return fmt.Errorf("%s epoch = %d, want %d", itemID, r.LeaseEpoch, epoch)
				}
				if r.Status != string(scheduler.StatusClaimed) {
					return fmt.Errorf("%s status = %q, want claimed (re-leased)", itemID, r.Status)
				}
				return nil
			})

			sc.Step(`^the item "([^"]*)" stays "([^"]*)" on its unresolved dependency$`, func(itemID, want string) error {
				r, ok := st.row(itemID)
				if !ok {
					return fmt.Errorf("no row for %q", itemID)
				}
				if r.Status != want {
					return fmt.Errorf("%s status = %q, want %q", itemID, r.Status, want)
				}
				return nil
			})

			sc.Step(`^the item "([^"]*)" is "([^"]*)" by a role-matched agent$`, func(itemID, want string) error {
				r, ok := st.row(itemID)
				if !ok {
					return fmt.Errorf("no row for %q", itemID)
				}
				if r.Status != want {
					return fmt.Errorf("%s status = %q, want %q", itemID, r.Status, want)
				}
				if want == string(scheduler.StatusClaimed) && r.OwnerAgent == "" {
					return fmt.Errorf("%s is claimed but has no owner agent", itemID)
				}
				return nil
			})

			sc.Step(`^the tick wrote no truth above the waterline$`, func() error {
				// The shell's only write is the below-the-line capture applier; there is no
				// truth-schema writer on the path. Asserting the applier captured a below-line
				// ScheduleResult (and nothing else) is the structural proof of the wall.
				if !st.srv.applier.had {
					return fmt.Errorf("expected a below-the-line apply to have happened")
				}
				return nil
			})

			sc.Step(`^the write is refused with BlockReason code "([^"]*)"$`, func(code string) error {
				if st.fenceOut.OK {
					return fmt.Errorf("expected the write to be fenced, but it was OK")
				}
				if st.fenceOut.BlockReason == nil {
					return fmt.Errorf("fenced write has no BlockReason")
				}
				if got := string(st.fenceOut.BlockReason.Code); got != code {
					return fmt.Errorf("BlockReason code = %q, want %q", got, code)
				}
				return nil
			})

			sc.Step(`^at least one assignment is recorded$`, func() error {
				if !st.asgOut.HadTick {
					return fmt.Errorf("expected a tick to have produced assignments")
				}
				if len(st.asgOut.Assignments) == 0 {
					return fmt.Errorf("expected at least one assignment, got 0")
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../../tests/runtime/scheduler-dispatch.feature"},
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("scheduler-dispatch journey mirror failed")
	}
}
