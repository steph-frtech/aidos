// Package memory is the AIDOS MCP server scaffold for storing/recalling a
// MemoryItem by similarity (pgvector) behind the MemoryFirewall.
// Activated at S31.
//
// SCAFFOLD ONLY (ADR 0009 honesty guard): this is a declared spec, not an
// active server. It carries no logic and registers no tools until S31 turns the
// scaffold into a working `mcp.Server` with its fault-injection test. The
// working reference is back/mcp/store/main.go.
package memory
