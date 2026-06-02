package mutation

import (
	"context"
	"time"
)

// Clock returns the current time. Injected so RunAndGate stays testable and the
// audit timestamps are explicit (determinism-first: no arg-less time.Now scattered
// through the logic).
type Clock func() time.Time

// RunAndGate is the capability the MCP `run_mutation` tool drives end to end:
//
//  1. read the DECLARED threshold for the scope (SELECT-only from fitness);
//  2. invoke the frozen runner over the scope (gremlins/Stryker subprocess);
//  3. gate the parsed report against the threshold (pure);
//  4. append the run to the audit log (runtime.mutation_runs, below the waterline).
//
// It returns the Gated result (verdict, score, surviving mutants, BlockReason). A
// runner error or a missing threshold yields a BLOCK made explicit — never a
// silent pass (KRD §82). The threshold is never authored here; if none is
// declared the gate blocks with MISSING_THRESHOLD.
func RunAndGate(
	ctx context.Context,
	runID, commitOrPhase string,
	runner Runner,
	thresholds ThresholdReader,
	recorder RunRecorder,
	now Clock,
) (Gated, error) {
	scope := runner.Scope()

	var bar *float64
	if thresholds != nil {
		v, ok, err := thresholds.ReadThreshold(ctx, scope)
		if err != nil {
			return Gated{}, err
		}
		if ok {
			bar = &v
		}
	}

	started := now()
	report, runErr := runner.Run()
	finished := now()
	if runErr != nil {
		// A runner failure is a failure made explicit: BLOCK with UNPARSABLE_REPORT
		// (a run we cannot read is not a pass). We still record the attempt.
		br := blockReasonFor(CodeUnparsableReport)
		gated := Gated{Verdict: VerdictBlock, BlockReason: &br}
		if bar != nil {
			gated.Threshold = *bar
		}
		_ = recordIfPossible(ctx, recorder, runID, commitOrPhase, scope, string(scope), MutationReport{Scope: string(scope)}, gated, started, finished)
		return gated, runErr
	}

	gated := Gate(report, bar)

	if err := recordIfPossible(ctx, recorder, runID, commitOrPhase, scope, report.Runner, report, gated, started, finished); err != nil {
		return gated, err
	}
	return gated, nil
}

func recordIfPossible(ctx context.Context, recorder RunRecorder, runID, commitOrPhase string, scope Scope, runner string, report MutationReport, gated Gated, started, finished time.Time) error {
	if recorder == nil {
		return nil
	}
	row := ToRun(runID, commitOrPhase, scope, runner, report, gated, started, finished)
	return recorder.Record(ctx, row)
}
