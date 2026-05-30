---
name: check-completeness
description: Verify the completeness law — every spec layer has a living mirror; hunt monsters (orphan mirror, mirror-less truth) via fault injection. Use before finishing a step, when the Stop hook flags a gap, or when auditing whether truths and mirrors are in one-to-one correspondence.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# check-completeness (KRD gesture)

## Purpose

Enforce the **completeness law**: every layer of spec (entity, policy, operation, control, action, invariant, workflow) has a **living mirror**, and every mirror `reflects` a real truth. A truth without a mirror is a **wish**; an orphan mirror is a **monster**. This gesture finds both, and proves the mirrors are actually alive by **fault injection** — break what each mirror watches, assert it goes red. A mirror that never fails is dead and counts as a missing mirror.

## When to use

- Step loop point 5: confirm the layer has its living mirror, no monster, before the `Stop` hook lets you finish.
- The `Stop` (completeness) hook has blocked a finish and you must locate the gap.
- Auditing a subsystem for one-to-one truth ↔ mirror correspondence after a changeset or revert.

## Inputs

- The set of Kernel truths in scope (entity/policy/operation/control/action ids + invariants/budgets) — read-only, from the base.
- The mirror records in `mirrors` (`reflects, test_kind, cert_language, liveness`) + their materialized sources.
- The target subsystem/step context and its `CONTEXT.md`.

## Outputs

- A **correspondence report**: every truth → its mirror(s); every mirror → its truth. Two monster lists: **mirror-less truths** and **orphan mirrors**.
- A **liveness verdict** per mirror from fault injection (went red when its target was broken = alive; stayed green = dead).
- For any unresolved ambiguity, an **OpenQuestion** (idea/provenance entry) — never a guessed fix.

## BDD / mirror required before use

This gesture **audits** mirrors; it does not author them. It writes **no** truth and **no** implementation. If a gap is found, the remedy is to open `idea → mirror → /goal` (via `write-bdd-scenario`), never to delete the truth or silence the mirror.

## Steps

1. **List the truths in scope** from the base (Kernel AST). Read-only — confirm ids, never invent them.
2. **List the mirrors** in `mirrors` and their `reflects` targets.
3. **Match both ways.** Truths with no living mirror → mirror-less monsters. Mirrors whose `reflects` points at nothing → orphan monsters.
4. **Fault-inject each mirror:** temporarily break the behaviour/truth it watches, run its cert runner, assert it goes **red**. Restore. A mirror that stays green is **dead** (treat as missing).
5. **Confirm `liveness`, `test_kind`, `cert_language`** match the truth's nature (N0 Gherkin/Godog, ∀ rapid, N2 fixture).
6. **Report** the two monster lists + liveness verdicts. For each monster, point at the remedy (`write-bdd-scenario` to add the proof; an OpenQuestion if the truth itself is doubtful). Never close the gap by deleting a truth.

## Stop conditions

- Every truth in scope has at least one mirror, and every mirror `reflects` a real truth (zero monsters).
- Every mirror is **alive** (fault injection turned it red, then it was restored to green).
- No truth-test was authored; no implementation written; no truth touched.

## Failure modes

- **Mirror stays green under fault injection** → dead mirror; counts as missing, not as coverage.
- **Orphan mirror** → `reflects` resolves to nothing; a monster — fix the link or supersede via changeset, never hand-edit truth.
- **Mirror-less truth** → a wish; open `idea → mirror → /goal`, do not delete the truth to "pass".
- **Audit-as-Goodhart** → declaring complete because counts match while a mirror is dead. Liveness, not count, is the proof.
- **Self-certified gap closure** → inventing a target/rule to make correspondence resolve; forbidden.

## Related hooks

- `Stop` (completeness) — blocks finish when a layer lacks its living mirror or a monster exists; this gesture diagnoses what it flagged.
- `PreToolUse` (the wall) — refuses writes to `kernel` / `mirrors` / `fitness`; remedies route through MCP.
- `PostKernelChange` — re-run completeness after a truth changes, so a new truth cannot land mirror-less.

## Related MCP tools

- `mirror-runner` — run each cert runner and the fault-injection pass to verify liveness.
- `store` — read Kernel ASTs and mirror records to build the two-way correspondence.
- `idea-intake` — open the `idea → mirror → /goal` door when a truth has no mirror.
- `changeset` — record a supersede/relink decision for an orphan mirror (append-only, never a silent edit).

## Workbench visualization

`front/web/` — a **Completeness / Monster Hunt** panel: truth ↔ mirror correspondence matrix, the two monster lists, and a per-mirror liveness badge (alive/dead). Add or extend that route's Playwright e2e for the visualization; never touch existing routes.

## Honesty rules

Never invent a `target`, `targetId`, or business rule to make a truth and mirror match — if a reflected truth, an id, or a rule is unknown or doubtful, it becomes an **OpenQuestion** (an idea/provenance entry), never a guess written into the spec or used to silence a monster.
