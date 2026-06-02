package mutation

import (
	"context"
	"time"
)

// ThresholdReader reads the DECLARED mutation-score threshold for a scope,
// SELECT-only from the `fitness` schema (NIVEAU 3, above the waterline). It is a
// READ port: the agent is graded by this bar and never authors it (§8
// anti-Goodhart). ok=false means no threshold is declared for the scope → the
// gate BLOCKs with MISSING_THRESHOLD (never a self-chosen default).
type ThresholdReader interface {
	ReadThreshold(ctx context.Context, scope Scope) (threshold float64, ok bool, err error)
}

// MutationRun is one immutable audit row of a mutation run — what
// runtime.mutation_runs (+ child runtime.surviving_mutants) stores. Below the
// waterline (a Runtime audit log, not truth); append-only, content-addressed by
// the commit/phase hash.
type MutationRun struct {
	RunID            string            `json:"run_id"`
	Scope            Scope             `json:"scope"`
	CommitOrPhase    string            `json:"commit_or_phase_hash"`
	Runner           string            `json:"runner"`
	Killed           int               `json:"killed"`
	Survived         int               `json:"survived"`
	TimedOut         int               `json:"timed_out"`
	NotCovered       int               `json:"not_covered"`
	Total            int               `json:"total"`
	Score            float64           `json:"score"`
	ThresholdUsed    float64           `json:"threshold_used"`
	Verdict          Verdict           `json:"verdict"`
	StartedAt        time.Time         `json:"started_at"`
	FinishedAt       time.Time         `json:"finished_at"`
	SurvivingMutants []SurvivingMutant `json:"surviving_mutants,omitempty"`
}

// RunRecorder appends one mutation run to the audit log (runtime.mutation_runs).
// The agent role MAY write here (INSERT+SELECT on the runtime schema, S05) — this
// is below the waterline, not truth. Append-only: a re-run appends a new row.
type RunRecorder interface {
	Record(ctx context.Context, run MutationRun) error
}

// ToRun assembles the audit row from a gate result + run metadata. Pure (the
// timestamps are passed in, never read from the clock here — determinism-first).
func ToRun(runID, commitOrPhase string, scope Scope, runner string, report MutationReport, gated Gated, startedAt, finishedAt time.Time) MutationRun {
	return MutationRun{
		RunID:            runID,
		Scope:            scope,
		CommitOrPhase:    commitOrPhase,
		Runner:           runner,
		Killed:           report.Killed,
		Survived:         report.Survived,
		TimedOut:         report.TimedOut,
		NotCovered:       report.NotCovered,
		Total:            report.Total,
		Score:            gated.Score,
		ThresholdUsed:    gated.Threshold,
		Verdict:          gated.Verdict,
		StartedAt:        startedAt,
		FinishedAt:       finishedAt,
		SurvivingMutants: gated.SurvivingMutants,
	}
}
