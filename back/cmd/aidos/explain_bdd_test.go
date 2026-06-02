package main

import (
	"bytes"
	"fmt"
	"strings"
	"testing"

	"github.com/cucumber/godog"
)

// Acceptance mirror (Gherkin/Godog): reflects=runtime.blockreason,
// test_kind=acceptance, cert_language=gherkin, liveness=live, authority=below.
//
// "Every block explains itself and how to fix it" (S13): one scenario per canonical
// BlockReason code, driving the in-process `aidos explain <code>` dispatcher and
// asserting the rendered code / severity / explanation / how_to_fix path. The
// feature conceptually lives in the mirrors schema, materialized at
// tests/runtime/blockreason_explain.feature for the runner (the mirrors schema
// lands at S06; until then the file IS the red->green proof — bootstrap exception,
// CLAUDE.md §6).
//
// This is a means-test toward the human red (KRD §44.5), not a new truth:
// BlockReason stays below the waterline.

type explainBDDState struct {
	code   string
	stdout string
	exit   int
}

func (s *explainBDDState) run() {
	var out bytes.Buffer
	s.exit = Run([]string{"explain", s.code}, &out)
	s.stdout = out.String()
}

func TestBlockReasonExplainBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "aidos-explain-blockreason",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			state := &explainBDDState{}

			sc.Step(`^a block with code "([^"]+)"$`, func(code string) error {
				state.code = code
				return nil
			})
			sc.Step(`^I run "aidos explain" on that block$`, func() error {
				state.run()
				return nil
			})
			sc.Step(`^the output shows the code "([^"]+)"$`, func(code string) error {
				if !strings.Contains(state.stdout, code) {
					return fmt.Errorf("stdout does not contain code %q; got: %q", code, state.stdout)
				}
				return nil
			})
			sc.Step(`^the output shows a non-empty severity$`, func() error {
				// The render labels severity with the canonical "severity" field key.
				if !strings.Contains(strings.ToLower(state.stdout), "severity") &&
					!strings.Contains(strings.ToLower(state.stdout), "severite") {
					return fmt.Errorf("stdout shows no severity field; got: %q", state.stdout)
				}
				if !strings.Contains(state.stdout, "blocking") {
					return fmt.Errorf("stdout shows no severity value; got: %q", state.stdout)
				}
				return nil
			})
			sc.Step(`^the output shows a human explanation$`, func() error {
				if !strings.Contains(strings.ToLower(state.stdout), "explanation") &&
					!strings.Contains(strings.ToLower(state.stdout), "explication") {
					return fmt.Errorf("stdout shows no explanation field; got: %q", state.stdout)
				}
				return nil
			})
			sc.Step(`^the output lists at least one how_to_fix step$`, func() error {
				if !strings.Contains(state.stdout, "how_to_fix") {
					return fmt.Errorf("stdout shows no how_to_fix list; got: %q", state.stdout)
				}
				// At least one numbered step (the render numbers fix steps "  1.").
				if !strings.Contains(state.stdout, "1.") {
					return fmt.Errorf("stdout lists no numbered fix step; got: %q", state.stdout)
				}
				return nil
			})
			sc.Step(`^a how_to_fix step is "([^"]+)"$`, func(step string) error {
				if !strings.Contains(state.stdout, step) {
					return fmt.Errorf("how_to_fix does not contain step %q; got: %q", step, state.stdout)
				}
				return nil
			})
			sc.Step(`^a how_to_fix step names the in-scope target or its owner$`, func() error {
				lower := strings.ToLower(state.stdout)
				if !strings.Contains(lower, "scope") && !strings.Contains(lower, "périmètre") &&
					!strings.Contains(lower, "perimetre") && !strings.Contains(lower, "owner") &&
					!strings.Contains(lower, "propriétaire") && !strings.Contains(lower, "proprietaire") {
					return fmt.Errorf("how_to_fix does not name the in-scope target or owner; got: %q", state.stdout)
				}
				return nil
			})
			sc.Step(`^the command exits with code (\d+)$`, func(code int) error {
				if state.exit != code {
					return fmt.Errorf("exit code = %d, want %d; stdout: %q", state.exit, code, state.stdout)
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../../tests/runtime/blockreason_explain.feature"},
			TestingT: t,
		},
	}

	if suite.Run() != 0 {
		t.Fatal("BDD scenarios failed")
	}
}
