---
name: emit-ideas
description: The deterministic emitter /emit-ideas gesture (EL16) — run EmitIdeas(graph) → []Idea over a BesoinGraph, via the legal idea-intake door, GOVERNED by the closed table LevelToProposes (EL05). Use when the user wants to project a (completed) BesoinGraph into the backlog of candidate-truth Ideas the app-builder (S64) consumes, "emit the ideas from the need graph", run the batch emission, or hand the need graph off to /grill → /goal. For each RESOLVED node whose rung MAPS, exactly one draft Idea is emitted (proposes = LevelToProposes(level), intent = the verbatim utterance, provenance human); NoEmit rungs (journey/view/invariant) emit NOTHING — no silent cast. The id reuses records.Hash → content-addressed + idempotent (byte-identical re-emission). The emitter is DETERMINISTIC: the mapping is a pure table, no LLM enters. Writes only the `ideas` schema (via idea_capture), never kernel/mirrors/fitness — HasMirror always false; promotion is /goal.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# /emit-ideas (EL16 — the deterministic emitter over the BesoinGraph)

The **emission** gesture of the *compound du besoin* track. `EmitIdeas(graph) → []Idea`
(`back/runtime/besoin/emit_ideas.go` + the `besoin_emit_ideas` MCP tool) is the **batch projection** of
a (completed) BesoinGraph into the **backlog of candidate-truth Ideas** the app-builder (S64) consumes.
Where EL15 captures Ideas **per-rung as the interview descends**, EL16 projects the **whole graph at
once**. The mapping is **governed by the closed table `LevelToProposes` (EL05)** — a pure function,
never an LLM cast.

> **The wall (CLAUDE.md §2).** `EmitIdeas` writes **no kernel and no mirror**. Every emitted `ideas.Idea`
> is a **draft** candidate that carries **neither a version nor a mirror** by construction
> (`HasMirror` always false). The only persistence is via the legal `idea_capture` door (the `ideas`
> schema reuse); promotion is **writing the mirror = `/goal`** (the hand-off to S64). There is **no**
> `idea_promote_to_kernel`.

## The rule (never a silent cast)

For each `LevelNode`:

- **RESOLVED ∧ MAPPING** (`LevelToProposes(level).Kind == emit`) → emit **exactly one** draft Idea:
  - `Proposes`   = `LevelToProposes(level).Proposes` (the closed table — never an LLM choice);
  - `Intent`     = the node's **verbatim utterance** (`Provenance.Detail`);
  - `Provenance` = `{Source: human, Detail: utterance verbatim}`;
  - `Status`     = `draft` (the only legal first state).
- **NoEmit** (journey / view / invariant) → **nothing** (the constraint lives in `anchors_above[]`).
- **Non-resolved** (empty / drafting) → **nothing** (only a right-sized rung, EL07, projects).

The id reuses `records.Hash` (the S01/S02 scheme) → the Idea is **content-addressed + idempotent**:
re-emitting the same graph lands the **same ids in the same order** (byte-identical), and the
persistence is `ON CONFLICT DO NOTHING` (never a duplicate).

## How to run it

- **Pure function:** `besoin.EmitIdeas(graph)` (stored-status), `besoin.EmitIdeasResolved(graph, metaOf)`
  (EL07 verdict authority), `besoin.EmitIdeasUnion(graph, metaOf)` (the door-facing union).
- **MCP tool:** `besoin_emit_ideas` (`{project, dry_run?, meta}`) — `dry_run` previews the backlog
  without persisting; otherwise it persists each draft via `idea_capture`.
- **Workbench:** `/emit-ideas` — shape the already-decided graph (per-rung status), then **« Émettre les
  Ideas »** runs the emitter from the screen (ui-completeness). The count **EXCLUDES** NoEmit and
  non-resolved rungs.
- **TS twin:** `front/web/lib/emit-ideas.ts` (byte-equivalent), covered by `lib/emit-ideas.test.ts`.

## Determinism-first (CLAUDE.md §6/§8)

The mapping is the **closed pure table** `LevelToProposes`; the ordering is the canonical descent order
(sourceOrder then bands); the id is a pure content hash. **Same graph → same `[]Idea`.** The
reproducibility mirror `emit_ideas_property_test.go` (rapid) + `emit-ideas.test.ts` (fast-check) pin it.
**No LLM** enters the emitter — the LLM never judges what a pure function can.

## Hand-off (S64)

The emitted backlog is the input to the **app-builder**: `EmitIdeas` → `idea-intake` (provenance human)
→ S64 (« capturez votre idée ») → S65 (`/grill`) → S66 (`/goal`, opened in the topological backlog
order) → S67. Promotion is **always** writing the mirror via `/goal`, never a direct kernel write.
