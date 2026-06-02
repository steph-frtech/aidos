package selftest

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// SelfTestRun is the append-only ledger row for one self-test run (the projection of a
// SelfTestReport + its optional BlockReason onto runtime.self_test_runs). It is a
// runtime audit log BELOW the waterline — never truth.
type SelfTestRun struct {
	At                  string
	Verdict             Verdict
	SensorsFired        int
	SensorsTotal        int
	WallRefused         bool
	FitnessBaselineHash string
	FitnessCurrentHash  string
	FitnessUnchanged    bool
	BlockReason         *blockreason.BlockReason
}

// RunToLedger projects a SelfTestReport + optional BlockReason onto a SelfTestRun row.
func RunToLedger(r SelfTestReport, br *blockreason.BlockReason) SelfTestRun {
	return SelfTestRun{
		At:                  r.At,
		Verdict:             r.Verdict,
		SensorsFired:        r.SensorsFired(),
		SensorsTotal:        r.SensorsTotal(),
		WallRefused:         r.WallProbe.AllRefused(),
		FitnessBaselineHash: r.FitnessProbe.BaselineHash,
		FitnessCurrentHash:  r.FitnessProbe.CurrentHash,
		FitnessUnchanged:    r.FitnessProbe.Unchanged,
		BlockReason:         br,
	}
}

// PgRunLog appends self-test runs to runtime.self_test_runs and reads the latest. The
// INSERT runs as the privileged `aidos` writer role (the agent has no INSERT here) —
// it is the only writer of the meta-meta ledger.
type PgRunLog struct{ Pool *pgxpool.Pool }

// Record appends one self-test run row. It uses the writer role via SET LOCAL ROLE so
// the wall's GRANTs are honored end-to-end (the agent role cannot append here).
func (l *PgRunLog) Record(ctx context.Context, run SelfTestRun) error {
	var brJSON []byte
	if run.BlockReason != nil {
		b, err := json.Marshal(run.BlockReason)
		if err != nil {
			return err
		}
		brJSON = b
	}
	tx, err := l.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, "SET LOCAL ROLE "+pgx.Identifier{"aidos"}.Sanitize()); err != nil {
		return err
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO runtime.self_test_runs
		   (at, verdict, sensors_fired, sensors_total, wall_refused,
		    fitness_baseline_hash, fitness_current_hash, fitness_unchanged, block_reason)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		run.At, string(run.Verdict), run.SensorsFired, run.SensorsTotal, run.WallRefused,
		run.FitnessBaselineHash, run.FitnessCurrentHash, run.FitnessUnchanged, brJSON)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Latest reads the most recent self-test run.
func (l *PgRunLog) Latest(ctx context.Context) (SelfTestRun, error) {
	var run SelfTestRun
	var verdict string
	var brJSON []byte
	err := l.Pool.QueryRow(ctx,
		`SELECT at::text, verdict, sensors_fired, sensors_total, wall_refused,
		        fitness_baseline_hash, fitness_current_hash, fitness_unchanged, block_reason
		 FROM runtime.self_test_runs ORDER BY id DESC LIMIT 1`).
		Scan(&run.At, &verdict, &run.SensorsFired, &run.SensorsTotal, &run.WallRefused,
			&run.FitnessBaselineHash, &run.FitnessCurrentHash, &run.FitnessUnchanged, &brJSON)
	if err != nil {
		return SelfTestRun{}, err
	}
	run.Verdict = Verdict(verdict)
	if len(brJSON) > 0 {
		var br blockreason.BlockReason
		if err := json.Unmarshal(brJSON, &br); err != nil {
			return SelfTestRun{}, err
		}
		run.BlockReason = &br
	}
	return run, nil
}

