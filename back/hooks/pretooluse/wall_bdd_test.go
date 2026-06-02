package main

import (
	"fmt"
	"testing"

	"github.com/cucumber/godog"
)

// Acceptance mirror runner (Godog, N0): drives tests/runtime/wall.feature against
// the in-process Evaluate dispatcher. The wall is print-only at the hook level —
// it classifies an event, it touches no Postgres (the DB level is proven by the
// Testcontainers fault-injection in wall_grant_injection_test.go). The feature
// conceptually lives in the mirrors schema, materialized to tests/ (mirrors lands
// at S06 — bootstrap exception, CLAUDE.md §6).

type wallBDDState struct {
	actor   string
	event   Event
	verdict Verdict
	reason  *BlockReason
}

func TestWallBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "the-wall",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &wallBDDState{}

			sc.Step(`^the actor is the "([^"]*)" role$`, func(role string) error {
				st.actor = role
				st.event = Event{Actor: role, Tool: "Write"}
				return nil
			})
			sc.Step(`^a PreToolUse event targeting a write to the "([^"]*)" schema$`, func(schema string) error {
				st.event.Schema = schema
				return nil
			})
			sc.Step(`^a PreToolUse event targeting a write to "([^"]*)"$`, func(path string) error {
				st.event.Path = path
				return nil
			})
			sc.Step(`^the PreToolUse hook evaluates the event$`, func() error {
				d := Evaluate(st.event)
				st.verdict = d.Verdict
				st.reason = d.BlockReason
				return nil
			})
			sc.Step(`^the verdict is "([^"]*)"$`, func(want string) error {
				if string(st.verdict) != want {
					return fmt.Errorf("verdict = %q, want %q", st.verdict, want)
				}
				return nil
			})
			sc.Step(`^the BlockReason code is "([^"]*)"$`, func(want string) error {
				if st.reason == nil {
					return fmt.Errorf("no BlockReason; want code %q", want)
				}
				if string(st.reason.Code) != want {
					return fmt.Errorf("BlockReason code = %q, want %q", st.reason.Code, want)
				}
				return nil
			})
			sc.Step(`^the BlockReason carries a non-empty how_to_fix path$`, func() error {
				if st.reason == nil || len(st.reason.HowToFix) == 0 {
					return fmt.Errorf("how_to_fix is empty")
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../../tests/runtime/wall.feature"},
			TestingT: t,
		},
	}

	if suite.Run() != 0 {
		t.Fatal("wall BDD scenarios failed")
	}
}
