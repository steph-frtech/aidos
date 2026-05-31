---
name: determinism-first
description: The determinism-first law — whatever CAN be a deterministic pure function MUST be code, never an agent/LLM. If a deterministic option exists, always prefer it; it is authoritative (you may also implement an agent path, but the code wins and the agent defers to it). The LLM is the exception, only for genuinely irreducible generation/judgment. Use at every step to audit each capability, when choosing between a code vs agent/LLM implementation, or when the user says "rends ça déterministe / prefer code over the model / is this reproducible?".
---

# determinism-first (KRD gesture)

## Principle

AIDOS's runtime behaviour is **deterministic by default**. The LLM/agent is the
**exception** — used only where a pure function genuinely cannot do the job (natural-
language generation, open-ended design, irreducibly fuzzy human judgment). For every
capability a step introduces: **if it can be a deterministic function of its inputs, it
MUST be code** — parsing, validation, hashing, diffing, routing, scoring against
*declared* weights, counting, transforming, schema-checking, rendering, matching, sorting.

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
3. **An agent/LLM doing what a pure function could do is a determinism gap** — a smell to
   fix, exactly like a headless capability (`ui-completeness`) or a monster
   (`check-completeness`). It blocks "done".

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