// PgHarness is the PRODUCTION harness: it PROBES the real S04 wall (via a low-grant
// pgx connection as the agent role) and reads the real fitness baseline rows from the
// fitness schema. The sensor probe is supplied by the caller (the hook wires the real
// S07 fired-detection surface) — this package does not re-implement the sensors. All
// probes are read-only or transactional rollbacks; PgHarness writes no truth.
type PgHarness struct {
	Pool         *pgxpool.Pool
	AgentRole    string                               // the low-grant role the wall probe attempts a write as.
	Sensors      []string                             // the S07 sensor inventory.
	SensorProber func(sensorID string) (string, bool) // the S07 fired-detection surface.
	Baseline     string                               // the graven fitness baseline content-hash.
	rows         []byte
}

func (h *PgHarness) SensorInventory() []string { return h.Sensors }

func (h *PgHarness) ProbeSensor(id string) (string, bool) {
	if h.SensorProber != nil {
		return h.SensorProber(id)
	}
	return "no sensor prober wired", false
}

// ProbeWall attempts an agent-role write above the line on `schema` and reports whether
// it was REFUSED. The write is a rolled-back transaction as the agent role; a
// permission-denied error means the wall held (refused == true). Any acceptance is a
// breach (refused == false).
func (h *PgHarness) ProbeWall(schema string) (string, bool) {
	write, refused := h.attemptAgentWrite(schema)
	return write, refused
}

func (h *PgHarness) attemptAgentWrite(schema string) (string, bool) {
	ctx := context.Background()
	stmt, write := wallProbeStatement(schema)
	tx, err := h.Pool.Begin(ctx)
	if err != nil {
		return write, false
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, "SET LOCAL ROLE "+pgx.Identifier{h.AgentRole}.Sanitize()); err != nil {
		return write, false
	}
	_, err = tx.Exec(ctx, stmt)
	// The wall HELD iff the write was refused with a permission error.
	if err != nil && strings.Contains(strings.ToLower(err.Error()), "permission denied") {
		return write, true
	}
	// No error (the write was accepted) OR a non-permission error — either way the
	// permission wall did not refuse it. A breach.
	return write, false
}

// wallProbeStatement returns the canonical above-the-line write probed per schema.
func wallProbeStatement(schema string) (stmt, write string) {
	switch schema {
	case SchemaKernel:
		return `INSERT INTO kernel.truth (id, body, version) VALUES ('st-probe','{}'::jsonb,'v')`,
			"INSERT into kernel.truth as " + SchemaKernel
	case SchemaMirrors:
		return `INSERT INTO mirrors.mirror (id, body, version) VALUES ('st-probe','{}'::jsonb,'v')`,
			"INSERT into mirrors.mirror as " + SchemaMirrors
	case SchemaFitness:
		return `INSERT INTO fitness.waterline (id, body, version) VALUES ('st-probe','{}'::jsonb,'v')`,
			"INSERT into fitness.waterline as " + SchemaFitness
	default:
		return "", "unknown schema " + schema
	}
}

// FitnessRows reads the raw fitness baseline rows (SELECT-only) the content-hash is
// taken over. It reads the fitness.waterline body rows, canonicalized into a stable
// JSON array. The agent role has SELECT on fitness — never INSERT/UPDATE/DELETE.
func (h *PgHarness) FitnessRows() []byte {
	if h.rows != nil {
		return h.rows
	}
	ctx := context.Background()
	rows, err := h.Pool.Query(ctx,
		`SELECT body::text FROM fitness.waterline ORDER BY id, version`)
	if err != nil {
		h.rows = []byte("null")
		return h.rows
	}
	defer rows.Close()
	var bodies []json.RawMessage
	for rows.Next() {
		var body string
		if err := rows.Scan(&body); err != nil {
			h.rows = []byte("null")
			return h.rows
		}
		bodies = append(bodies, json.RawMessage(body))
	}
	out, err := json.Marshal(bodies)
	if err != nil {
		h.rows = []byte("null")
		return h.rows
	}
	h.rows = out
	return h.rows
}

func (h *PgHarness) BaselineHash() string { return h.Baseline }

// ErrNoBaseline is returned when the fitness baseline hash has not been pinned (an
// OpenQuestion, never a guessed hash — CLAUDE.md honesty).
var ErrNoBaseline = errors.New("selftest: fitness baseline hash not pinned (OpenQuestion)")
