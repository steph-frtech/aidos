// Command telemetry-reader is the AIDOS Runtime telemetry-reader MCP server
// (KRD §1521/§1524; ADR 0009) — the capability that CLOSES THE EXTERNAL LOOP by
// reading what the system does in reality: "le tool qui ferme la boucle externe : il
// rapporte ce que fait le système en vrai."
//
// The behaviour lives in the in-process library telemetryreadersrv (so the gateway
// dispatcher (S59) can wire the SAME server in-process). This binary only builds the three
// persistence seams (incidents/telemetry/ideas) from its env and serves the library server
// over stdio. THE WALL (CLAUDE.md §2): there is deliberately NO tool that writes the kernel/
// mirrors/fitness. DSNs come from AIDOS_INCIDENTS_DSN / AIDOS_TELEMETRY_DSN / AIDOS_IDEAS_DSN.
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/steph-frtech/aidos/back/mcp/telemetry-reader/telemetryreadersrv"
)

func main() {
	incDSN := os.Getenv("AIDOS_INCIDENTS_DSN")
	telDSN := os.Getenv("AIDOS_TELEMETRY_DSN")
	ideasDSN := os.Getenv("AIDOS_IDEAS_DSN")
	if incDSN == "" || telDSN == "" || ideasDSN == "" {
		log.Fatal("telemetry-reader: AIDOS_INCIDENTS_DSN, AIDOS_TELEMETRY_DSN and AIDOS_IDEAS_DSN are required")
	}
	ctx := context.Background()

	inc, err := telemetryreadersrv.NewIncidentStore(ctx, incDSN)
	if err != nil {
		log.Fatal(fmt.Errorf("telemetry-reader: open incidents store: %w", err))
	}
	defer inc.Close()

	tel, err := telemetryreadersrv.NewTelemetryStore(ctx, telDSN)
	if err != nil {
		log.Fatal(fmt.Errorf("telemetry-reader: open telemetry store: %w", err))
	}
	defer tel.Close()

	ideaStore, err := telemetryreadersrv.NewIdeaCaptureStore(ctx, ideasDSN)
	if err != nil {
		log.Fatal(fmt.Errorf("telemetry-reader: open ideas store: %w", err))
	}
	defer ideaStore.Close()

	srv := telemetryreadersrv.NewServer(inc, tel, ideaStore)
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("telemetry-reader: run: %v", err)
	}
}
