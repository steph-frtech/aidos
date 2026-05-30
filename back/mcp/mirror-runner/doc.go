// Package mirrorrunner is the AIDOS MCP server scaffold for running a mirror /
// replaying all mirrors and reporting green/red. Activated at S05.
//
// SCAFFOLD ONLY (ADR 0009 honesty guard): this is a declared spec, not an
// active server. It carries no logic and registers no tools until S05 turns the
// scaffold into a working `mcp.Server` with its fault-injection test. The
// working reference is back/mcp/store/main.go.
package mirrorrunner
