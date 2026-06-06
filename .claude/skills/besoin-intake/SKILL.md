---
name: besoin-intake
description: The capability-door /besoin-intake gesture (EL15) — drive the besoin-intake MCP (Go MCP SDK, ADR 0009), the single capability door above the BesoinGraph. Use when the user wants to read the BesoinGraph state + the enterable level, read a level's schema (the required fields a form renders), capture an answer per rung (product/journey/view/control/action/operation/entity/invariant), validate a level pre-flight, or classify a level's four metadata — all ABOVE the wall. Each capture on a MAPPING rung emits an Idea via the legal idea_capture door (EL05); a NoEmit rung (journey/view/invariant) emits none (no silent cast). The MCP is DETERMINISTIC: no LLM enters the server, the code judges. Writes only the `besoin` schema (+ reuses `ideas`), never kernel/mirrors/fitness — a kernel write is always refused (GRANT); projects are isolated by RLS (S55).
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# /besoin-intake (EL15 — the capability door above the BesoinGraph)

The **capability-door** gesture of the *compound du besoin* track. The besoin-intake MCP
(`back/mcp/besoin-intake/`, Go MCP SDK, ADR 0009) is the **single door** over the BesoinGraph — the
NEED store **above the wall** (CLAUDE.md §2), DISTINCT from the truth-store, NOT an exception. The
human EXPLAINS their app **level by level**; each resolved level leaves as an **Idea** via the only
legal door, `idea_capture` (EL05). The **LLM phrases** the dialogue; **every routing/verdict is a pure
function** in `back/runtime/besoin` — no LLM enters the server.

> **The wall (CLAUDE.md §2).** The server has **no GRANT** on `kernel`/`mirrors`/`fitness`. A kernel
> write is **always** refused (`WroteKernel == false`). The only writes are `besoin.node`
> (INSERT/SELECT/UPDATE — append-only, never DELETE) and the `ideas.idea` reuse (the EL05 emission
> door). There is **no** `idea_promote_to_kernel`: promotion is the `/goal` flow.

## The tools (one tool = one backend op, ADR 0009)

| Tool | Kind | What it does |
|---|---|---|
| `besoin_graph_state` | read | the current graph + the enterable level (EL07) + per-level verdicts |
| `besoin_level_schema` | read | a level's required fields + outgoing ref + EL05 mapping (a client renders the right form, invents no field) |
| `besoin_list` | read | the project's captured node-row count (append-only history depth), RLS-scoped |
| `besoin_capture_product` | capture | a MAPPING rung → appends a node AND emits `Idea{Proposes:product}` |
| `besoin_capture_journey` | capture | **NoEmit** — appends + seeds anchors, **no** Idea (no silent cast) |
| `besoin_capture_view` | capture | **NoEmit** — appends + seeds anchors, **no** Idea |
| `besoin_capture_control` | capture | emits `Idea{Proposes:control}` |
| `besoin_capture_action` | capture | emits `Idea{Proposes:action}` |
| `besoin_capture_operation` | capture | emits `Idea{Proposes:operation}` |
| `besoin_capture_entity` | capture | emits `Idea{Proposes:entity}` |
| `besoin_capture_invariant` | capture | a transversal ∀/policy band (EL14); circularity ban §8; a policy band emits at most one `Idea{Proposes:policy}`, an ∀ emits none |
| `besoin_validate_level` | validate | the pure pre-flight EL07 forcing verdict (no write) |
| `besoin_classify` | validate | the four-metadata classification (EL04, wraps classify-truth) |

## What is code, never the LLM (determinism-first)

| Decision | Function (authority) | Never |
|---|---|---|
| Which level is enterable? | `besoin.EnterableLevel(graph, metaOf)` (EL07) | an LLM "which level next" |
| Does the answer match the level? | `besoin.IsOffAltitude(level, body)` (EL12, by schema) | an LLM opinion of altitude |
| Is the node enough? | `besoin.CanDescend(graph, level, meta)` (EL07) — `enough` is COMPUTED | a declared `resolved` |
| What Idea does the level emit? | `besoin.LevelToProposes(level)` (EL05) — emit / NoEmit | a silent cast |
| The content-address | `records.Hash(Canonicalize(graph))` | a forked address space |

The MCP **persists an already-decided, already-hashed graph**. The reproducibility mirror
`back/mcp/besoin-intake/determinism_property_test.go` (+ the front twin
`front/web/lib/besoin-intake.test.ts`) pins same input → same output.

## The gesture (how to drive the door)

1. **State** — `besoin_graph_state{project}` → the current graph + the enterable level.
2. **Schema** — `besoin_level_schema{level}` → the required fields to ask for (render the form; invent
   no field).
3. **Validate** (optional) — `besoin_validate_level{project, level, body, meta}` → the pre-flight EL07
   verdict, no write.
4. **Capture** — `besoin_capture_<rung>{project, body, utterance, meta}`. The LLM paraphrases the
   answer into `body` + keeps the verbatim `utterance`. On a RECORD turn the node appends and a MAPPING
   rung emits its Idea; a NoEmit rung emits none. An off-altitude body is REFUSED with a `BlockReason`
   (the graph unchanged); a fuzzy node routes to `/spike` via `idea_capture → idea_grill → idea_spike`.
5. Repeat until `besoin_graph_state` reports `done` (every SOURCE rung enough).

## The wall, fail-closed

- A capture at a not-yet-enterable level fails closed with a `BlockReason` (`code/severity/explanation/
  how_to_fix`).
- A self-authored invariant is refused (the circularity ban §8).
- Project isolation: each session sets the GUC `aidos.project`; an RLS policy on `besoin.node` makes
  project A's graph invisible to a B-scoped session (S55 forward dependency, modelled in the migration).

## Files

- Server: `back/mcp/besoin-intake/main.go` · store `store.go` · idea-emission `ideastore.go`.
- Migration: `back/migrations/besoin_graph_baseline.sql` (the `besoin` schema + RLS + GRANTs).
- Authority (pure): `back/runtime/besoin/` (graph, candescend EL07, interview, invariant, proposes EL05,
  metadata EL04).
- Front twin + panel: `front/web/lib/besoin-intake.ts`, `front/web/components/BesoinIntakePanel.tsx`,
  route `front/web/app/besoin-intake/page.tsx`.
- Mirrors: `back/mcp/besoin-intake/main_test.go` (Testcontainers), `determinism_property_test.go`,
  `front/web/lib/besoin-intake.test.ts`, `tests/e2e/besoin-intake.spec.ts`.
- DSN: `AIDOS_BESOIN_DSN`. Transport: stdio.
