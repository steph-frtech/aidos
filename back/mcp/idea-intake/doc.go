// Package ideaintake is the AIDOS MCP server scaffold for submitting a
// candidate-truth (Idea) with provenance; it never writes the kernel.
// Activated at S27.
//
// SCAFFOLD ONLY (ADR 0009 honesty guard): this is a declared spec, not an
// active server. It carries no logic and registers no tools until S27 turns the
// scaffold into a working `mcp.Server` with its fault-injection test. The
// working reference is back/mcp/store/main.go.
package ideaintake
