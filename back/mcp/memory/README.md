# `memory` MCP server — the `/brain` memory adapter (S31)

The single capability door (ADR 0009) over the engine-side `/brain` memory adapter: write a
`MemoryItem` and **recall it by similarity** over pgvector, across the four *indexable* KRD memories
(episodic / semantic / procedural / structural, KRD §136). The Workbench and other agents call these
tools; they never touch `brain.memory_item` directly.

## Tools (one per backend op)

| Tool | Does |
|---|---|
| `memory_write` | Append a `MemoryItem` (content-addressed, append-only); returns its id. |
| `memory_recall` | Recall the nearest memories by similarity, `kind`/`branch`-filtered, top-`k`. |
| `memory_get` | Read one `MemoryItem` by content-addressed id. |

## Context fuel, never truth

This server reaches **nothing** above the wall. The store is **below the waterline**: the agent role
holds `SELECT + INSERT` on `brain.memory_item` only — **no** `UPDATE`/`DELETE` (memory is
append-only; supersession is a new row, expiry is `expires_at`). The MemoryFirewall promotion flow
(`Memory → ContextPack → Idea → Mirror → Goal → Kernel`, §119.1) is a **separate** concern.

## Injection seam

The server is constructed with whichever `memory.Store` backend is configured:

- **mock** — the deterministic `MockStore` (no DB) when `AIDOS_ARCHIVE_DSN` is empty. Used by tests
  and by the Workbench mock toggle.
- **pgx** — `PgxStore` over pgvector (HNSW + cosine, ADR 0025) when `AIDOS_ARCHIVE_DSN` is set.

The `Embedder` is injected too — the deterministic `HashEmbedder` (seed from `AIDOS_MEMORY_SEED`,
default 31) so recall is reproducible; the runtime would inject a real 384-dim model.

## Run

```sh
AIDOS_ARCHIVE_DSN=postgres://... go run ./back/mcp/memory   # pgvector backend
go run ./back/mcp/memory                                    # in-memory mock backend
```

Transport: stdio.
