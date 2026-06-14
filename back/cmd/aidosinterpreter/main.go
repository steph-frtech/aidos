// Command aidosinterpreter is the SIDECAR INTERPRETER service — the runnable Go backend the
// emitted Hono server (honoemit.EmitServer) routes every operation to. The emitted handler does
// `const result = await deps.interpret(opName, input)`; this process is what that `interpret` port
// resolves to (ADR 0040 Déc.7). It boots an HTTP server exposing:
//
//	GET  /healthz   → liveness + the operation inventory
//	POST /interpret → { operation, input, auth } → runs operation.Interpret → { result, events }
//
// THE SEAMS. If DATABASE_URL is set, the sidecar runs the REAL pgx seams over the EMITTED app
// schema (interpretsvc.DBDeps — read = SELECT, mutate = INSERT/DELETE against the app's own
// tables). If it is NOT set, it boots in DEMO mode with the in-memory seams (interpretsvc.MemDeps)
// seeded with a Cart, so `curl localhost:8080/interpret -d '{"operation":"createOrder",…}'` runs
// the full createOrder pipeline with no database — a self-contained, runnable proof.
//
// THE OPERATION CUT (honesty / OpenQuestion OQ-SIDECAR-registry). Today the cut is the createOrder
// ANCHOR (operation.CreateOrder()), reconstructed in Go — the same AST honoemit wires into routes.
// A real loader from the project's kernel.operation rows (decode the JSONB AST → operation.Operation)
// is the next tooth; the service shape is unchanged when it lands (NewRegistry takes any cut).
//
// THE WALL (§2). The sidecar EXECUTES operations (a below-the-line runtime effect). It writes NO
// Kernel truth: it never touches kernel/mirrors/fitness; its DB writes land in the emitted app
// schema only. It re-implements NO rule — operation.Interpret is the source.
//
// CONFIG (env): PORT (default 8080), DATABASE_URL (the EMITTED app DSN; absent → demo mode).
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/runtime/interpretsvc"
)

func main() {
	if err := run(); err != nil {
		log.Fatalf("aidosinterpreter: %v", err)
	}
}

func run() error {
	port := envOr("PORT", "8080")
	dsn := os.Getenv("DATABASE_URL")

	// The operation cut: the createOrder anchor (OQ-SIDECAR-registry — a kernel.operation loader is
	// the next tooth). NewRegistry rejects a duplicate/nameless op (an unambiguous cut).
	reg, err := interpretsvc.NewRegistry([]operation.Operation{operation.CreateOrder()})
	if err != nil {
		return fmt.Errorf("build registry: %w", err)
	}

	// The seams: real pgx over the emitted schema if DATABASE_URL is set, else in-memory demo seams.
	deps, closeDeps, mode, err := buildDeps(dsn)
	if err != nil {
		return err
	}
	defer closeDeps()

	srv := interpretsvc.NewServer(reg, deps)
	httpSrv := &http.Server{
		Addr:              ":" + port,
		Handler:           srv,
		ReadHeaderTimeout: 10 * time.Second,
	}

	log.Printf("aidosinterpreter: sidecar listening on :%s (mode=%s, operations=%v)", port, mode, reg.Names())
	log.Printf("aidosinterpreter:   GET  /healthz")
	log.Printf("aidosinterpreter:   POST /interpret  { operation, input, auth }")
	return httpSrv.ListenAndServe()
}

// buildDeps picks the seams: pgx-backed DBDeps over the emitted app DSN, or the seeded in-memory
// demo seams when no DSN is configured. It returns the Deps, a close func, and the mode label.
func buildDeps(dsn string) (operation.Deps, func(), string, error) {
	if dsn == "" {
		// DEMO mode: in-memory seams seeded with a Cart so createOrder runs with no database.
		store := interpretsvc.NewMemStore()
		store.Seed("Cart", map[string]any{
			"id": "cart-1",
			"items": []any{
				map[string]any{"product": "widget", "price": 10.0, "quantity": 2.0},
				map[string]any{"product": "gadget", "price": 5.0, "quantity": 1.0},
			},
		})
		return interpretsvc.NewMemDeps(store), func() {}, "demo (in-memory)", nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	dbdeps, err := interpretsvc.OpenDBDeps(ctx, dsn)
	if err != nil {
		return nil, nil, "", fmt.Errorf("open app DB: %w", err)
	}
	return dbdeps, dbdeps.Close, "db (pgx, emitted schema)", nil
}

// envOr returns the env var or a default.
func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
