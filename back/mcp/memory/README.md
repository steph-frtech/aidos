# MCP server: `memory` — SCAFFOLD (activated at S31)

> **Status: scaffold / declared spec, NOT a working server.** Per ADR 0009's
> honesty guard, an MCP server is front-loaded only as a *spec*; it is
> **activated at S31** with a working implementation and a fault-injection test.
> A scaffold registers no tools and runs no logic. The working reference is
> [`back/mcp/store/main.go`](../store/main.go).

## Purpose

The single capability door (ADR 0009: every backend op is an MCP tool) for the
**`brain` schema** — `MemoryItem`s (episodic, semantic, procedural…) with
pgvector embeddings. Store and recall-by-similarity, but **only through the
MemoryFirewall**: recall is filtered/scoped so memory informs without leaking or
poisoning the kernel. Memory is advisory context, never truth.

## The op

`store/recall MemoryItem by similarity (pgvector) behind the MemoryFirewall`

Store embeds a MemoryItem and persists it. Recall embeds a query, runs a pgvector
nearest-neighbour search, and returns matches *after* the MemoryFirewall applies
scope/trust filtering. The firewall is mandatory on every recall.

## Tools (one tool = one backend op)

| Tool | Op | Direction |
|---|---|---|
| `memory_store` | persist a MemoryItem (+ embedding) | write `brain` |
| `memory_recall` | similarity search (pgvector) through the MemoryFirewall | read `brain` |

### Input / output sketch

```
memory_store  in  { kind:"episodic"|"semantic"|"procedural", content: string, tags?: string[] }
                                                  → out { item_id }
memory_recall in  { query: string, k?: int, scope?: string }
                                                  → out { items: [{item_id, kind, content, score}] }   // post-firewall
```

## Permissions — read/write zones

- **Reads/Writes:** `brain` schema only (MemoryItems + pgvector embeddings).
- **Mandatory filter:** every recall passes through the **MemoryFirewall** (scope + trust); raw unscoped recall is not exposed.
- **Forbidden (the wall, CLAUDE.md §2):** no write to `kernel`, `mirrors`, or `fitness`. Memory may *suggest* an Idea (via `idea-intake`) but can never write truth; it never feeds the kernel directly.

## Related hook

A memory-firewall guard (sensor) enforces that no recall path bypasses the
firewall; its fault-injection test breaks the firewall and asserts recall is
refused.

## Activated at step **S31**
