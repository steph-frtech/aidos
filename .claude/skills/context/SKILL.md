---
name: context
description: Compile a minimal, branch-aware ContextPack for a red goal via the ContextRouter (an algorithm, not a prompt) — only the load-bearing kernel, red mirrors, crossed contracts, and scoped memory from the goal's affected subgraph, never the whole project. Use whenever you are about to start working a goal and need "what context do I get for this", when an agent is about to overload on the global repo, when someone asks to compile/route context, build a ContextPack, or scope down what a goal touches, or before any code step that needs its load-bearing context loaded.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# context (KRD gesture)

## Purpose

Compile the **ContextPack** (KRD §143) for a red goal through the **ContextRouter** (KRD §144) — a deterministic **algorithm, not a prompt and not a RAG**. The router takes a red goal, reuses its red-set (S22, never recomputed), walks the **affected subgraph** of the ContextGraph (KRD §142), and emits the **minimal** pack: only the load-bearing kernel nodes, the red mirrors that define the stop condition, the contracts that cross a bounded-context boundary, and the memory records with scope overlap and confidence ≥ `repeated`. Context is **compiled from the red-set, never global** — "trop de contexte détruit le contexte" (KRD §141): overload makes the agent invent.

## When to use

- The loop's standard context-loading move: a code step is about to start and you need *this goal's* load-bearing context, not the project.
- Someone asks to compile/route context, build a ContextPack, or answer "what do I get for this goal / what can I touch / how do I know I'm done".
- An agent is drifting toward reading the whole repo — the pack is the antidote to context drift.

## Inputs

- A **red goal** (its id) and the **branch** to compile against. The router is branch-aware.
- The goal's **red-set** from S22 (impact / red-wave) — **reused, never recomputed here**.
- A **read-only** ContextGraph view (KRD §142: nodes `Layer | Mirror | Idea | MemoryRecord | PhaseStable | Sensor | Skill | Tool`; edges = the seven KRD links + provenance). If the derived `context` schema is not landed, a mocked view (§6: mock what does not exist, never the reverse).

## Outputs

- One **ContextPack** (KRD §143), content-addressed (`hash`), reproducible: same `(goal, branch, graph snapshot)` ⇒ byte-identical pack. It carries `goal`, `branch`, `affected_layers`, `active_kernel{ mirrors, invariants, contracts }`, `boundaries{ bounded_context, allowed_paths, forbidden_paths }` (always forbids `/kernel/**` and `/mirror/**` — the wall as a boundary), `memory{ relevant_lessons, recent_incidents, glossary_terms }`, `skills`, `tools`, `stop_condition`.
- An **Included / Excluded** account: every excluded item tagged with **why** (`cross-BC`, `stale`, `out_of_scope`, `cosmetic-below-threshold`).

## BDD / mirror required before use

The router itself is proven by its own mirror before it exists (the **ContextRouter compile fixture** + the minimality/exclusion `rapid` property in the `mirrors` schema). This gesture **runs** that compiler; it does not author truth. If you find yourself hand-writing a pack or editing kernel/mirrors, stop — compile, never invent.

## Steps

1. **Take the red goal + branch.** Confirm the goal id and branch exist. If either is unknown, raise an **OpenQuestion** — do not guess one.
2. **Reuse the red-set** from S22 for that goal. Do **not** recompute it.
3. **Compile via the `context` MCP** (`context_compile(goal, branch)`): the router walks `affected_subgraph(red, depth_by_link_type)` and applies the inclusion/exclusion rules below. The algorithm is pure; the MCP does the read-only graph reads.
4. **Verify inclusions:** affected layers are the red layers; `active_kernel` carries the red mirrors (the stop condition) + load-bearing invariants; a neighbor bounded context appears **only** as its crossed PUBLIC contract.
5. **Verify exclusions:** no `billing`-style internals for a `checkout`-style goal; no `stale` / `out_of_scope` / `unapproved` memory (KRD §119.3); cosmetic siblings below the activation threshold dropped — each with its reason.
6. **Confirm the boundary + stop condition:** `forbidden_paths` contains `/kernel/**` and `/mirror/**`; `stop_condition` is non-empty; `hash` is non-null.
7. **Hand off** the pack as the agent's working context. Surface the Included/Excluded view (Workbench `/context-pack`).

