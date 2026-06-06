---
name: red-backlog
description: The deterministic topo-sort /red-backlog gesture (EL17) — run RedBacklog(graph) → BacklogItem[] over a BesoinGraph: topologically sort the emitted Ideas (the mapping rungs, EL16) along the constrains/seeds edges into the EXACT architectural promotion order the app-builder (S64) opens its /goal in (the §23 verticale). Use when the user wants to order the emitted backlog by dependency, "topo-sort the red backlog", "in what order do the goals open", hand the ordered need graph off to S64, or annexe each Idea's expected mirror form. Each item carries its anchors_above (INCLUDING the NoEmit journey/view rungs that constrain it without emitting) and its expected mirror form via LevelMirrorForm (EL10) — ANNEXED, never written. A cycle over the emitting rungs is REFUSED with BESOIN_CYCLE (never an arbitrary order). The sort is a PURE algorithm (Kahn, deterministic tie-break), no LLM enters. Writes nothing — the mirror form is annexed not written, no Idea is persisted; promotion stays /goal.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# /red-backlog (EL17 — the deterministic topological sort of the BesoinGraph's backlog)

The **ordering** gesture of the *compound du besoin* track. `RedBacklog(graph) → BacklogItem[]`
(`back/runtime/besoin/red_backlog.go` + the `besoin_red_backlog` MCP tool) topologically sorts the
**emitted Ideas** (the resolved MAPPING rungs, EL16) along the `constrains`/`seeds` edges into the
**exact promotion order** the app-builder (S64+) opens its `/goal` in — which **IS** the §23 verticale.
This is *how the requirements doc follows the architecture*: the order is **not arbitrary, it is the
topology of the graph that is the architecture**.

> **The wall (CLAUDE.md §2).** `RedBacklog` reads only the BesoinGraph **above the line** and writes
> **NOTHING**: no kernel, no mirror, no Idea persistence. The expected mirror **form is ANNEXED, never
> written** — the mirror stays to the user via `/goal` (the hand-off to S64). Every Idea is a **draft**
> with no version and no mirror (`HasMirror` always false).

> **Determinism-first (CLAUDE.md §6/§8).** The sort is a **PURE algorithm** — Kahn's topological sort
> over the emitting rungs, ties broken by the **declared descent rank** → a **TOTAL** order. **No LLM
> orders the backlog.** Same graph → byte-identical backlog (the reproducibility property pins it).

## What it does

For a BesoinGraph `g`:

1. **Emit** the Ideas (EL16, `EmitIdeasWithProvenance`) — one per resolved MAPPING rung. NoEmit rungs
   (`journey`/`view`/`invariant`) emit nothing.
2. **Topo-sort** the emitting rungs along the `constrains`/`seeds` edges that connect two emitting rungs
   (`From` before `To`). Ties broken by descent rank → a total deterministic order.
3. **Annex**, per item:
   - the projected `Idea` (content-addressed, draft, provenance human);
   - the **expected mirror form** via `LevelMirrorForm` (EL10) — `product`/`journey`→Gherkin N0,
     `invariant`→property N1, `operation`→fixture N2, `entity`→property/contract, etc.;
   - its **`anchors_above[]`** — the frozen SOURCE rungs strictly above, **INCLUDING the NoEmit
     `journey`/`view` rungs** that constrain it without emitting (the compound made visible);
   - its **`@version` ref resolution** — a deeper ref that resolves (target rung exists resolved) vs a
     dangling forward-dep carried as a **non-blocking OpenQuestion** (bootstrap §6, never dropped).
4. **Refuse a cycle** — if the edges over the emitting rungs form a cycle there is no total order, so
   the backlog is **refused with `BESOIN_CYCLE`** (a `*CycleError`), never an arbitrary order.

## Invariants (the red property mirror)

- **TOTAL + DETERMINISTIC** — every emitted Idea appears exactly once; same graph → same ordered list.
- **TOPO-CORRECT** — every `constrains`/`seeds` edge `L→D` places `L`'s item before `D`'s item.
- **CYCLE-REFUSED** — an edge cycle is `BESOIN_CYCLE`.
- **NoEmit-IN-ANCHORS** — NoEmit rungs appear in `anchors_above[]`, **never** in the item list.
- **FORM-ANNEXED** — each item carries `LevelMirrorForm(level)`, annexed never written.

## Doors

- `RedBacklog(g)` — the stored-status door (a rung is resolved iff its node Status is `resolved`).
- `RedBacklogUnion(g, metaOf)` — the door-facing union (resolved iff stored OR the pure EL07
  `CanDescend(g, level, meta).Enough`), used by the `besoin_red_backlog` MCP tool against the persisted
  graph.

## How to run

```bash
# the Go authority + its property/fixture mirrors
go test ./back/runtime/besoin/ -run RedBacklog -count=1

# the byte-equivalent TypeScript twin (Workbench)
cd front/web && npx vitest run lib/red-backlog.test.ts

# the MCP tool (besoin_red_backlog) integration (Testcontainers, real Postgres)
go test ./back/mcp/besoin-intake/ -run TestBesoinIntake_RedBacklogEL17 -count=1
```

The Workbench route `/red-backlog` executes the sort from the screen (ui-completeness): shape the
already-decided graph, "Sort the RedBacklog" runs `redBacklog(nodes, edges)`, "Inject a cycle" proves
the `BESOIN_CYCLE` refusal. Proven by `tests/e2e/red-backlog.spec.ts`.

## What it is NOT

- **Not** a writer — it annexes the mirror form, it never writes a mirror; promotion is `/goal`.
- **Not** an LLM ordering — the topo sort is a pure deterministic algorithm.
- **Not** a re-emitter — it consumes EL16's emission; it does not re-cast NoEmit rungs.
