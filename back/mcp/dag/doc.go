// Package dag is the AIDOS MCP server scaffold for branch / checkout-ancestor /
// rebranch / merge over the version DAG. Activated at S24.
//
// SCAFFOLD ONLY (ADR 0009 honesty guard): this is a declared spec, not an
// active server. It carries no logic and registers no tools until S24 turns the
// scaffold into a working `mcp.Server` with its fault-injection test. The
// working reference is back/mcp/store/main.go.
package dag
