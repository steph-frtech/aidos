package main

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PgRunLog is the production RunLog: it appends a sensor run + its per-check rows
// to runtime.sensor_runs / runtime.sensor_check_results (below the waterline —
// ADR 0014; the agent role has INSERT + SELECT only, never UPDATE/DELETE/TRUNCATE).
type PgRunLog struct {
	Pool *pgxpool.Pool
}

// Record appends one immutable sensor run and its per-check results in a single
// transaction. Append-only: it INSERTs, never updates a prior row.
func (l *PgRunLog) Record(ctx context.Context, run SensorRun) error {
	tx, err := l.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("posttooluse: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx,
		`INSERT INTO runtime.sensor_runs (run_id, event_hash, target, verdict, ref)
		 VALUES ($1, $2, $3, $4, $5)`,
		run.RunID, run.EventHash, run.Target, string(run.Verdict), run.Ref,
	); err != nil {
		return fmt.Errorf("posttooluse: insert sensor_run: %w", err)
	}

	for _, r := range run.Results {
		if _, err := tx.Exec(ctx,
			`INSERT INTO runtime.sensor_check_results (run_id, name, pass, errored, output, duration_ms)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			run.RunID, r.Name, r.Pass, r.Errored, r.Output, r.DurationMS,
		); err != nil {
			return fmt.Errorf("posttooluse: insert sensor_check_result %s: %w", r.Name, err)
		}
	}

	return tx.Commit(ctx)
}

// Latest returns the most recent sensor run (by insertion order) with its per-check
// results — the row the /sensors panel renders as "the latest run".
func (l *PgRunLog) Latest(ctx context.Context) (SensorRun, error) {
	var run SensorRun
	var verdict string
	err := l.Pool.QueryRow(ctx,
		`SELECT run_id, event_hash, target, verdict, ref
		   FROM runtime.sensor_runs
		  ORDER BY id DESC
		  LIMIT 1`,
	).Scan(&run.RunID, &run.EventHash, &run.Target, &verdict, &run.Ref)
	if err != nil {
		return SensorRun{}, fmt.Errorf("posttooluse: query latest run: %w", err)
	}
	run.Verdict = Verdict(verdict)

	rows, err := l.Pool.Query(ctx,
		`SELECT name, pass, errored, output, duration_ms
		   FROM runtime.sensor_check_results
		  WHERE run_id = $1
		  ORDER BY id ASC`,
		run.RunID,
	)
	if err != nil {
		return SensorRun{}, fmt.Errorf("posttooluse: query check results: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var r CheckResult
		if err := rows.Scan(&r.Name, &r.Pass, &r.Errored, &r.Output, &r.DurationMS); err != nil {
			return SensorRun{}, fmt.Errorf("posttooluse: scan check result: %w", err)
		}
		run.Results = append(run.Results, r)
	}
	return run, rows.Err()
}
