# besoin-intake MCP (EL15)

The **capability door over the BesoinGraph** — the Go MCP server (Go MCP SDK, ADR 0009) that lets a
human EXPLAIN their app **level by level**, above the wall, and persists the resulting need graph in the
`besoin` Postgres schema (a NEED store, **distinct** from the truth-store, **not** an exception to the
wall — CLAUDE.md §2).

## What it is

One tool = one backend op (ADR 0009). The server NEVER runs an LLM: every routing/verdict is the pure
`back/runtime/besoin` functions (the authority). It persists an already-decided, already-hashed graph.

### Tools

| Tool | Kind | Behaviour |
|---|---|---|
| `besoin_graph_state` | read | the current graph + the enterable level (EL07) + per-level verdicts |
| `besoin_level_schema` | read | a level's required fields + outgoing ref + EL05 mapping (a client renders the right form, invents no field) |
| `besoin_list` | read | the project's captured node-row count (append-only history depth), RLS-scoped |
| `besoin_capture_product` | capture | a MAPPING rung → appends a node AND emits `Idea{Proposes:product}` (EL05) |
| `besoin_capture_journey` | capture | **NoEmit** — appends + seeds anchors, **no** Idea (no silent cast) |
| `besoin_capture_view` | capture | **NoEmit** — appends + seeds anchors, **no** Idea |
| `besoin_capture_control` | capture | emits `Idea{Proposes:control}` |
| `besoin_capture_action` | capture | emits `Idea{Proposes:action}` |
| `besoin_capture_operation` | capture | emits `Idea{Proposes:operation}` |
| `besoin_capture_entity` | capture | emits `Idea{Proposes:entity}` |
| `besoin_capture_invariant` | capture | a transversal ∀/policy band (EL14); circularity ban §8; a policy band emits **at most one** `Idea{Proposes:policy}`, an ∀ emits **none** (NoEmit) |
| `besoin_validate_level` | validate | the pure pre-flight EL07 forcing verdict (no write) |
| `besoin_classify` | validate | the four-metadata classification (EL04, wraps classify-truth) |

## The wall (fail-closed)

- GRANT: `INSERT/SELECT/UPDATE` on `besoin.node` + reuse of `ideas.idea` (the EL05 emission door).
  **No** GRANT on `kernel`/`mirrors`/`fitness`. A kernel write is **always** refused (the mirror
  asserts `WroteKernel == false`).
- An off-altitude capture (EL12 schema mismatch) is **refused** with a `BlockReason`; the graph is
  unchanged. A fuzzy node is routed to `/spike` via `idea_capture → idea_grill → idea_spike`.
- A capture at a not-yet-enterable level fails closed.

## Project isolation (S55 forward dependency)

Each session sets the GUC `aidos.project`; a Row-Level Security policy on `besoin.node` keyed on that
GUC makes project A's graph **invisible** to a B-scoped session. Until S55 back-fills the typed
`ProjectScope`, the RLS policy here is the isolation.

## Determinism-first

The BesoinGraph build + addressing are pure total functions: the id of a captured row is the
content-address (`records.Hash(Canonicalize)`) of the graph — same answers → same `graph_hash`,
regardless of order. The reproducibility mirror `determinism_property_test.go` pins same input → same
output.

## Run

```sh
AIDOS_BESOIN_DSN=postgres://aidos_agent:…@host/aidos go run ./back/mcp/besoin-intake
```

DSN: `AIDOS_BESOIN_DSN` (the role with the besoin-schema grant). Transport: stdio.
