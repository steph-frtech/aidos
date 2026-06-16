package mutationrunnersrv

import (
	"context"
	"testing"
	"time"

	"github.com/steph-frtech/aidos/back/runtime/sensors/mutation"
)

// fixedClock makes the audit timestamps deterministic in tests.
func fixedClock() time.Time { return time.Unix(1000, 0).UTC() }

func newTestServer(bars map[mutation.Scope]float64) (*server, *mutation.MockRunRecorder) {
	rec := &mutation.MockRunRecorder{}
	return &server{
		thresholds: mutation.MockThresholdReader{Bars: bars},
		recorder:   rec,
		now:        fixedClock,
	}, rec
}

// gremlinsJSON: n killed of total (rest survived), every survivor listed.
func gremlinsJSON(killed, survived int) string {
	s := `{"files":[{"filename":"x.go","mutations":[`
	for i := 0; i < killed; i++ {
		s += `{"mutator":"M","status":"KILLED","line":1},`
	}
	for i := 0; i < survived; i++ {
		s += `{"mutator":"CONDITIONALS_BOUNDARY","status":"LIVED","line":2},`
	}
	if killed+survived > 0 {
		s = s[:len(s)-1] // trim trailing comma
	}
	return s + `]}]}`
}

func TestRunMutation_FortyPercentBlocks(t *testing.T) {
	s, rec := newTestServer(map[mutation.Scope]float64{mutation.ScopeGo: 0.80})
	_, out, err := s.runMutation(context.Background(), nil, runInput{
		Scope: "go", RunID: "r1", CommitOrPhase: "h1", RawReport: gremlinsJSON(40, 60),
	})
	if err != nil {
		t.Fatalf("run_mutation: %v", err)
	}
	if out.Verdict != "block" {
		t.Fatalf("40%% < 80%% must BLOCK; got %q", out.Verdict)
	}
	if out.Score != 0.40 || out.Threshold != 0.80 {
		t.Fatalf("want score 0.40 / bar 0.80; got %v / %v", out.Score, out.Threshold)
	}
	if len(out.SurvivingMutants) != 60 {
		t.Fatalf("must list the 60 survivors; got %d", len(out.SurvivingMutants))
	}
	if len(rec.Runs) != 1 || rec.Runs[0].Verdict != mutation.VerdictBlock {
		t.Fatalf("a blocked run must be recorded; got %+v", rec.Runs)
	}
}

func TestRunMutation_EightyPercentPasses(t *testing.T) {
	s, rec := newTestServer(map[mutation.Scope]float64{mutation.ScopeGo: 0.80})
	_, out, err := s.runMutation(context.Background(), nil, runInput{
		Scope: "go", RunID: "r2", CommitOrPhase: "h2", RawReport: gremlinsJSON(80, 20),
	})
	if err != nil {
		t.Fatalf("run_mutation: %v", err)
	}
	if out.Verdict != "pass" || out.Score != 0.80 {
		t.Fatalf("80%% >= 80%% must PASS at 0.80; got %q / %v", out.Verdict, out.Score)
	}
	if len(rec.Runs) != 1 || rec.Runs[0].Verdict != mutation.VerdictPass {
		t.Fatalf("a passing run must be recorded; got %+v", rec.Runs)
	}
}

func TestRunMutation_NoDeclaredThresholdBlocks(t *testing.T) {
	// fitness has no bar for this scope ⇒ MISSING_THRESHOLD, never a self-chosen bar.
	s, _ := newTestServer(map[mutation.Scope]float64{}) // empty: no scope declared
	_, out, err := s.runMutation(context.Background(), nil, runInput{
		Scope: "go", RunID: "r3", CommitOrPhase: "h3", RawReport: gremlinsJSON(99, 1),
	})
	if err != nil {
		t.Fatalf("run_mutation: %v", err)
	}
	if out.Verdict != "block" || out.BlockCode != string(mutation.CodeMissingThreshold) {
		t.Fatalf("missing threshold must BLOCK with MISSING_THRESHOLD; got %q / %q", out.Verdict, out.BlockCode)
	}
}

func TestReadThreshold_SelectOnlyFromFitness(t *testing.T) {
	s, _ := newTestServer(map[mutation.Scope]float64{mutation.ScopeFront: 0.70})
	_, out, err := s.readThreshold(context.Background(), nil, thresholdInput{Scope: "front"})
	if err != nil {
		t.Fatalf("read_threshold: %v", err)
	}
	if !out.Declared || out.Threshold != 0.70 {
		t.Fatalf("want declared 0.70 for front; got declared=%v bar=%v", out.Declared, out.Threshold)
	}
	// an undeclared scope is surfaced as not-declared (the gate then BLOCKs).
	_, out2, _ := s.readThreshold(context.Background(), nil, thresholdInput{Scope: "go"})
	if out2.Declared {
		t.Fatal("an undeclared scope must report declared=false")
	}
}

func TestNewMCPServer_RegistersBothTools(t *testing.T) {
	s, _ := newTestServer(nil)
	if newMCPServer(s) == nil {
		t.Fatal("MCP server must construct with both tools")
	}
}
