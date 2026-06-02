# ChangeSet (DRAFT) — S13 fold-in of S04's AGENT_WRITE_ABOVE_WATERLINE

> Bootstrap materialization (CLAUDE.md §6): the `changesets` Postgres schema lands
> at **S20** and the SemanticDiff engine at **S21**. Until then a prior-contract
> change is recorded as this file + the executable mirrors that prove it. This
> ChangeSet is **DRAFT — not applied**: S13 does **not** rewrite S04.

## What S13 actually did (no prior artifact rewritten)

- **Added** a new package `back/runtime/blockreason` — the canonical home of the
  `BlockReason` shape (CLAUDE.md §9 *allowed*: add new files).
- Its closed `Code` enum **declares** `AGENT_WRITE_ABOVE_WATERLINE` so the canonical
  home knows S04's inherited code. This is a **forward-compatible declaration**, not
  a rewrite of S04 — `back/hooks/pretooluse/wall.go` is **untouched** and keeps its
  own `BlockReason`/`BlockCode`/`CodeAgentWriteAboveWaterline` (verified: no edit).

## The deferred change (this DRAFT proposes it; a later step applies it)

Having S04's wall **import** `back/runtime/blockreason` and **delete** its local
`BlockReason`/`BlockCode`/`CodeAgentWriteAboveWaterline` declarations — so the shape
lives in exactly one home.

### SemanticDiff (computed by hand; the S21 engine will recompute it)

| field | value |
|---|---|
| `change_type` | **refine** (consolidate a duplicated shape into one home; no behaviour change) |
| `blast_radius` | `back/hooks/pretooluse/wall.go`, `wall_test.go`, `wall_property_test.go`, `wall_bdd_test.go` — they reference the local `BlockReason`/`CodeAgentWriteAboveWaterline` |
| `requires_authority` | **below the waterline** — `blockreason` is Runtime plumbing, it writes no truth; no kernel authority needed, but it touches a prior step's public Go surface → ChangeSet-gated |
| `red_wave` | S04's wall mirrors must stay green after the import swap (re-run `go test ./hooks/pretooluse/`) |

### Why S13 does NOT apply it now

1. **Anti-overwrite (CLAUDE.md §9):** silently rewriting S04's emitter is forbidden;
   a prior-contract change is a recorded decision, not an in-passing edit.
2. **Isolation (CLAUDE.md §6):** S13 builds in its own package only. The wall's
   mirrors are S04's red set; re-pointing its types is S04-territory work that should
   land as its own tooth with S04's mirrors re-run as the gate.
3. **No regression risk now:** the duplication is inert (two identical shapes); the
   `blockreason` package is the single home all *new* sites use. S04 converges later.

## Status

`DRAFT` — recorded, not applied. Next safe step may apply it (import swap + re-run
S04's mirrors) as an isolated change. Provenance: S13 (BlockReason), 2026-05-31.
