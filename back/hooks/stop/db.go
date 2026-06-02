package main

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/mirror/completeness"
	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
)

// PgRunLog is the production RunLog: it appends a completeness run + its per-finding
// rows to runtime.completeness_runs / runtime.completeness_monster_findings (below
// the waterline — ADR 0014/0015; the agent role has INSERT + SELECT only, never
// UPDATE/DELETE/TRUNCATE).
type PgRunLog struct {
	Pool *pgxpool.Pool
}

// Record appends one immutable completeness run and its per-finding rows in a single
// transaction. Append-only: it INSERTs, never updates a prior row.
func (l *PgRunLog) Record(ctx context.Context, run CompletenessRun) error {
	tx, err := l.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("stop: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx,
		`INSERT INTO runtime.completeness_runs (run_id, cut_hash, verdict, monster_count)
		 VALUES ($1, $2, $3, $4)`,
		run.RunID, run.CutHash, string(run.Verdict), run.MonsterCount,
	); err != nil {
		return fmt.Errorf("stop: insert completeness_run: %w", err)
	}

	for _, m := range run.Monsters {
		if _, err := tx.Exec(ctx,
			`INSERT INTO runtime.completeness_monster_findings
			   (run_id, reason, kind, ref, missing_test_kind)
			 VALUES ($1, $2, $3, $4, $5)`,
			run.RunID, string(m.Reason), m.Kind, monsterRef(m), string(m.MissingTestKind),
		); err != nil {
			return fmt.Errorf("stop: insert monster_finding: %w", err)
		}
	}

	return tx.Commit(ctx)
}

// monsterRef renders the subject of a monster: the layer @version for a missing
// mirror, the mirror id for an orphan.
func monsterRef(m records.Monster) string {
	if m.Reason == records.ReasonNoOrphanMirror {
		return m.MirrorID
	}
	return m.LayerID + "@" + m.Version
}

// Latest returns the most recent completeness run with its findings — the row the
// /completeness panel renders as "the current-cut verdict".
func (l *PgRunLog) Latest(ctx context.Context) (CompletenessRun, error) {
	var run CompletenessRun
	var verdict string
	err := l.Pool.QueryRow(ctx,
		`SELECT run_id, cut_hash, verdict, monster_count
		   FROM runtime.completeness_runs
		  ORDER BY id DESC
		  LIMIT 1`,
	).Scan(&run.RunID, &run.CutHash, &verdict, &run.MonsterCount)
	if err != nil {
		return CompletenessRun{}, fmt.Errorf("stop: query latest run: %w", err)
	}
	run.Verdict = completeness.Verdict(verdict)

	rows, err := l.Pool.Query(ctx,
		`SELECT reason, kind, ref, missing_test_kind
		   FROM runtime.completeness_monster_findings
		  WHERE run_id = $1
		  ORDER BY id ASC`,
		run.RunID,
	)
	if err != nil {
		return CompletenessRun{}, fmt.Errorf("stop: query findings: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var reason, kind, ref, mtk string
		if err := rows.Scan(&reason, &kind, &ref, &mtk); err != nil {
			return CompletenessRun{}, fmt.Errorf("stop: scan finding: %w", err)
		}
		run.Monsters = append(run.Monsters, records.Monster{
			Reason:          records.MonsterReason(reason),
			Kind:            kind,
			MissingTestKind: records.TestKind(mtk),
		})
	}
	return run, rows.Err()
}

// PgCutSource loads the current cut — the head projection of mirrors ⋈ kernel — from
// real Postgres (the wall: SELECT-only over kernel + mirrors). The cut is the head
// join (ADR 0015), so it reads the head layers (superseded_by IS NULL) and head
// mirror records (superseded_by IS NULL).
type PgCutSource struct {
	Pool *pgxpool.Pool
}

// Load reads the head kernel layers and head mirror records. A query error is
// surfaced so the gate BLOCKS with INCOMPLETE (KRD §82) — a cut that cannot be
// loaded is a failure made explicit, never a silent pass.
func (s *PgCutSource) Load(ctx context.Context) (completeness.Cut, error) {
	layers, err := s.loadLayers(ctx)
	if err != nil {
		return completeness.Cut{}, err
	}
	mirrors, err := s.loadMirrors(ctx)
	if err != nil {
		return completeness.Cut{}, err
	}
	return completeness.Cut{Layers: layers, Mirrors: mirrors}, nil
}

func (s *PgCutSource) loadLayers(ctx context.Context) ([]records.Layer, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT id, version, COALESCE(body->>'kind', '') AS kind
		   FROM kernel.layer
		  WHERE superseded_by IS NULL
		  ORDER BY id`)
	if err != nil {
		return nil, fmt.Errorf("stop: query head layers: %w", err)
	}
	defer rows.Close()
	var out []records.Layer
	for rows.Next() {
		var l records.Layer
		if err := rows.Scan(&l.LayerID, &l.Version, &l.Kind); err != nil {
			return nil, fmt.Errorf("stop: scan layer: %w", err)
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (s *PgCutSource) loadMirrors(ctx context.Context) ([]records.Mirror, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT id, reflects_layer_id, reflects_version, test_kind, cert_language, authority, liveness, content_hash
		   FROM mirrors.mirror_record
		  WHERE superseded_by IS NULL
		  ORDER BY id`)
	if err != nil {
		return nil, fmt.Errorf("stop: query head mirrors: %w", err)
	}
	defer rows.Close()
	var out []records.Mirror
	for rows.Next() {
		var m records.Mirror
		var tk, cl, au, lv string
		if err := rows.Scan(&m.MirrorID, &m.Reflects.LayerID, &m.Reflects.Version, &tk, &cl, &au, &lv, &m.ContentHash); err != nil {
			return nil, fmt.Errorf("stop: scan mirror: %w", err)
		}
		m.TestKind, m.CertLanguage, m.Authority, m.Liveness =
			records.TestKind(tk), records.CertLanguage(cl), records.Authority(au), records.Liveness(lv)
		out = append(out, m)
	}
	return out, rows.Err()
}
