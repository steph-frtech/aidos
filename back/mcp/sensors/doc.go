// Package sensors is the AIDOS MCP server scaffold for running computational
// sensors on changed code (gofmt/vet, lint, archtest, affected tests).
// Activated at S07.
//
// SCAFFOLD ONLY (ADR 0009 honesty guard): this is a declared spec, not an
// active server. It carries no logic and registers no tools until S07 turns the
// scaffold into a working `mcp.Server` with its fault-injection test. The
// working reference is back/mcp/store/main.go.
package sensors
