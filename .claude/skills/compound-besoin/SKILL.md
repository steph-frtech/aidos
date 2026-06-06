---
name: compound-besoin
description: The umbrella /compound-besoin gesture (EL13) — the level-by-level FORCED interview of the need, ABOVE the wall. For the enterable level (computed, never guessed), read the frozen anchors, ask the level's open branches (the LLM phrases the question + paraphrases the utterance), DISPATCH to the existing gesture (grill for product, view for view, action for control+action, generic otherwise), and RECORD the answer through a deterministic Close — a parse of Gherkin, a bool-typing of an Expr, a resolve of a ref. An off-altitude answer is rejected by SCHEMA (EL12), a fuzzy answer routed to /spike (idea_capture → idea_grill → idea_spike), and the resolved verdict is COMPUTED (CanDescend.enough), never declared. Use when the user wants to elicit an app's need level by level, "compound the besoin", run the forced interview, or descend the verticale one rung at a time. The LLM assists the dialogue; the code judges. Writes only the `besoin` schema via the EL15 MCP, never the kernel/mirrors.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# /compound-besoin (EL13 — the umbrella forced interview)

The umbrella elicitation gesture of the *compound du besoin* track. It interviews the need **one level at a time**, in the strict §23 descent order (`product → journey → view → control → action → operation → entity`) plus the transversal `invariant`/`policy` bands (those last are dialogued by `/besoin-invariant`, EL14). The **LLM is the barricaded exception** (CLAUDE.md §8): it **leads** the dialogue — it phrases the question and paraphrases the human utterance — but **every verdict is a pure function, code-authoritative**; the LLM defers to the code, never the reverse.

> **The wall (CLAUDE.md §2).** This gesture writes only the `besoin` schema, through the EL15 MCP `besoin-intake` (`besoin_capture_*`). It **never** writes `kernel`/`mirrors`/`fitness`. The only door to truth stays `idea → mirror → /goal → human approval`. The backing functions live in `back/runtime/besoin/interview.go` (Go authority) with the byte-equivalent twin `front/web/lib/besoin-interview.ts`.

## What is code, never the LLM (determinism-first)

| Decision | Function (authority) | Never |
|---|---|---|
| Which level may I work? | `EnterableLevel(graph, metaOf)` — the first SOURCE rung not yet `enough` (reuses `CanDescend`, EL07) | an LLM guess |
| Which gesture do I dispatch to? | `DispatchOf(level)` — the closed table (grill/view/action/generic) | an LLM choice |
| What anchors ground this level? | `AnchorsAbove(graph, level)` (EL08) — the frozen resolved rungs above | a re-judgement |
| What branches must I close? | `BranchTree(level, body)` (EL12) — the closed Example-Map cells | an invention |
| Is this answer at the right altitude? | `IsOffAltitude(level, body)` / `ClassifyAltitude(body)` (EL12) — a schema-mismatch | an LLM opinion of altitude |
| Is the level resolved? | `CanDescend(graph, level, meta).Enough` (EL07) — COMPUTED | a declaration by the LLM |

## The per-turn loop

1. **Compute the enterable level** — `NextPrompt(graph, metaOf)` returns the level, the dispatched gesture, the frozen anchors, and the open branches. If `Done`, the descent reached the entity leaf.
2. **Read the anchors** — the frozen resolved rungs above are the read-only grounding. The answer **cannot contradict** them (EL08; a silent rewrite is `BESOIN_ANCHOR_OVERWRITE`).
3. **Ask the open branches** — dispatch to the gesture: `/grill` triages the `product` intention (sharp / fuzzy / bad), `/view` elicits the `view` rung, `/action` elicits `control`+`action`, the generic branch dialogue handles the rest. The LLM **phrases** the question; the branches' existence is code.
4. **Record the answer** — `RecordAnswer(graph, level, body, utterance, meta)` decides the routing **by code**:
   - **off-altitude** (`IsOffAltitude`): the body fails the level's `besoin_level_schema` — rejected, **not** descended (an entity `attributes` body submitted at `product` lands here, by schema);
   - **fuzzy → /spike**: an unverifiable answer is routed to `/spike` via the **legal three-hop gate** `idea_capture(draft) → idea_grill → idea_spike` (never a direct capture in `spiking`; `idea_spike` is an *advance*, not a capture);
   - **record**: otherwise the body is appended (status `drafting`) and the EL07 verdict is **recomputed** — `resolved` is COMPUTED, never declared by the LLM.
5. **Persist via the EL15 MCP** — `RecordAnswer` returns the next `BesoinGraph`; it is appended through `besoin-intake` `besoin_capture_*`. The gesture writes no truth.
6. **Repeat** until `CanDescend.enough` at every required rung — then the next level is enterable.

## Honesty rules

- The LLM **never declares `resolved`**. If you think a level is done, you call `CanDescend` and read the verdict; you do not assert it.
- The LLM **never invents a branch, an anchor, a target level, or a business rule**. If a branch is unclear, it is an OpenQuestion, not a filled-in guess.
- A **fuzzy** answer is not forced down. It is routed to `/spike` so it becomes falsifiable before it nears the kernel.
- A deeper-level gap (a forward dependency — e.g. the entity does not exist yet when you declare the operation) is a **carried OpenQuestion** (`enough=true`), never a blocking residual (bootstrap §6).

## Reuse, never reinvent

- Composes the existing gestures: `grill`, `view`, `action`, `classify-truth` (the four metadata), `check-completeness` (the need-completeness law, EL09).
- Reuses `EnterableLevel`/`CanDescend` (EL07), `BranchTree`/`ClassifyAltitude` (EL12), `AnchorsAbove` (EL08), `CertifyMetadata` (EL04) — single source, no fork.
- The reproducibility mirror (`interview_property_test.go`, `besoin-interview.test.ts`) pins same input → same output. The acceptance mirror (`tests/runtime/compound-besoin.feature`) drives the three done-criteria.
