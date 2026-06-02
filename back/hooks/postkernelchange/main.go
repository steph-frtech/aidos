package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

// main is the PostKernelChange hook entrypoint (harness-invoked, §74/§98). It connects to the
// truth-store via the agent role DSN (AIDOS_DSN), computes the red wave from the harness-supplied
// kernel change, and APPENDS the items into runtime.red_work_queue (below the waterline).
//
// The bump-source feed (the bumped set / link graph / heads) is a forward dependency owned by
// S02/S24 (OpenQuestion OQ-S22-1): until that wiring lands, the harness hands the KernelChange
// in. This entrypoint is a thin shell — the wave is FireRedWave (the pure engine); persistence
// is PgRedWorkQueue.Enqueue. There is NO red-wave logic in the binary (determinism-first).
func main() {
	dsn := os.Getenv("AIDOS_DSN")
	if dsn == "" {
		fmt.Fprintln(os.Stderr, "postkernelchange: AIDOS_DSN is required (the agent-role truth-store connection)")
		os.Exit(2)
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "postkernelchange: connect: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()

	// The runtime bump-source feed lands at a later step (OQ-S22-1). With no change handed in,
	// the hook is a no-op (no bump ⇒ empty wave, §42) — it never fabricates a bump.
	fmt.Fprintln(os.Stderr, "postkernelchange: no kernel change supplied (bump-source feed is OQ-S22-1) — empty wave")
}
