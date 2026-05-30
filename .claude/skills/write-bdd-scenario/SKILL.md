---
name: write-bdd-scenario
description: Create a red BDD mirror before any implementation (Gherkin/Godog, property/rapid, or fixture), stored in the mirrors schema and materialized for the runner. Use whenever a behaviour needs proving before code, a /goal red set is being opened, or someone is about to write a scenario, invariant, or workflow fixture.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# write-bdd-scenario (KRD gesture)

## Purpose

Author the **mirror first** — the executable behaviour spec that must be **red** before a single line of implementation exists (Mandat A). Pick the right mirror form for the nature of the truth, store the record + source in the `mirrors` schema, and **materialize** it to disk for the runner. The red mirror **is** the `/goal`.

## When to use

- Step loop point 2: a behaviour must be proven before code (`red → green → refactor`).
- A truth (entity / policy / operation / invariant) has no living mirror (a **monster** to be removed by adding the proof, never by deleting the truth).
- You are opening a `/goal` red set, or a sensor/incident demands a new proof.

## Inputs

- The sharpened intention (from `/grill-with-docs`) in **ubiquitous language**.
- The **nature** of the truth: journey (N0) · invariant (∀, N1) · workflow (N2).
- The Kernel truth it `reflects` (entity/operation/policy id) — read-only, never invented.
- Target subsystem context (`back/kernel/<step>`, etc.) and its `CONTEXT.md`.

## Outputs

- One mirror **record** in `mirrors` (`reflects, test_kind, cert_language, liveness`) + the **source** (Gherkin text, property spec, or fixture data).
- Materialized source on disk for the runner: `.feature` under `tests/`, `*_property_test.go`, or a `state→command→events` fixture.
- A failing run captured (the red), referenced by the `/goal`.

## BDD / mirror required before use

This skill **produces** the mirror; it does not need a prior one. But it must not produce code — only the proof. If you find yourself writing implementation, stop: this gesture ends at red.

## Steps

1. **Name the truth it reflects.** Confirm the Kernel id from the base/spec. If absent or ambiguous, raise an **OpenQuestion** — do not invent it.
2. **Choose the form** by nature:
   - Journey / acceptance (N0) → **Gherkin** `.feature`, runner **Godog** (back) / **Playwright + playwright-bdd** (front).
   - Invariant (∀, N1) → **property test** (**rapid** in Go / **fast-check** front).
   - Workflow (N2) → **fixture** `state → command → events` (Operation DSL interpreter).
3. **Write the source** in ubiquitous language, ≤ 5 scenarios, one intention. Same words in `.feature`, Go, and TS.
4. **Store the mirror** (record + source) in the `mirrors` schema via the `mirror-runner` / `idea-intake` MCP — never by hand-editing truth.
5. **Materialize** to disk and **run it**. Confirm it is **red** for the right reason (missing behaviour, not a typo/compile error).
6. Record the red as the `/goal`; hand off to `/tdd`.

## Stop conditions

- Mirror is red **for the right reason** (asserts the absent behaviour).
- It `reflects` a real Kernel truth; `test_kind` + `cert_language` match the form; `liveness` is set.
- No monster introduced; ≤ 5 scenarios; ubiquitous language consistent.
- You have written **no** implementation.

## Failure modes

- **Green on first run** → not a proof; the behaviour already exists or the assertion is empty. Tighten or delete.
- **Red for the wrong reason** (compile/typo) → fix the harness, not the spec, then re-confirm red.
- **Truth-test smell** → you invented an invariant you could then satisfy (the circularity, §8). Forbidden.
- **Orphan mirror** → `reflects` points at nothing; it is a monster.
- **Hand-written into truth tables** → blocked by the wall; route through MCP.

## Related hooks

- `PreToolUse` (the wall) — refuses any write to `kernel` / `mirrors` / `fitness`; route truth via MCP instead.
- `Stop` (completeness) — blocks finish if a layer lacks its living mirror or a monster exists.
- `PostToolUse` (sensors) — must stay green at each diff.

## Related MCP tools

- `mirror-runner` — store the mirror record + source, materialize, run the cert runner (Godog / rapid / fixture interpreter).
- `idea-intake` — when the reflected truth does not yet exist: open the `idea → mirror → /goal` door.
- `store` — read the Kernel AST to confirm what the mirror `reflects`.

## Workbench visualization

`front/web/` — **Mirror Health** and **Goal Red Set** panels: the new mirror appears red in the Red Work Queue until green. Add/extend the route's Playwright e2e for the visualization (never touch existing routes).

## Honesty rules

Never invent a `target`, `targetId`, or business rule — if the reflected truth, an id, or a rule is unknown, it becomes an **OpenQuestion** (an idea/provenance entry), never a guess written into the spec.
