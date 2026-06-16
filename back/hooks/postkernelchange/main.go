package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/runtime/redwork"
)

// main is the PostKernelChange hook entrypoint (harness-invoked, §74/§98). It connects to the
// truth-store via the agent role DSN (AIDOS_DSN), computes the red wave from the harness-supplied
// kernel change, and APPENDS the items into runtime.red_work_queue (below the waterline).
//
// The bump-source feed (the bumped set / link graph / heads) is a forward dependency owned by
// S02/S24 (OpenQuestion OQ-S22-1): until that runtime feed lands, this binary stays a no-op shell
// (no bump ⇒ empty wave, §42 — it never fabricates a bump). The LIVE trigger today is the
// ChangeSet apply handler (back/mcp/changeset/changesetsrv): a ChangeSet flipping DRAFT → APPLIED
// IS a kernel bump, and it fires the SAME fan-out seam through the SAME reusable library
// back/runtime/redwork (FireRedWave + PgRedWorkQueue). There is NO red-wave logic in either
// caller — both delegate to the pure engine (determinism-first); extracting the seam into redwork
// keeps them a single behaviour, no twin (reuse, don't reinvent — CLAUDE.md §0).
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

	// The fan-out is wired and ready: redwork.FireRedWave computes the wave, the queue persists it.
	q := &redwork.PgRedWorkQueue{Pool: pool}

	// The runtime bump-source feed lands at a later step (OQ-S22-1). With no change handed in, the
	// hook fires an empty wave (no bump ⇒ nothing to enqueue, §42) — it never fabricates a bump.
	rows := redwork.FireRedWave(redwork.KernelChange{})
	if err := q.Enqueue(ctx, rows); err != nil {
		fmt.Fprintf(os.Stderr, "postkernelchange: enqueue: %v\n", err)
		os.Exit(1)
	}
	fmt.Fprintln(os.Stderr, "postkernelchange: no kernel change supplied (bump-source feed is OQ-S22-1) — empty wave")
}
