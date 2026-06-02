// Command harness-self-test is the AIDOS SessionStart hook (KRD LIVRE XIII §71:
// `SessionStart: [ "harness-self-test" ]`). At every session start it runs the
// meta-meta self-test (back/hooks/sessionstart/selftest): a deterministic
// fault-injection proving the three INVIOLABLE guarantees of NIVEAU 3 —
//
//	(1) every sensor still FIRES (the mirror of the mirrors, KRD §60),
//	(2) the WALL still HOLDS (an agent-role write above the line is refused), and
//	(3) the FITNESS is UNCHANGED (no loop edits its own fitness — KRD §70).
//
// On any violated guarantee it writes the actionable BlockReason (S13 shape) to
// stdout and exits non-zero — the session is BLOCKED from starting. On a green run it
// appends the run to runtime.self_test_runs (via the privileged writer role) and
// exits 0. The hook NEVER edits the fitness/kernel/mirrors schemas or any sensor it
// tests — it is below the line, it only READS truth (SELECT-only) and runs detectors.
// There is NO level 4: the floor is deterministic fault injection, not another judge.
package main

import (
	"context"
	"encoding/json"
	"io"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/steph-frtech/aidos/back/hooks/sessionstart/selftest"
)

const (
	exitAllow = 0
	exitBlock = 2
)

// Run is the binary entrypoint: build the production harness from the wired DB,
// run the self-test, record the run append-only (best-effort), and return the exit
// code (0 = the session may start, 2 = block). On block it writes the BlockReason
// JSON to stdout so the harness surfaces the actionable refusal. If the harness
// cannot be built (no DB, no pinned baseline), it FAILS CLOSED (block) — a self-test
// that cannot prove the guarantees must not let the session start (KRD §82
// .passthrough() anti-pattern: an unverifiable guarantee is a failure made explicit).
func Run(ctx context.Context, stdout io.Writer, h selftest.Harness, log *selftest.PgRunLog, at string) int {
	if h == nil {
		writeBlock(stdout, &selftest.SelfTestUnavailableBlockReason)
		return exitBlock
	}
	report, br := selftest.Run(h, at)
	if log != nil {
		_ = log.Record(ctx, selftest.RunToLedger(report, br))
	}
	if br != nil {
		writeBlock(stdout, br)
		return exitBlock
	}
	return exitAllow
}

func writeBlock(w io.Writer, br any) {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(br)
}

// buildHarness wires the production PgHarness when DATABASE_URL + the pinned fitness
// baseline (SELF_TEST_FITNESS_BASELINE) are set; otherwise it returns nil (fail
// closed). The sensor inventory + fired-detection surface are the S07 contract; until
// the live wiring lands (OQ-S39-sensorprobe) the prober reports the canonical sensor
// set as firing only via the real PostToolUse fault-injection — recorded as an
// OpenQuestion, never invented. The baseline is NEVER guessed (CLAUDE.md honesty).
func buildHarness(ctx context.Context) (selftest.Harness, *selftest.PgRunLog) {
	dsn := os.Getenv("DATABASE_URL")
	baseline := os.Getenv("SELF_TEST_FITNESS_BASELINE")
	if dsn == "" || baseline == "" {
		return nil, nil
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, nil
	}
	h := &selftest.PgHarness{
		Pool:      pool,
		AgentRole: "aidos_agent",
		Sensors:   selftest.CanonicalSensorInventory(),
		// The S07 fired-detection surface is wired here by the live hook; nil prober
		// is fail-closed (a sensor that cannot be proven to fire is treated as muted).
		SensorProber: nil,
		Baseline:     baseline,
	}
	return h, &selftest.PgRunLog{Pool: pool}
}

func main() {
	ctx := context.Background()
	h, log := buildHarness(ctx)
	at := os.Getenv("SELF_TEST_AT")
	if at == "" {
		// The instant is passed in (determinism). When the harness does not supply
		// one, the session-start time is read once here at the edge (never inside
		// Run), so Run itself stays a pure function of (harness, at).
		at = nowRFC3339()
	}
	os.Exit(Run(ctx, os.Stdout, h, log, at))
}
