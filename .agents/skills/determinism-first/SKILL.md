---
name: determinism-first
description: The determinism-first law — whatever CAN be a deterministic pure function/algorithm MUST be code, never an agent/LLM. If a deterministic option exists, always prefer it; it is authoritative (you may also implement an agent path, but the code wins and the agent defers to it). Applies on THREE planes — the toolchain that CODES AIDOS (your own gestures/tools — e.g. a diff is a diff algorithm, never an LLM "diff agent"), the AIDOS product runtime, AND the coder that emits a user's app. Never pick the LLM by convenience — only when no deterministic solution exists. Use at every step to audit each capability, when choosing a code/algorithm vs agent/LLM implementation, or when the user says "rends ça déterministe / prefer code over the model / use a real algorithm not an LLM / is this reproducible?".
---

# determinism-first (KRD gesture)

## Principle

AIDOS — its runtime, **the toolchain that codes it**, and the coder that emits a user's
app — is **deterministic by default**. The LLM/agent is the **exception**, used only where
a pure function/algorithm genuinely cannot do the job (natural-language generation,
open-ended design, irreducibly fuzzy human judgment). For every capability a step
introduces: **if it can be a deterministic function/algorithm of its inputs, it MUST be
code** — parsing, validation, hashing, **diffing**, routing, scoring against *declared*
weights, counting, transforming, schema-checking, rendering, matching, sorting, searching.

**Never pick the LLM out of convenience.** If a specialized agent *seems* handy for a task
(e.g. "a diff agent"), but a deterministic algorithm/library/CLI does it (a real diff
algorithm — Myers, `git diff`, a structural/AST differ), the algorithm wins. The LLM is a
last resort, reached for **only when no deterministic solution exists**.

This generalizes KRD's determinism, already present in pieces, to **all** of AIDOS:
- "the **judge is deterministic**" (CLAUDE.md §8),
- the **ContextRouter is an algorithm, not a prompt** (the `context` gesture),
- **weights/thresholds are declared, never learned** (§8),
- **SemanticDiff, completeness, sensors, content-addressing** are deterministic.

> "The agent owns implementation" (CLAUDE.md core) — but the implementation it writes is
> **deterministic code** wherever possible. The LLM writes the code at *build* time; it does
> not sit in the *runtime* loop doing what a pure function could do.

## The rule (always)

1. **If a deterministic code option exists, always prefer it.** Even if you also implement
   an agent/skill path: the **deterministic code is authoritative** (the source of truth);
   the agent is checked against it / defers to it — never the reverse.
2. **Implement both only when the agent adds genuine value** (orchestration, or a truly
   non-deterministic sub-part). Then **extract the deterministic core as a pure function**
   and isolate the LLM surface to the smallest possible boundary.
3. **An agent/LLM doing what a pure function/algorithm could do is a determinism gap** — a
   smell to fix, exactly like a headless capability (`ui-completeness`) or a monster
   (`check-completeness`). It blocks "done".

## Scope — three planes (your own tools included)

The law applies wherever AIDOS computes — including **the agent's own build tooling**:

1. **Coding the product** (the gestures/tools/MCP that *build* AIDOS): when you need a diff,
   a search, a parse, a dependency graph, a format, a lint — reach for the **algorithm /
   library / CLI**, not an LLM agent. A "specialized diff agent" is the wrong default when a
   diff algorithm exists.
2. **The product runtime** (AIDOS itself): SemanticDiff, completeness, the ContextRouter,
   sensors, hashing — deterministic code.
3. **The product's coder** (AIDOS emitting a user's app): the generation pipeline prefers
   deterministic emitters (sqlc/templates/codegen from the source AST) over LLM generation;
   the LLM only fills the irreducible gaps, gated by mirrors.

## Reach for the deterministic tool first

| Need | Deterministic tool (use this) | NOT |
|---|---|---|
| diff / change between two texts or trees | `git`/`jj` diff, Myers, a **structural/AST differ** | an "LLM diff agent" |
| semantic diff of a kernel change | AST structural compare + classify by declared rules | LLM judgement |
| search the codebase | `rg` (ripgrep), `grep`, glob | an LLM "search agent" |
| parse / validate | a parser + a schema (zod, JSON-schema, the YAML parser) | LLM extraction |
| format / lint / arch-fitness | biome, gofmt, eslint, semgrep, go-arch-lint, dependency-cruiser | LLM review for these |
| hash / content-address | SHA-256 | — |
| codegen / projection | sqlc + templates from the source AST | LLM code generation |

The LLM is for what these genuinely cannot do: prose, open design, fuzzy judgment — always
wrapped in a deterministic gate.

## The audit (every step)

For each capability / op the step introduces:
1. **Classify** — *deterministic-able* (a pure function of its inputs) **or**
   *irreducible* (NL generation, open design, fuzzy judgment).
2. **Deterministic-able → implement as code** (Go / TS pure function), make it the
   **authoritative** path, and cover it with a **property/unit mirror** (rapid / fast-check
   / Vitest) asserting **reproducibility** (same input → same output, no hidden state, no
   clock/rng unless injected).
3. **Irreducible → agent/skill**, but extract any deterministic core as a function and
   **gate the agent's output deterministically** (schema-validate, re-check, compare to a
   computed expectation) — never trust the LLM where a check is possible.
4. **Report** `capability → deterministic? → implementation`, flagging every
   "agent-where-code-would-do".

## Stop conditions (done is computed)

A step's determinism is complete iff:
- every deterministic-able capability is **authoritative code** (not an agent), each with a
  reproducibility mirror; **and**
- the only LLM/agent runtime surfaces are the genuinely irreducible ones, minimized and
  **deterministically gated**.

Else there is a determinism gap to close before the step is done.

## In AIDOS — what is which

- **Deterministic code (must):** contract parsing (S00), content hashing + Put/Get/SetHead
  + history (S01), record canonicalization, SemanticDiff classification, completeness &
  monster detection, the ContextRouter, sensors, BlockReason formatting, the red-wave
  propagation, projection/codegen emitters, the fitness grammar.
- **Agent/LLM (exception, gated):** `/grill-with-docs` phrasing, `/prototype` &
  `/design-an-interface` exploration, idea-harvest prose, doc writing — genuine generation,
  always wrapped by deterministic gates (a schema, a mirror, a re-check).

## Related

- `check-completeness` (truth↔mirror), `ui-completeness` (op↔screen) — siblings; this is
  **capability↔deterministic-code**.
- ADR 0007 (reuse mature libs; eval/exec is deterministic), `context` (router = algorithm),
  §8 (deterministic judge, declared weights).
- `write-bdd-scenario` / `derive-mirror` → a **property** mirror proving reproducibility.
