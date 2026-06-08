// Command doltgres-spike is the AIDOS S88 go/no-go spike MCP server (ADR 0009:
// every backend op is an MCP tool; ADR 0006 addendum 0047).
//
// It is the capability door over runtime/doltgresspike: the DETERMINISTIC verdict
// that decides whether the emitted app may opt into Doltgres, given a Measurement
// from the Testcontainers concurrency+load probe. Tools:
//
//	decide   — Measurement × Thresholds → content-addressed Decision (verdict,
//	           default target, opt-in set, reasons). PURE: a count + two compares,
//	           never an LLM. Same input → byte-identical Decision (same ID).
//	defaults — the DECLARED go/no-go thresholds (MaxPerfRatio, MaxFailedConns).
//
// THE WALL (CLAUDE.md §2): pure judgment over a supplied measurement — writes
// NOTHING to the kernel/mirrors/fitness. The default emitted-app target is ALWAYS
// plain-postgres (the escape hatch by construction); Doltgres is opt-in iff Go.
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/doltgresspike"
)

type decideInput struct {
	Measurement doltgresspike.Measurement `json:"measurement" jsonschema:"the raw probe observation: driver, conns, failedConns, perfRatio, reproducible"`
	Thresholds  *doltgresspike.Thresholds `json:"thresholds,omitempty" jsonschema:"declared go/no-go criteria; omit to use the declared defaults"`
}

type decideOutput struct {
	OK       bool                   `json:"ok"`
	Decision doltgresspike.Decision `json:"decision"`
}

func decide(_ context.Context, _ *mcp.CallToolRequest, in decideInput) (*mcp.CallToolResult, decideOutput, error) {
	th := doltgresspike.DefaultThresholds
	if in.Thresholds != nil {
		th = *in.Thresholds
	}
	d := doltgresspike.Decide(in.Measurement, th)
	return nil, decideOutput{OK: true, Decision: d}, nil
}

type defaultsOutput struct {
	OK         bool                     `json:"ok"`
	Thresholds doltgresspike.Thresholds `json:"thresholds"`
}

func defaults(_ context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, defaultsOutput, error) {
	return nil, defaultsOutput{OK: true, Thresholds: doltgresspike.DefaultThresholds}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-doltgres-spike", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "decide", Description: "S88: judge a Doltgres concurrency+load Measurement against declared Thresholds → content-addressed Decision (verdict go/no-go, default=plain-postgres always, doltgres opt-in iff Go). PURE, deterministic, writes nothing (the wall)."}, decide)
	mcp.AddTool(srv, &mcp.Tool{Name: "defaults", Description: "S88: the DECLARED go/no-go thresholds (MaxPerfRatio, MaxFailedConns) — above-the-line weights, never learned."}, defaults)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("doltgres-spike: run: %w", err))
	}
}
