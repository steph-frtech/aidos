---
name: goal
description: The /goal engine gesture (KRD §56–§59, §63 ①) — promote an idea to truth via its mirror. Take an idea ref, OpenGoal (DRAFT ChangeSet + derived red set), drive red→green outside-in, and close ONLY when the non-gameable Stop:goal-check gate passes (red set→green ∧ prior green intact ∧ mutation≥threshold ∧ no monster). Use to open a goal, compute its red set, or check whether a goal may close. The engine never reads the agent's confidence — done is computed, never declared.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# goal

The harness command form of KRD §57: the **internal loop ①** door from a candidate-truth (an **idea**) to truth — `idea → mirror → /goal`. This gesture **opens** the goal and **computes** its stop. It is backed by the pure Go engine `back/runtime/goal` (`OpenGoal` / `IsClosed`) and the non-gameable `Stop:goal-check` hook (`back/hooks/goal-check`). It never writes truth (the wall, CLAUDE.md §2) and never declares `done` (§8).

> Sibling gesture: **`open-goal`** is the human-facing review form (draft the Truth + Mirror, hand off to human approval). **`goal`** is the engine form: open the DRAFT ChangeSet + derive the red set deterministically, and gate the close on the computed stop. Use `open-goal` to author/approve; use `goal` to run the loop body's open + stop.

## What it is (the contract)

- A **goal** = a DRAFT `ChangeSet` (S20) carrying the idea's `spec_delta` + `mirror_delta` **atomically** PLUS the **red set** — the failing mirror refs that ARE the goal (§56: "le test rouge EST le goal ; le set rouge EST la todo-list").
- **OPEN / CLOSED** is **computed**, never declared. The non-gameable stop:

  ```
  IsClosed  ⇔  red set → green  ∧  prior green intact  ∧  mutation ≥ floor  ∧  no monster
  ```

  The engine takes **no agent-confidence input** — it never reads your claim of "done" (the whole point of S29).
- An idea with **no mirror** is a *vœu* / monster → rejected `IDEA_WITHOUT_MIRROR` (no ChangeSet opened).
- An idea whose mirror is **already green** → rejected `NO_RED_SET` (a green test is not a goal; nothing to close, §56).
- **Budgets** (time/turns/tokens) are the **secondary** anti-runaway guard, **declared** never learned. They bound the loop; they are not a close condition.

## When to use

- After `/harvest` surfaced an idea worth promoting, and before any code is written — to open the goal and derive its red set.
- When the user says "open a goal", "what's the red set here", or "can this goal close yet?".
- Whenever a truth must change: you never edit truth in passing — you open a goal.

## Inputs

- an **idea ref** (from the `ideas` schema) carrying its `spec_delta` and a **`mirror_delta`** (no mirror ⇒ refused).
- the S22 red-wave inputs — the **bumped** kernel sources, the versioned **link graph** (with declared load-bearing flags), the current **heads** — from which `redwave.Impact` derives the red set (the cascade is S22's, never re-implemented).
- the **parent phase** the ChangeSet moves from, and the declared **budgets**.

## Outputs

- one **OPEN**, content-addressed **Goal** wrapping a **DRAFT** `ChangeSet` (S20) and a **non-empty** red set — or an actionable `BlockReason` (`IDEA_WITHOUT_MIRROR` / `NO_RED_SET`).
- the goal id is `Hash(Canonicalize(body))` (S02 content-addressing reused — never forked).
- nothing applied, nothing frozen: the DRAFT→APPLIED transition stays S20's commit-gate; the close stamp is the aidos CLI role, never the agent.

## Steps

1. **Resolve the idea.** Read it from `ideas` (idea-intake MCP). If vague, run `/grill-with-docs` / `/spike` / `/harvest` first.
2. **Confirm it carries a mirror_delta.** If not → it is a vœu; `OpenGoal` returns `IDEA_WITHOUT_MIRROR`. Draft the mirror first (the red IS the goal). Do not invent a target/business rule — emit an OpenQuestion.
3. **OpenGoal.** Call `goal.OpenGoal(OpenInput{...})`: it opens the DRAFT ChangeSet (atomic spec+mirror, S20) and derives the red set via `redwave.Impact` (S22). An empty red set ⇒ `NO_RED_SET` (already green — not a goal).
4. **Drive red→green outside-in.** This is the agent's `/src` work (the `/tdd` loop), NOT this engine. Turn each red-set mirror green without touching truth.
5. **Compute the stop — never declare it.** Feed the live verdicts (sensors, prior-green, mutation, monsters) to `Stop:goal-check`. The goal closes ONLY when `IsClosed` holds. A surviving red, a broken prior green, a low mutation score, or a monster keeps it OPEN.
6. **Hand the close to the aidos role.** You never stamp CLOSED; the agent has SELECT-only on `ideas.goal`. The commit-gate (S20) + the aidos CLI writer role apply and close.

## Stop conditions (non-gameable)

- A DRAFT ChangeSet exists with `spec_delta` + `mirror_delta` and a **non-empty** red set; no monster, no orphan.
- The close is admitted **only** when `red set→green ∧ prior green intact ∧ mutation ≥ floor ∧ no monster` — computed by `IsClosed`, surfaced by `Stop:goal-check`, never by your say-so.
- No `kernel` / `mirrors` / `fitness` write (the wall held); the agent never stamps CLOSED.
- All unresolved gaps are OpenQuestions, not invented facts.

## Honesty rules (mandatory)

- **Never invent** a target, a targetId, or a business rule to make a goal look complete — uncertainty becomes an explicit **OpenQuestion** in `provenance`.
- **Never write a truth-test** you would then satisfy (the circularity §57/§58 is exactly what S29 closes). The red set is a means-test toward the human red; the engine never grades your own copy.
- A goal with an **empty** red set is not a goal (`NO_RED_SET`); an idea with **no mirror** is a monster (`IDEA_WITHOUT_MIRROR`).
- **Done is computed, never declared.**

## Related artifacts

- **Engine:** `back/runtime/goal` — `OpenGoal` / `IsClosed` / `CloseBlockReason` (pure, total, deterministic; reuses S02 hash, S20 Open/DRAFT, S22 Impact, S13 BlockReason).
- **Hook:** `Stop:goal-check` (`back/hooks/goal-check`) — the non-gameable stop gate; defers to `IsClosed`; fault-injected.
- **Migration:** `ideas.goal` (`back/migrations/ideas_goal_baseline.sql`) — the promotion record; agent SELECT-only.
- **Workbench:** `/goal` (`front/web/app/goal`) — renders the source idea, the DRAFT ChangeSet badge, the red set, the four-condition stop indicator, the budgets burndown.
- **MCP:** none new — `OpenGoal`/`IsClosed` is a pure library; idea-intake + the changeset MCP already exist. (If a callable `goal_open` op truly emerges, record an OpenQuestion — do not build it here.)
