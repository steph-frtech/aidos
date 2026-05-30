// Package changeset is the AIDOS MCP server scaffold for creating/applying/
// reverting a ChangeSet (DRAFT/APPLIED/REVERTED) atomically over spec+mirror.
// Activated at S20.
//
// SCAFFOLD ONLY (ADR 0009 honesty guard): this is a declared spec, not an
// active server. It carries no logic and registers no tools until S20 turns the
// scaffold into a working `mcp.Server` with its fault-injection test. The
// working reference is back/mcp/store/main.go.
package changeset
