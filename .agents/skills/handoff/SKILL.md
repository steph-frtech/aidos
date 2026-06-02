---
name: handoff
description: Compact the current AIDOS Workbench cockpit/graph state into a deterministic handoff document the next agent can resume from — the WorkbenchGraph's graph_hash, the open node, the red-wave state, and the open OpenQuestions. Use when handing off a cockpit session, when someone says "handoff", "compact the cockpit state", "hand this to the next agent", or before pausing work on the graph.
argument-hint: "What will the next session focus on?"
---

# /handoff — compact the cockpit state for the next agent (AIDOS step S44)

`/handoff` is the replayable gesture that snapshots the current AIDOS Workbench
**cockpit/graph state** into a compact, deterministic handoff artifact a fresh agent
can resume from. It is a **read-only** gesture: it reads the WorkbenchGraph projection
and the provenance OpenQuestions; it **mutates no truth** (the wall — CLAUDE.md §2).

## What it captures (and nothing else)

1. **`graph_hash`** — the content-address of the current WorkbenchGraph
   (`back/runtime/reality/workbenchgraph.BuildGraph` / `front/web/lib/workbench-graph.ts`).
   Same kernel head ⇒ same `graph_hash`; a changed hash is the next agent's first signal
   that the graph drifted. Snapshot drift is **computed**, never hunted.
2. **The open node** — which graph node (id + kind + route) the session was last focused
   on (e.g. `createOrder` / operation / `/operation`).
3. **The red-wave state** — the `red_wave_state` (S22) of the open node and any red nodes
   in the current graph, verbatim from truth (never re-derived, never hand-set).
4. **Open OpenQuestions** — the `provenance` OpenQuestions still unresolved (e.g. an
   unpinned edge/adjacency, a candidate `workbench_graph_read` op, a snapshot flake).
5. **Suggested next gestures** — the skills the next agent should invoke to continue.

## How

1. Build (or read) the current WorkbenchGraph and record its `graph_hash`.
2. Note the open node and the red-wave state of the graph.
3. List the open OpenQuestions by ref (do not re-explain artifacts already captured in
   ADRs / plans / commits — reference them by path).
4. Emit a compact, deterministic handoff artifact under `docs/handoff/` (a markdown file:
   `docs/handoff/<graph_hash-short>.md`), or — for a throwaway session — the OS temp dir.
   The artifact is byte-stable for the same graph state (no clock-in-content, no rng).
5. Redact any secrets. Tailor the focus to the passed arguments.

## Honesty rules (non-negotiable, CLAUDE.md §8)

- **Never invent** a node, an edge/relation, a `targetId`, a scope, an incident, an
  operation/entity ref, a legend color, or any business rule the kernel/mirrors/context
  truth does not pin. An **unpinned edge/adjacency becomes an OpenQuestion** in
  `provenance`, never a guessed adjacency or a guessed color.
- A node's `red_wave_state` / `liveness` / `truth_type` is **computed** from S22/S06/S14 —
  carry it verbatim, never hand-set it.
- `/handoff` **writes no truth**. It reads the projection and emits a doc; the kernel and
  the brain are out of reach (the wall). It never writes memory.
