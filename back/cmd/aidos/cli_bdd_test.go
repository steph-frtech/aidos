package main

import (
	"bytes"
	"fmt"
	"strings"
	"testing"

	"github.com/cucumber/godog"
)

// Acceptance mirror (Gherkin/Godog): reflects=runtime.cli, test_kind=acceptance,
// cert_language=gherkin, liveness=live, authority=below.
//
// "aidos <cmd> prints its contract heading and exits 0": one scenario per core
// command, driven by the Scenario Outline data table. The CLI is print-only — it
// writes no truth, touches no Postgres — so no DB handle is in scope. The feature
// conceptually lives in the mirrors schema, materialized at
// tests/runtime/cli_aidos.feature for the runner (the mirrors schema lands at S06;
// until then the file IS the red→green proof — bootstrap exception, CLAUDE.md §6).

type cliBDDState struct {
	command string
	stdout  string
	exit    int
}

func TestAidosCLIBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "aidos-cli",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			state := &cliBDDState{}

			sc.Step(`^the aidos CLI is built$`, func() error {
				// The CLI is the in-process Run dispatcher; "built" means the
				// package compiles, which the test binary already proves.
				return nil
			})
			sc.Step(`^I run "aidos ([a-z]+)"$`, func(command string) error {
				var out bytes.Buffer
				state.command = command
				state.exit = Run([]string{command}, &out)
				state.stdout = out.String()
				return nil
			})
			sc.Step(`^it prints the "([a-z]+)" contract heading$`, func(command string) error {
				heading := fmt.Sprintf("aidos %s", command)
				if !strings.Contains(state.stdout, heading) {
					return fmt.Errorf("stdout for %q does not contain heading %q; got: %q", command, heading, state.stdout)
				}
				return nil
			})
			sc.Step(`^it exits with code (\d+)$`, func(code int) error {
				if state.exit != code {
					return fmt.Errorf("command %q exited %d, want %d", state.command, state.exit, code)
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../../tests/runtime/cli_aidos.feature"},
			TestingT: t,
		},
	}

	if suite.Run() != 0 {
		t.Fatal("BDD scenarios failed")
	}
}
