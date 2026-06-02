package mirrorrunner

// runner.go is the I/O SHELL around the pure cliquet core (regression.go). It
// reads the living mirror set from the `mirrors` schema (read-only — the wall
// holds), replays each mirror through a Replayer, records every run append-only
// in runtime.mirror_runs, and compares the candidate to the recorded baseline
// using the pure Decide(). The runner never writes truth; it writes only its own
// run-log. The replay itself (running Godog/rapid/the fixture interpreter) is the
// only impure part and is hidden behind the Replayer seam so the orchestration is
// testable without spawning real test processes.

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Mirror is a living mirror as read from the `mirrors` schema: its id, version,
// and a content hash of the materialized source the Replayer runs.
type Mirror struct {
	ID          string
	Version     string
	ContentHash string
}

// Replayer runs one materialized mirror and reports its verdict. This is the
// single impure seam: a real implementation dispatches by test_kind to Godog /
// rapid / the fixture interpreter. Tests inject a deterministic fake.
type Replayer interface {
	Replay(ctx context.Context, m Mirror) (Status, error)
}

// MirrorSource lists the living mirrors to replay. A real implementation reads
// the `mirrors` schema; tests inject a fixed set.
type MirrorSource interface {
	LivingMirrors(ctx context.Context) ([]Mirror, error)
}

// RunLog records mirror runs append-only and reads the recorded baseline. A real
// implementation is backed by runtime.mirror_runs; tests use an in-memory log.
type RunLog interface {
	// Record appends one immutable run row. It never updates in place.
	Record(ctx context.Context, run RunRecord) error
	// Baseline returns the latest recorded status per mirror id, the merge-base
	// reference the cliquet protects (green there = a promise not to break).
	Baseline(ctx context.Context) (map[string]Status, error)
}

// RunRecord is one immutable row in the cliquet run-log.
type RunRecord struct {
	RunID          string
	MirrorID       string
	MirrorVersion  string
	ContentHash    string
	Status         Status
	BaselineStatus *Status // nil when the mirror has no baseline yet
	Regressed      bool
	Ref            string
}

// RatchetResult is the outcome of a full replay-and-compare against the baseline.
type RatchetResult struct {
	RunID       string
	Verdict     MergeVerdict
	Regressed   []Regression
	BlockReason *BlockReason
	Runs        []RunRecord
}

// Ratchet wires the three seams to the pure core.
type Ratchet struct {
	Source   MirrorSource
	Replayer Replayer
	Log      RunLog
}

// Check is the whole cliquet: read the living mirror set, replay every mirror,
// record each run append-only against the recorded baseline, then decide the
// merge verdict with the pure core. RunID is supplied by the caller (no clock,
// no rng inside — determinism-first: the caller owns the run identity).
func (r *Ratchet) Check(ctx context.Context, runID, ref string) (RatchetResult, error) {
	mirrors, err := r.Source.LivingMirrors(ctx)
	if err != nil {
		return RatchetResult{}, fmt.Errorf("mirror-runner: list living mirrors: %w", err)
	}
	baseline, err := r.Log.Baseline(ctx)
	if err != nil {
		return RatchetResult{}, fmt.Errorf("mirror-runner: read baseline: %w", err)
	}

	candidate := make([]MirrorVerdict, 0, len(mirrors))
	baseVerdicts := make([]MirrorVerdict, 0, len(mirrors))
	runs := make([]RunRecord, 0, len(mirrors))

	for _, m := range mirrors {
		status, err := r.Replayer.Replay(ctx, m)
		if err != nil {
			return RatchetResult{}, fmt.Errorf("mirror-runner: replay %s: %w", m.ID, err)
		}
		candidate = append(candidate, MirrorVerdict{
			MirrorID: m.ID, Version: m.Version, ContentHash: m.ContentHash, Status: status,
		})

		var basePtr *Status
		if bs, ok := baseline[m.ID]; ok {
			b := bs
			basePtr = &b
			baseVerdicts = append(baseVerdicts, MirrorVerdict{
				MirrorID: m.ID, Version: m.Version, ContentHash: m.ContentHash, Status: bs,
			})
		}
		regressed := basePtr != nil && *basePtr == StatusGreen && status == StatusRed
		rec := RunRecord{
			RunID: runID, MirrorID: m.ID, MirrorVersion: m.Version, ContentHash: m.ContentHash,
			Status: status, BaselineStatus: basePtr, Regressed: regressed, Ref: ref,
		}
		runs = append(runs, rec)
		if err := r.Log.Record(ctx, rec); err != nil {
			return RatchetResult{}, fmt.Errorf("mirror-runner: record run %s: %w", m.ID, err)
		}
	}

	verdict, regressed, br := Decide(baseVerdicts, candidate)
	return RatchetResult{
		RunID: runID, Verdict: verdict, Regressed: regressed, BlockReason: br, Runs: runs,
	}, nil
}

// ── Postgres-backed implementations (the production seams) ───────────────────

// PgRunLog is the runtime.mirror_runs-backed RunLog. The runner connects with the
// agent role: it has INSERT + SELECT on runtime.mirror_runs and SELECT on the
// `mirrors` schema, and NO write to any truth schema (the wall).
type PgRunLog struct{ pool *pgxpool.Pool }

// NewPgRunLog opens a pool to dsn and returns a RunLog over runtime.mirror_runs.
func NewPgRunLog(ctx context.Context, dsn string) (*PgRunLog, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("mirror-runner: open pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("mirror-runner: ping: %w", err)
	}
	return &PgRunLog{pool: pool}, nil
}

