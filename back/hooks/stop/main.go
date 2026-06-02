package main

import (
	"context"
	"encoding/json"
	"io"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/mirror/completeness"
)

const (
	exitAllow = 0
	exitBlock = 2
)

// StopEvent is the decoded Stop lifecycle event. The completeness gate reads the
// CUT from the head projection (ADR 0015), not from this payload — so the event
// carries only the optional ref for the audit trail. A decode error fails closed.
type StopEvent struct {
	Ref string `json:"ref"`
}

// DecodeEvent reads one JSON Stop event. An empty body is a valid (ref-less) Stop;
// a malformed body fails closed at the caller.
func DecodeEvent(r io.Reader) (StopEvent, error) {
	b, err := io.ReadAll(r)
	if err != nil {
		return StopEvent{}, err
	}
	var ev StopEvent
	if len(b) == 0 {
		return ev, nil
	}
	if err := json.Unmarshal(b, &ev); err != nil {
		return StopEvent{}, err
	}
	return ev, nil
}

// Run is the binary entrypoint: read the Stop event, load the current cut, run the
// completeness gate, record the run append-only (when a DB is wired), and return
// the process exit code (0 = allow Stop, 2 = block Stop). On block it writes the
// BlockReason JSON to stdout so the harness can surface the actionable refusal. A
// decode error fails closed (block) — an unparseable event is a failure made
// explicit (KRD §82), never a silent pass.
func Run(ctx context.Context, stdin io.Reader, stdout io.Writer, src CutSource, log RunLog) int {
	if _, err := DecodeEvent(stdin); err != nil {
		writeBlock(stdout, &completeness.BlockReason{
			Code:        completeness.CodeIncomplete,
			Severity:    "error",
			Explanation: "Événement Stop illisible — la porte de complétude échoue fermé (fail-closed) : un Stop non vérifiable ne passe pas (KRD §82 .passthrough()).",
			HowToFix: []string{
				"Vérifiez la forme de l'événement Stop (JSON : { \"ref\": \"…\" } ou un corps vide).",
			},
		})
		return exitBlock
	}

	decision := CheckCompleteness(ctx, src, log)
	if decision.Verdict == completeness.VerdictBlock {
		writeBlock(stdout, decision.BlockReason)
		return exitBlock
	}
	return exitAllow
}

func writeBlock(w io.Writer, br *completeness.BlockReason) {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(br)
}

// openLog wires the Pg run-log when DATABASE_URL is set; otherwise the hook runs
// without persistence (the verdict still holds — the audit log is best-effort, the
// gate is the verdict).
func openLog(ctx context.Context) (*pgxpool.Pool, RunLog) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return nil, nil
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, nil
	}
	return pool, &PgRunLog{Pool: pool}
}

func main() {
	ctx := context.Background()
	pool, log := openLog(ctx)
	var src CutSource = EmptyCutSource{}
	if pool != nil {
		src = &PgCutSource{Pool: pool}
	}
	os.Exit(Run(ctx, os.Stdin, os.Stdout, src, log))
}

// EmptyCutSource is the no-DB fallback: it reports an EMPTY cut (no layers, no
// mirrors → no monster → pass). It exists so the binary is runnable without a DB;
// the production gate always uses PgCutSource. It is NOT a silent pass over real
// truth — it is the absence of any truth to check.
type EmptyCutSource struct{}

func (EmptyCutSource) Load(context.Context) (completeness.Cut, error) {
	return completeness.Cut{}, nil
}
