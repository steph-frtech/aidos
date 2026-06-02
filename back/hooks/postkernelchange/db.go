package main

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
)

// PgRedWorkQueue is the production RedWorkQueue persistence: it APPENDS the fired red wave's
// RedWorkItems to runtime.red_work_queue (below the waterline — ADR 0020; the agent role has
// INSERT + SELECT only, never UPDATE/DELETE/TRUNCATE, so the worklist is append-only and the
// status transitions are the scheduler's job). It NEVER writes truth (the wall).
type PgRedWorkQueue struct {
	Pool *pgxpool.Pool
}

// Enqueue appends the wave's items as `open` rows in a single transaction. Append-only: it
// INSERTs, never updates a prior row. Each row carries the wave_id (the bump hash), the
// target, the reason, the layer (the render-grouping hint) and the ordered dependencies; the
// item_id is derived from the wave_id + the item index so a re-fired wave is idempotent at the
// row identity level. status defaults to 'open', owner_agent/lease_until stay NULL (the
// scheduler claims later). An empty wave enqueues nothing (no bump ⇒ queue unchanged).
func (q *PgRedWorkQueue) Enqueue(ctx context.Context, rows []redwave.RedWorkItem) error {
	if len(rows) == 0 {
		return nil
	}
	tx, err := q.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("postkernelchange: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	for i, r := range rows {
		deps, err := json.Marshal(r.Dependencies)
		if err != nil {
			return fmt.Errorf("postkernelchange: marshal deps for %s: %w", r.Target, err)
		}
		itemID := fmt.Sprintf("%s#%d", r.WaveID, i)
		if _, err := tx.Exec(ctx,
			`INSERT INTO runtime.red_work_queue
			   (item_id, wave_id, target, reason, status, layer, dependencies)
			 VALUES ($1, $2, $3, $4, 'open', $5, $6)`,
			itemID, r.WaveID, r.Target, string(r.Reason), string(r.Layer), deps,
		); err != nil {
			return fmt.Errorf("postkernelchange: insert red_work_item %s: %w", r.Target, err)
		}
	}
	return tx.Commit(ctx)
}

// Wave reads back the open items of a wave, in insert order (the row the /red-wave panel
// renders). It is SELECT-only.
func (q *PgRedWorkQueue) Wave(ctx context.Context, waveID string) ([]redwave.RedWorkItem, error) {
	dbRows, err := q.Pool.Query(ctx,
		`SELECT target, reason, layer, dependencies
		   FROM runtime.red_work_queue
		  WHERE wave_id = $1
		  ORDER BY id ASC`,
		waveID,
	)
	if err != nil {
		return nil, fmt.Errorf("postkernelchange: query wave %s: %w", waveID, err)
	}
	defer dbRows.Close()

	var out []redwave.RedWorkItem
	for dbRows.Next() {
		var it redwave.RedWorkItem
		var reason, layer string
		var deps []byte
		if err := dbRows.Scan(&it.Target, &reason, &layer, &deps); err != nil {
			return nil, fmt.Errorf("postkernelchange: scan red_work_item: %w", err)
		}
		it.Reason = redwave.Reason(reason)
		it.Layer = redwave.Layer(layer)
		it.WaveID = waveID
		if len(deps) > 0 {
			_ = json.Unmarshal(deps, &it.Dependencies)
		}
		out = append(out, it)
	}
	return out, dbRows.Err()
}
