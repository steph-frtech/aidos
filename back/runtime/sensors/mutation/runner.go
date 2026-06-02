package mutation

import (
	"encoding/json"
	"fmt"
)

// Scope names what a runner mutates. The two frozen runners cover one scope each
// (CLAUDE.md §3): gremlins → the Go code/mirrors, StrykerJS → the front.
type Scope string

const (
	ScopeGo    Scope = "go"
	ScopeFront Scope = "front"
)

// Runner is the one adapter interface over the FROZEN mutation runners. An
// implementation INVOKES its tool as a subprocess (post-integration, the pipeline
// drawer — KRD §19) and PARSES the tool's own JSON report into the shared
// MutationReport. It authors NO mutation operator — the operators belong to
// gremlins/StrykerJS (the replaceable slot). Run is the only impure seam; Parse
// is a pure function of the raw report bytes (so it is unit-testable without the
// tool installed, and never panics on garbage — it returns an error).
type Runner interface {
	// Scope is the single scope this runner mutates.
	Scope() Scope
	// Run invokes the tool over the scope and returns the parsed report. The only
	// I/O in this package. An invocation/parse failure is returned as an error so
	// the caller BLOCKs (never an assumed score).
	Run() (MutationReport, error)
	// Parse turns the tool's raw JSON report into a MutationReport. Pure, total,
	// never panics: unparsable bytes ⇒ error, never a guessed score.
	Parse(raw []byte) (MutationReport, error)
}

// ── gremlins (Go scope) ──────────────────────────────────────────────────────

// gremlinsReport mirrors the fields of gremlins' `--output` JSON we consume. We
// read only what the gate needs; unknown fields are ignored. gremlins reports a
// `files[].mutations[]` tree with a per-mutation `status`
// (KILLED|LIVED|NOT_COVERED|TIMED_OUT|...) plus a top-level coverage summary.
type gremlinsReport struct {
	Files []struct {
		Filename  string `json:"filename"`
		Mutations []struct {
			MutatorType string `json:"mutator"`
			Status      string `json:"status"`
			Line        int    `json:"line"`
		} `json:"mutations"`
	} `json:"files"`
}

// GremlinsRunner is the gremlins adapter: it parses gremlins' JSON report into a
// MutationReport. The subprocess invocation lives in Run (wired by the MCP
// server); Parse is the pure, tested core.
type GremlinsRunner struct {
	// run, when set, performs the subprocess invocation and returns raw report
	// bytes. Left nil in unit tests (Parse is exercised directly); the MCP server
	// supplies a real `gremlins unleash --output ...` invocation.
	run func() ([]byte, error)
}

func (GremlinsRunner) Scope() Scope { return ScopeGo }

func (g GremlinsRunner) Run() (MutationReport, error) {
	if g.run == nil {
		return MutationReport{}, fmt.Errorf("gremlins runner: no invocation wired (Parse is pure; wire run via the MCP server)")
	}
	raw, err := g.run()
	if err != nil {
		return MutationReport{}, fmt.Errorf("gremlins runner: invocation failed: %w", err)
	}
	return g.Parse(raw)
}

// Parse turns a gremlins JSON report into a MutationReport. Pure, total, never
// panics — a malformed report is an error (the gate then BLOCKs).
func (GremlinsRunner) Parse(raw []byte) (MutationReport, error) {
	var gr gremlinsReport
	if err := json.Unmarshal(raw, &gr); err != nil {
		return MutationReport{}, fmt.Errorf("gremlins report: unparsable: %w", err)
	}
	rep := MutationReport{Scope: string(ScopeGo), Runner: "gremlins"}
	for _, f := range gr.Files {
		for _, m := range f.Mutations {
			rep.Total++
			switch m.Status {
			case "KILLED":
				rep.Killed++
			case "TIMED_OUT":
				rep.TimedOut++
			case "NOT_COVERED":
				rep.NotCovered++
			case "LIVED":
				rep.Survived++
				rep.SurvivingMutants = append(rep.SurvivingMutants, SurvivingMutant{
					File:     f.Filename,
					Line:     m.Line,
					Operator: m.MutatorType,
					Gap:      "no mirror killed this mutant — add an invariant or fixture",
				})
			default:
				// An unknown status is counted as covered-but-not-killed (survived):
				// we never silently drop a mutant (that would inflate the score).
				rep.Survived++
			}
		}
	}
	return rep, nil
}

// ── StrykerJS (front scope) ──────────────────────────────────────────────────

// strykerReport mirrors the Stryker `mutation-report.json` (mutation-testing-
// elements schema): a `files` map keyed by filename, each with `mutants[]`
// carrying a `status` (Killed|Survived|NoCoverage|Timeout|...), a `mutatorName`,
// and a `location`.
type strykerReport struct {
	Files map[string]struct {
		Mutants []struct {
			MutatorName string `json:"mutatorName"`
			Status      string `json:"status"`
			Location    struct {
				Start struct {
					Line int `json:"line"`
				} `json:"start"`
			} `json:"location"`
		} `json:"mutants"`
	} `json:"files"`
}

// StrykerRunner is the StrykerJS adapter: it parses Stryker's JSON report into a
// MutationReport. Same shape contract as gremlins, different scope.
type StrykerRunner struct {
	run func() ([]byte, error)
}

func (StrykerRunner) Scope() Scope { return ScopeFront }

func (s StrykerRunner) Run() (MutationReport, error) {
	if s.run == nil {
		return MutationReport{}, fmt.Errorf("stryker runner: no invocation wired (Parse is pure; wire run via the MCP server)")
	}
	raw, err := s.run()
	if err != nil {
		return MutationReport{}, fmt.Errorf("stryker runner: invocation failed: %w", err)
	}
	return s.Parse(raw)
}

// Parse turns a Stryker JSON report into a MutationReport. Pure, total, never
// panics — a malformed report is an error (the gate then BLOCKs).
func (StrykerRunner) Parse(raw []byte) (MutationReport, error) {
	var sr strykerReport
	if err := json.Unmarshal(raw, &sr); err != nil {
		return MutationReport{}, fmt.Errorf("stryker report: unparsable: %w", err)
	}
	rep := MutationReport{Scope: string(ScopeFront), Runner: "stryker"}
	for filename, f := range sr.Files {
		for _, m := range f.Mutants {
			rep.Total++
			switch m.Status {
			case "Killed":
				rep.Killed++
			case "Timeout":
				rep.TimedOut++
			case "NoCoverage":
				rep.NotCovered++
			case "Survived":
				rep.Survived++
				rep.SurvivingMutants = append(rep.SurvivingMutants, SurvivingMutant{
					File:     filename,
					Line:     m.Location.Start.Line,
					Operator: m.MutatorName,
					Gap:      "no mirror killed this mutant — add an invariant or fixture",
				})
			default:
				rep.Survived++
			}
		}
	}
	return rep, nil
}

// compile-time proof both adapters satisfy the one Runner interface.
var (
	_ Runner = GremlinsRunner{}
	_ Runner = StrykerRunner{}
)
