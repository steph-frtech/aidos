package main

import (
	"context"
	"encoding/json"
	"io"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	exitAllow = 0
	exitBlock = 2
)

// DecodeEvent reads one JSON PostToolUse event. A decode error fails closed at the
// caller (an unparseable event must not slip past the sensors).
func DecodeEvent(r io.Reader) (Event, error) {
	var ev Event
	if err := json.NewDecoder(r).Decode(&ev); err != nil {
		return Event{}, err
	}
	return ev, nil
}

// Run is the binary entrypoint: read the event on stdin, run the computational
// sensors over the changed code, record the run append-only (when a DB is wired),
// and return the process exit code (0 = allow, 2 = block). On block it writes the
// BlockReason JSON to stdout so the harness can surface the actionable refusal.
// A decode error fails closed (block) — an unparseable event is itself a failure
// made explicit (KRD §82), never a silent pass.
func Run(ctx context.Context, stdin io.Reader, stdout io.Writer, runner CheckRunner, log RunLog) int {
	ev, err := DecodeEvent(stdin)
	if err != nil {
		writeBlock(stdout, &BlockReason{
			Code:        CodeSensorFailed,
			Severity:    "error",
			Explanation: "Événement PostToolUse illisible — les sensors échouent fermé (fail-closed) : un diff non vérifiable ne passe pas (KRD §82 .passthrough()).",
			HowToFix: []string{
				"Vérifiez la forme de l'événement PostToolUse (JSON : tool_name + tool_input.file_path / file_paths, ou path).",
			},
		})
		return exitBlock
	}

	decision := RunSensors(ctx, ev, runner, log)
	if decision.Verdict == VerdictBlock {
		writeBlock(stdout, decision.BlockReason)
		return exitBlock
	}
	return exitAllow
}

func writeBlock(w io.Writer, br *BlockReason) {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(br)
}

// openLog wires the Pg run-log when DATABASE_URL is set; otherwise the hook runs
// without persistence (the verdict still holds — the audit log is best-effort, the
// gate is the verdict).
func openLog(ctx context.Context) RunLog {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return nil
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil
	}
	return &PgRunLog{Pool: pool}
}

func main() {
	ctx := context.Background()
	os.Exit(Run(ctx, os.Stdin, os.Stdout, NewToolRunner(), openLog(ctx)))
}
