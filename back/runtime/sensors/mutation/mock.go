package mutation

import "context"

// MockThresholdReader is a deterministic, in-memory ThresholdReader (no DB). It
// proves the injection seam end-to-end and backs the Workbench mock toggle. The
// per-scope bars it returns are an EXAMPLE configuration passed in by the caller
// — NOT a value this package authors (the real bar is read from fitness; the
// agent is graded by it, §8). An absent scope ⇒ ok=false ⇒ MISSING_THRESHOLD.
type MockThresholdReader struct {
	Bars map[Scope]float64
}

// ReadThreshold returns the configured bar for a scope, or ok=false if none.
func (m MockThresholdReader) ReadThreshold(_ context.Context, scope Scope) (float64, bool, error) {
	if m.Bars == nil {
		return 0, false, nil
	}
	bar, ok := m.Bars[scope]
	return bar, ok, nil
}

// MockRunRecorder is a deterministic, in-memory RunRecorder. It records runs in
// append order so tests and the Workbench mock can read them back.
type MockRunRecorder struct {
	Runs []MutationRun
}

// Record appends a run (append-only, like the real ledger).
func (m *MockRunRecorder) Record(_ context.Context, run MutationRun) error {
	m.Runs = append(m.Runs, run)
	return nil
}

// MockRunner is a deterministic Runner that returns a fixed report (no
// subprocess). It lets the MCP server and tests exercise run_mutation without
// gremlins/Stryker installed.
type MockRunner struct {
	ScopeV Scope
	Report MutationReport
	Err    error
}

func (m MockRunner) Scope() Scope { return m.ScopeV }

func (m MockRunner) Run() (MutationReport, error) {
	if m.Err != nil {
		return MutationReport{}, m.Err
	}
	return m.Report, nil
}

// Parse delegates to the matching real parser so the mock still exercises the
// parse contract when handed raw bytes.
func (m MockRunner) Parse(raw []byte) (MutationReport, error) {
	if m.ScopeV == ScopeFront {
		return StrykerRunner{}.Parse(raw)
	}
	return GremlinsRunner{}.Parse(raw)
}

var _ Runner = MockRunner{}