// Close releases the pool.
func (l *PgRunLog) Close() { l.pool.Close() }

// Record appends one immutable run row (append-only; INSERT only).
func (l *PgRunLog) Record(ctx context.Context, r RunRecord) error {
	var base *string
	if r.BaselineStatus != nil {
		s := string(*r.BaselineStatus)
		base = &s
	}
	_, err := l.pool.Exec(ctx,
		`INSERT INTO runtime.mirror_runs
		   (run_id, mirror_id, mirror_version, content_hash, status, baseline_status, regressed, ref)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		r.RunID, r.MirrorID, r.MirrorVersion, r.ContentHash, string(r.Status), base, r.Regressed, r.Ref,
	)
	if err != nil {
		return fmt.Errorf("mirror-runner: insert mirror_run: %w", err)
	}
	return nil
}

// Baseline returns the latest recorded status per mirror id (newest run wins).
func (l *PgRunLog) Baseline(ctx context.Context) (map[string]Status, error) {
	rows, err := l.pool.Query(ctx,
		`SELECT DISTINCT ON (mirror_id) mirror_id, status
		   FROM runtime.mirror_runs
		  ORDER BY mirror_id, ran_at DESC, id DESC`)
	if err != nil {
		return nil, fmt.Errorf("mirror-runner: query baseline: %w", err)
	}
	defer rows.Close()
	out := map[string]Status{}
	for rows.Next() {
		var id, st string
		if err := rows.Scan(&id, &st); err != nil {
			return nil, err
		}
		out[id] = Status(st)
	}
	return out, rows.Err()
}

// LatestPerMirror returns the most recent run row per mirror id, for the /mirrors
// panel. Read-only over the runner's own log.
func (l *PgRunLog) LatestPerMirror(ctx context.Context) ([]RunRecord, error) {
	rows, err := l.pool.Query(ctx,
		`SELECT DISTINCT ON (mirror_id) run_id, mirror_id, mirror_version, content_hash,
		        status, baseline_status, regressed, ref
		   FROM runtime.mirror_runs
		  ORDER BY mirror_id, ran_at DESC, id DESC`)
	if err != nil {
		return nil, fmt.Errorf("mirror-runner: query latest: %w", err)
	}
	defer rows.Close()
	var out []RunRecord
	for rows.Next() {
		var rec RunRecord
		var status, ref string
		var base *string
		if err := rows.Scan(&rec.RunID, &rec.MirrorID, &rec.MirrorVersion, &rec.ContentHash,
			&status, &base, &rec.Regressed, &ref); err != nil {
			return nil, err
		}
		rec.Status = Status(status)
		rec.Ref = ref
		if base != nil {
			s := Status(*base)
			rec.BaselineStatus = &s
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

// PgMirrorSource reads the living mirror set from the `mirrors` schema (SELECT
// only — the wall). A mirror is "living" when it is not superseded.
type PgMirrorSource struct{ pool *pgxpool.Pool }

// NewPgMirrorSource opens a pool to dsn for read-only access to `mirrors`.
func NewPgMirrorSource(ctx context.Context, dsn string) (*PgMirrorSource, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("mirror-runner: open mirror pool: %w", err)
	}
	return &PgMirrorSource{pool: pool}, nil
}

// Close releases the pool.
func (s *PgMirrorSource) Close() { s.pool.Close() }

// LivingMirrors lists non-superseded mirror records, content-hashing each
// record body so a verdict binds to the exact mirror that was run.
func (s *PgMirrorSource) LivingMirrors(ctx context.Context) ([]Mirror, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, version, body::text
		   FROM mirrors.mirror
		  WHERE superseded_by IS NULL
		  ORDER BY id`)
	if err != nil {
		return nil, fmt.Errorf("mirror-runner: query living mirrors: %w", err)
	}
	defer rows.Close()
	var out []Mirror
	for rows.Next() {
		var id, version, body string
		if err := rows.Scan(&id, &version, &body); err != nil {
			return nil, err
		}
		out = append(out, Mirror{ID: id, Version: version, ContentHash: hashBody(body)})
	}
	return out, rows.Err()
}

// hashBody is the canonical SHA-256 hex content hash of a mirror's source body.
func hashBody(body string) string {
	sum := sha256.Sum256([]byte(body))
	return hex.EncodeToString(sum[:])
}

// BaselineReplayer is the S05 production Replayer seam: it reports a mirror's
// verdict as its last recorded status (StatusGreen when none recorded — a fresh
// mirror is presumed green until a run proves otherwise). The actual dispatch to
// Godog/rapid/the fixture interpreter by test_kind is owned by S06+, when mirror
// records carry the typed fields; S05 proves the replay-and-compare machinery and
// the append-only run-log against this honest seam. The wall is unaffected: it
// only ever READS the recorded log.
type BaselineReplayer struct {
	Log interface {
		Baseline(ctx context.Context) (map[string]Status, error)
	}
}

// Replay returns the mirror's last recorded status (green if unseen).
func (r BaselineReplayer) Replay(ctx context.Context, m Mirror) (Status, error) {
	base, err := r.Log.Baseline(ctx)
	if err != nil {
		return StatusRed, err
	}
	if s, ok := base[m.ID]; ok {
		return s, nil
	}
	return StatusGreen, nil
}

// errNoBaseline distinguishes "no baseline yet" from a real error (reserved for
// callers that need the distinction).
var errNoBaseline = errors.New("mirror-runner: no baseline recorded")

// ensure imports stay used even if a build trims helpers.
var (
	_ = pgx.ErrNoRows
	_ = errNoBaseline
)
