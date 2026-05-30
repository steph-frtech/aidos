---
name: explain-block
description: Turn any block (wall refusal, failing sensor, completeness violation) into an actionable BlockReason (code, severity, explanation, how_to_fix) and surface it via `aidos explain` + the Workbench. Use whenever a write is refused, a hook returns red, a sensor trips, or the user asks "why was this blocked / what does this BlockReason mean / how do I fix it".
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# explain-block

## Purpose

Convert an opaque block — a `PreToolUse` wall refusal, a red sensor, a `Stop`/completeness failure — into a structured, actionable **BlockReason** (`code`, `severity`, `explanation`, `how_to_fix[]`) and surface it through `aidos explain` and the Workbench. The agent never silently swallows a block; it explains it so the human can act.

## When to use

- A write to a forbidden zone (`kernel` / `mirrors` / `fitness`) is refused (§2 the wall).
- A `PostToolUse` sensor goes red, or `Stop` blocks on a monster / completeness gap.
- The user asks "why was this blocked", "what does this BlockReason mean", or "how do I get past this".
- You hold a raw error/exit code and need to hand the human a fix path, not a stack trace.

## Inputs

- The raw block signal: hook stderr/JSON, sensor output, exit code, or the failing command.
- The attempted gesture (tool name, target path, changeset id if any).
- Optional: a `code` if the emitter already classified the block.

## Outputs

- A `BlockReason` object: `{ code, severity, explanation, how_to_fix[] }`.
  - `code`: stable, machine-readable (e.g. `WALL_TRUTH_WRITE`, `SENSOR_RED`, `MONSTER_ORPHAN_MIRROR`).
  - `severity`: `error | warn | info`.
  - `explanation`: one human sentence, in the ubiquitous language.
  - `how_to_fix[]`: ordered, concrete steps (e.g. "create an idea", "write the mirror", "open `/goal`").
- The same object made visible via `aidos explain <code|target>` and the Workbench panel.

## BDD / mirror required before use

A red mirror must exist before any code path that emits a BlockReason:
- **Journey (N0)** Gherkin: `Given a forbidden write When the hook fires Then a BlockReason with code X and how_to_fix is returned`.
- **Invariant (∀)**: every block has non-empty `code` and `how_to_fix` (no naked refusal).
- Stored in the `mirrors` schema, materialized for Godog/rapid. The block emitter is coded `red → green → refactor`. No BlockReason shape ships without its red scenario first.

## Steps

1. Capture the raw block (hook output / sensor / exit code) — do not discard it.
2. Classify it into a known `code`; if none fits, mint a candidate code and flag it as an OpenQuestion (do not invent a target).
3. Fill `severity` and a one-sentence `explanation` in ubiquitous language.
4. Build `how_to_fix[]` as the legitimate path only (for a wall block: idea → mirror → `/goal` → human approval). Never propose a bypass.
5. Run `aidos explain <code|target>` to render the BlockReason; confirm it round-trips.
6. Surface it in the Workbench panel; if the cause is a missing mirror, route to `write-bdd-scenario`.

## Stop conditions

- BlockReason has a non-empty `code`, a `severity`, a one-line `explanation`, and at least one `how_to_fix` step.
- `aidos explain` renders it and the Workbench shows it.
- Stop is computed, never declared: an empty `how_to_fix` or an invented target means not done.

## Failure modes

- **Naked refusal**: a block with no `code`/`how_to_fix`. Fix: classify before surfacing.
- **Bypass advice**: `how_to_fix` that edits truth directly. Forbidden — only the idea→mirror→`/goal` door (§2).
- **Invented target**: guessing a `targetId`/business rule to make the message concrete. Forbidden (see Honesty rules).
- **Dead explanation**: a code that no emitter ever produces. Tie every code to a real block path with a fault-injection test.

## Related hooks

- `pretooluse` (Go) — refuses truth writes, is the primary source of `BlockReason`.
- `posttooluse` — emits sensor-red BlockReasons per diff.
- `stop` — emits completeness / monster BlockReasons.
- `postkernelchange` — emits propagation/consistency BlockReasons.

## Related MCP tools

- `mirror-runner` — re-run the failing certificate to confirm the red and its code.
- `changeset` — open the legitimate changeset referenced in `how_to_fix`.
- `idea-intake` — file the idea when the block means "this needs a truth change".
- `store` — read the kernel/mirror record the block refers to (read-only).

## Workbench visualization

Next route `front/web/app/explain/` (do not touch existing routes): renders the BlockReason card (`code`, `severity` badge, `explanation`, ordered `how_to_fix` checklist) with a deep link to the offending target and the `/goal` door. Covered by a Playwright e2e asserting the card and its fix steps are visible.

## Honesty rules

Never invent a `target`, `targetId`, or a business rule to make a BlockReason look concrete; if the cause is uncertain, say so and record it as an **OpenQuestion** (provenance) rather than guessing — an honest "unknown cause, here is how to investigate" beats a fabricated fix.