## Stop conditions

- Pack is **minimal**: every included node is reachable in `affected_subgraph(red)`; a different-BC node appears only as a crossed PUBLIC contract.
- **Exclusions hold**: no stale/out-of-scope/unapproved memory; cross-BC internals out; every exclusion has an explicit reason.
- **Wall as boundary**: `forbidden_paths` always contains `/kernel/**` and `/mirror/**`.
- **Branch-aware, deterministic**: same `(goal, branch, snapshot)` ⇒ identical pack + `hash`; no other branch's nodes leak.
- A non-empty `stop_condition` is present.

## Failure modes

- **Global context** → you handed the whole repo/project instead of the affected subgraph. That is the disease, not the fix; compile from the red-set.
- **Recomputed red-set** → reuse S22; recomputing forks the truth.
- **Cross-BC leak** → a neighbor BC's internal layers/mirrors entered the pack; only its crossed PUBLIC contract belongs.
- **Stale/out-of-scope memory included** → the `forbidden` filter (KRD §119.3) was skipped.
- **Non-reproducible pack** → a non-deterministic input (clock, randomness, ambient state) crept in; the router must be pure over `(goal, branch, snapshot)`.
- **Pack grants truth-write paths** → `/kernel/**` `/mirror/**` missing from `forbidden_paths`; the router never emits a truth-write boundary.
- **Treated as RAG / prompt / embedding** → the ContextRouter is an algorithm; do not retrieve-and-stuff.

## Related hooks

- `PreToolUse` (the wall) — the router never writes truth; the pack *renders* `/kernel/**` `/mirror/**` as forbidden paths. A write to those zones is refused regardless.
- `SessionStart` — may compile the pack for the active goal so the session starts scoped, not global.
- `Stop` (completeness) — unrelated to compiling, but the red mirrors the pack carries are what `Stop` checks against.

## Related MCP tools

- `context` — `context_compile(goal, branch) → ContextPack{+hash}` (runs the router), `context_pack_get(hash)` (replay a versioned pack), `context_graph_query(by_goal | by_bc | by_branch | by_term)` (read-only graph query). Holds a **read-only** grant on the derived `context` schema; **no** grant on `kernel`/`mirrors`/`fitness`.
- `store` — read the kernel AST nodes the pack references (read-only).
- `memory` — supplies the already-scored `MemoryRecord`s the router filters by scope/confidence/staleness (scoring lives in the Archive `/brain` step, not here).

## Workbench visualization

`front/web/app/context-pack/` → `/context-pack`: the panel for a selected goal + branch — an **Included** panel (affected layers, active kernel mirrors/invariants, crossed contracts, scoped memory, skills, tools, stop_condition, pack `hash`), an **Excluded** panel tagging each drop with its reason (`cross-BC`, `stale`, `out_of_scope`, `cosmetic-below-threshold`), and a **Boundaries** strip showing `allowed_paths` and the forbidden `/kernel/**` `/mirror/**`. It renders the compiled pack; it does not re-implement the router. Extend its Playwright e2e for the visualization (never touch existing routes).

## Honesty rules

Never invent a `target`, `targetId`, or business rule. If the goal id, the branch, a node, the `depth_by_link_type` policy, the memory confidence threshold, or an exclusion reason is not pinned by KRD §142/§143/§144/§119.3 / an existing schema / ADR / `CONTEXT.md`, do **not** guess — record an **OpenQuestion** (provenance) and stop on that branch. Do not recompute the red-set (reuse S22), and never give the router write access to any truth schema.
