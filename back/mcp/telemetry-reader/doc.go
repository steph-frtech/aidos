// Package telemetryreader is the AIDOS MCP server scaffold for reading
// OpenTelemetry signals / incidents from the base. Activated at S43.
//
// SCAFFOLD ONLY (ADR 0009 honesty guard): this is a declared spec, not an
// active server. It carries no logic and registers no tools until S43 turns the
// scaffold into a working `mcp.Server` with its fault-injection test. The
// working reference is back/mcp/store/main.go.
package telemetryreader
