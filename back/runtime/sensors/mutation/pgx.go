package mutation

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PgxThresholdReader reads the declared mutation-score threshold SELECT-only from
// the `fitness` schema (above the waterline; the agent role holds SELECT only —
// S04). It NEVER writes fitness. The threshold is stored as a fitness.waterline-
// style content-addressed row whose body JSONB carries the per-scope bar; we read
// the head (non-superseded) row for the 'mutation_threshold' id.
type PgxThresholdReader struct{ pool *pgxpool.Pool }

// NewPgxThresholdReader builds the fitness threshold reader over a pool.
func NewPgxThresholdReader(pool *pgxpool.Pool) PgxThresholdReader {
	return PgxThresholdReader{pool: pool}
}

// ReadThreshold reads the declared bar for a scope. ok=false ⇒ no declared
// threshold (the gate then BLOCKs with MISSING_THRESHOLD — never a default). The
// row is read from fitness; this method holds SELECT only and writes nothing.
func (r PgxThresholdReader) ReadThreshold(ctx context.Context, scope Scope) (float64, bool, error) {
	// The threshold lives in fitness as a content-addressed, head-mutable row
	// (mirroring fitness.waterline's shape). body JSONB maps scope → bar, e.g.
	// {"go":0.80,"front":0.70}. The agent has SELECT only here.
	const q = `
SELECT body
FROM fitness.mutation_threshold
WHERE id = 'mutation_threshold' AND superseded_by IS NULL
ORDER BY created_at DESC
LIMIT 1`
	var body []byte
	err := r.pool.QueryRow(ctx, q).Scan(&body)
	if err != nil {
		if err == pgx.ErrNoRows {
			return 0, false, nil
		}
		return 0, false, fmt.Errorf("read fitness threshold: %w", err)
	}
	var bars map[string]float64
	if err := json.Unmarshal(body, &bars); err != nil {
		return 0, false, fmt.Errorf("decode fitness threshold body: %w", err)
	}
	bar, ok := bars[string(scope)]
	return bar, ok, nil
}

// PgxRunRecorder appends a mutation run + its surviving mutants to the
// runtime.mutation_runs audit log (below the waterline; the agent role holds
// INSERT+SELECT — S05/S40). Append-only: never updates a prior row.
type PgxRunRecorder struct{ pool *pgxpool.Pool }

// NewPgxRunRecorder builds the run recorder over a pool.
func NewPgxRunRecorder(pool *pgxpool.Pool) PgxRunRecorder {
	return PgxRunRecorder{pool: pool}
}

// Record appends one run row + its surviving-mutant children in a transaction.
func (w PgxRunRecorder) Record(ctx context.Context, run MutationRun) error {
	tx, err := w.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin mutation_run record: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // best-effort rollback on early return

	_, err = tx.Exec(ctx, `
INSERT INTO runtime.mutation_runs
  (run_id, scope, commit_or_phase_hash, runner, killed, survived, timed_out,
   not_covered, total, score, threshold_used, verdict, started_at, finished_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		run.RunID, string(run.Scope), run.CommitOrPhase, run.Runner, run.Killed,
		run.Survived, run.TimedOut, run.NotCovered, run.Total, run.Score,
		run.ThresholdUsed, string(run.Verdict), run.StartedAt, run.FinishedAt)
	if err != nil {
		return fmt.Errorf("insert mutation_run: %w", err)
	}

	for _, sm := range run.SurvivingMutants {
		_, err = tx.Exec(ctx, `
INSERT INTO runtime.surviving_mutants (run_id, file, line, operator, gap)
VALUES ($1,$2,$3,$4,$5)`, run.RunID, sm.File, sm.Line, sm.Operator, sm.Gap)
		if err != nil {
			return fmt.Errorf("insert surviving_mutant: %w", err)
		}
	}
	return tx.Commit(ctx)
}
