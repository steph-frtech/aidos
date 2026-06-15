// Command telemetry-sink is the OTLP→Postgres span sink service (ADR 0076 phase 2). It
// serves the OTLP/HTTP traces endpoint and persists each span into telemetry.span so the
// emitted app's reality (traces) STOPS being lost to the collector's debug exporter and
// becomes readable by telemetry-reader → reality-ingest (the prod-reality learning loop).
//
// Env:
//
//	AIDOS_TELEMETRY_SINK_ADDR  HTTP listen address (default :4319)
//	AIDOS_TELEMETRY_SINK_DSN   Postgres DSN with INSERT on telemetry.span
//	                           (falls back to POSTGRES_CONNECTION_STRING / DATABASE_URL)
//
// Below the wall: telemetry is observed reality (runtime), not kernel/mirrors/fitness.
package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/runtime/telemetrysink"
)

func dsn() string {
	for _, k := range []string{"AIDOS_TELEMETRY_SINK_DSN", "POSTGRES_CONNECTION_STRING", "DATABASE_URL"} {
		if v := os.Getenv(k); v != "" {
			return v
		}
	}
	return ""
}

func main() {
	ctx := context.Background()
	addr := os.Getenv("AIDOS_TELEMETRY_SINK_ADDR")
	if addr == "" {
		addr = ":4319"
	}
	d := dsn()
	if d == "" {
		log.Fatal("telemetry-sink: no DSN (set AIDOS_TELEMETRY_SINK_DSN / POSTGRES_CONNECTION_STRING)")
	}
	pool, err := pgxpool.New(ctx, d)
	if err != nil {
		log.Fatalf("telemetry-sink: pool: %v", err)
	}
	defer pool.Close()

	mux := telemetrysink.NewMux(&telemetrysink.Writer{Pool: pool})
	log.Printf("telemetry-sink: serving OTLP/HTTP traces on %s → telemetry.span", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("telemetry-sink: http: %v", err)
	}
}
