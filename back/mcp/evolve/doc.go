// Package evolve is the AIDOS MCP server scaffold for running an evolution round
// in the sandbox (variants → branches), gated by mirrors. Activated at S42.
//
// SCAFFOLD ONLY (ADR 0009 honesty guard): this is a declared spec, not an
// active server. It carries no logic and registers no tools until S42 turns the
// scaffold into a working `mcp.Server` with its fault-injection test. The
// working reference is back/mcp/store/main.go.
package evolve
