// Package redwork is the red-wave FAN-OUT wiring of the AIDOS Runtime (KRD §42, §74, §98):
// the thin, importable seam that turns a kernel-hash bump into the persisted worklist. It
// holds NO red-wave logic — the wave is computed by the PURE engine runtime/redwave.Impact
// (reusing S17.Resolve, determinism-first, CLAUDE.md §6) — and NO truth write — it only
// APPENDs the items into runtime.red_work_queue, below the waterline (the wall, CLAUDE.md §2,
// ADR 0020).
//
// WHY A LIBRARY (the S59 extract-don't-twin pattern). The fan-out has TWO consumers that must
// share IDENTICAL behaviour:
//
//   - the harness-invoked PostKernelChange HOOK (back/hooks/postkernelchange) — fired on a raw
//     kernel-hash bump (OpenQuestion OQ-S22-1: the runtime bump feed lands at a later step);
//   - the ChangeSet APPLY handler (back/mcp/changeset/changesetsrv) — the live trigger today:
//     a ChangeSet flipping DRAFT → APPLIED IS a kernel bump, so the fan-out fires AFTER the
//     apply gate stamps APPLIED (and ONLY then — a blocked apply fires nothing).
//
// Extracting FireRedWave + KernelChange + PgRedWorkQueue here (out of the hook's package main)
// lets BOTH wire the same seam with no duplicated logic and no twin (reuse, don't reinvent —
// CLAUDE.md §0), exactly as changesetsrv itself was extracted at S59.
package redwork

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
)

// KernelChange is the input of a fan-out firing: the bumped source ids, the versioned link
// graph (S17 links + the declared load-bearing weight + render layer), the current heads (the
// bumped sources' new heads already moved), and the wave_id (the bump's content hash, the
// `rehash` part of §74's line). Where the bumped set / heads come from at runtime (the DAG
// head resolution) is owned by S02/S24 (OpenQuestion OQ-S22-1, a forward dependency); the
// caller supplies them so this stays a pure wiring of the engine.
type KernelChange struct {
	// Bumped is the set of kernel source ids the change moved (the new head bumped).
	Bumped []string
	// Edges is the versioned link graph the wave walks (S17 links + load-bearing + layer).
	Edges []redwave.Edge
	// Heads is the current head version per target id (S17 Heads; the bumped heads moved).
	Heads links.Heads
	// WaveID is the bump's content hash (`rehash`) — the id of the wave this firing opens.
	WaveID string
}

// FireRedWave is the §74/§98 `fire-red-wave --from-mirror` step: compute the wave from the
// change (the PURE engine) and stamp it with the wave_id. It is a pure function — it returns
// the rows VALUE to enqueue; the caller persists them. Returning an empty slice for an empty
// bump is the "no bump ⇒ empty wave" case (§42). It NEVER re-implements the wave; it delegates
// to redwave.Impact (which reuses S17.Resolve).
func FireRedWave(c KernelChange) []redwave.RedWorkItem {
	wave := redwave.Impact(c.Bumped, c.Edges, c.Heads)
	return redwave.Enqueue(wave, c.WaveID)
}

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
		return fmt.Errorf("redwork: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	for i, r := range rows {
		deps, err := json.Marshal(r.Dependencies)
		if err != nil {
			return fmt.Errorf("redwork: marshal deps for %s: %w", r.Target, err)
		}
		itemID := fmt.Sprintf("%s#%d", r.WaveID, i)
		if _, err := tx.Exec(ctx,
			`INSERT INTO runtime.red_work_queue
			   (item_id, wave_id, target, reason, status, layer, dependencies)
			 VALUES ($1, $2, $3, $4, 'open', $5, $6)`,
			itemID, r.WaveID, r.Target, string(r.Reason), string(r.Layer), deps,
		); err != nil {
			return fmt.Errorf("redwork: insert red_work_item %s: %w", r.Target, err)
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
		return nil, fmt.Errorf("redwork: query wave %s: %w", waveID, err)
	}
	defer dbRows.Close()

	var out []redwave.RedWorkItem
	for dbRows.Next() {
		var it redwave.RedWorkItem
		var reason, layer string
		var deps []byte
		if err := dbRows.Scan(&it.Target, &reason, &layer, &deps); err != nil {
			return nil, fmt.Errorf("redwork: scan red_work_item: %w", err)
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
