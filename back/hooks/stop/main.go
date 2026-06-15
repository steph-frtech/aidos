package main

import (
	"context"
	"encoding/json"
	"io"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/mirror/completeness"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
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

// goalSource is the goal-check half's input seam (S29). It defaults to NoGoalSource
// (no open goal → goal-check is a no-op) so the binary and the prior completeness
// tests run unchanged; the production binary wires the SELECT-only Postgres source,
// and the goal fault-injection test swaps it to stage an open goal. This is the
// non-bypassable, ADDITIVE composition of the two halves (a new guardrail ADDS,
// never REMOVES — CLAUDE.md §5 meta-loop).
var goalSource GoalCheckSource = NoGoalSource{}

// Run is the binary entrypoint: read the Stop event, run the NON-GAMEABLE goal-check
// (red set → green ∧ prior green intact ∧ mutation ≥ floor ∧ no monster — KRD §57 ①,
// S29) THEN the completeness gate (`goal-check && completeness-check`, doc.go),
// record the run append-only (when a DB is wired), and return the process exit code
// (0 = allow Stop, 2 = block Stop). On block it writes the BlockReason JSON to stdout
// so the harness can surface the actionable refusal. A decode error — or a goal that
// is still red / a broken prior green / a low mutation / a monster — fails closed
// (block): an unverifiable or not-yet-done Stop does NOT pass (KRD §82), never a
// silent pass. "Done" is COMPUTED here, never declared by the agent (CLAUDE.md §8).
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

	// (1) Goal-check half (S29) — the non-gameable stop. Runs FIRST: if the goal is
	// still red (or prior green broken / mutation below floor / a monster), the Stop
	// is blocked before the completeness half, and the agent cannot self-declare done.
	if br := CheckGoal(ctx, goalSource); br != nil {
		writeGoalBlock(stdout, br)
		return exitBlock
	}

	// (2) Completeness half (S12) — no monster in the head cut.
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

// writeGoalBlock emits the goal-check half's actionable BlockReason (S13 shape, reused
// from back/runtime/goal via blockreason). Distinct from writeBlock only by payload
// type; both surface an actionable refusal to the harness on a blocked Stop.
func writeGoalBlock(w io.Writer, br *blockreason.BlockReason) {
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
		// Wire the SELECT-only Postgres goal-check source (ADR 0081, issue A): the
		// goal-check half now reads the REAL red-set verdicts + the REAL densimètre
		// score + the declared floor + the monster set, so "done" is computed over
		// live truth, not the in-memory no-op. ONLY when a pool exists — absent a
		// DATABASE_URL the default NoGoalSource stays installed (goal-check is a no-op,
		// fail-open without a DB), so the interactive cockpit's Stop is UNCHANGED.
		goalSource = NewPgGoalCheckSource(pool)
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
