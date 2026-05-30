---
name: open-goal
description: Turn a harvested idea into a goal — create the Truth + Mirror as a DRAFT changeset and compute the non-gameable red set that becomes the step's stop condition. Use when the user wants to open a /goal, promote an idea toward truth, define a red set, or asks "what's the goal here?" after harvesting an idea.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# open-goal

The one legal door from a candidate-truth to the kernel: `idea → mirror → /goal → human approval`. This gesture stops at the DRAFT. It never writes truth (the wall, CLAUDE.md §2) and never declares `done` (§8).

## Purpose

Take a single harvested **idea** (a candidate-truth in the `ideas` schema) and turn it into a **goal**: draft the Truth (Kernel DSL AST) and its **Mirror** (the bicephalous proof) inside one append-only DRAFT **changeset**, then compute the **non-gameable red set** — the failing mirrors that, when green, define "this goal is reached". That red set IS the stop condition for the step that follows.

## When to use

- After `/harvest` surfaced an idea worth promoting, and before any code is written.
- When the user says "open a goal", "let's make this a goal", "define the red set", or "promote this idea".
- Whenever a truth needs to change: you do not edit truth in passing — you open a goal.

## Inputs

- **idea id** (from the `ideas` schema) or, if none exists, an idea draft to intake first.
- The relevant **CONTEXT.md** glossary + ADRs for the target subsystem (ubiquitous language).
- The **target / targetId** the truth attaches to (entity, policy, operation, control). If unknown → OpenQuestion (see Honesty rules).

## Outputs

- One **DRAFT changeset** (append-only) bundling, atomically:
  - the **Truth** spec — a Kernel DSL AST (entity / policy / operation / control / action + invariants/budgets) staged for the `kernel` schema.
  - the **Mirror** record + source (Gherkin `.feature`, rapid/fast-check property, or fixture `state→cmd→events`) staged for the `mirrors` schema, linked by `reflects`.
- A **red set**: the enumerated mirrors, materialized to disk and run **red** at least once (a red you have actually seen, not asserted).
- Zero or more **OpenQuestions** for anything you could not resolve from truth/docs.
- Nothing applied: the changeset stays `DRAFT` pending **human approval** at the `/goal`.

## BDD / mirror required before use

The mirror is written **before** any implementation and run red first — that red is the goal (CLAUDE.md §6.2). Pick the form by the nature of the truth:

- Journey / acceptance (N0) → **Gherkin** `.feature` (Godog / Playwright-bdd).
- Invariant ∀ (N1) → **property** (rapid / fast-check).
- Workflow (N2) → **fixture** `state → command → events`.

No truth is drafted without its living mirror; an orphan mirror is a monster (completeness law).

## Steps

1. **Resolve the idea.** Read it from `ideas` (idea-intake MCP). If it is vague, run `/grill-with-docs` first — sharpen the ubiquitous language against CONTEXT.md/ADRs. One intention, ≤ 5 scenarios.
2. **Locate the target.** Find the `target` + `targetId` in the `kernel` schema the truth attaches to. If absent → OpenQuestion, do not invent.
3. **Draft the Truth.** Stage the Kernel DSL AST (entity/policy/operation/control/action + invariants/budgets) into a new DRAFT changeset. Do not write the `kernel` schema directly.
4. **Write the Mirror first.** Author the mirror source in the correct form, link it `reflects → truth`, materialize it to disk.
5. **Compute the red set.** Run the mirrors via the mirror-runner. Confirm they are **red** for the right reason (the behaviour is genuinely absent, not a typo). Enumerate them as the stop condition.
6. **Anti-gaming check.** The red set must be non-gameable: every scenario asserts observable behaviour through a public interface, none can be satisfied by editing the test, none is a truth-test you would then trivially satisfy (§8). Reject any mirror that can pass without the behaviour existing.
7. **Record provenance.** Attach who/why/when and the source idea to the changeset (`provenance`).
8. **Hand off to `/goal`.** Surface the DRAFT changeset + red set for human approval. Stop. Approval (not you) promotes it.

## Stop conditions

- DRAFT changeset exists with Truth + linked Mirror, no monster, no orphan.
- Red set is enumerated and has been observed **red** at least once.
- No `kernel` / `mirrors` / `fitness` schema was written (the wall held).
- All unresolved gaps are OpenQuestions, not invented facts.
- Status is `DRAFT` awaiting human approval — you did not apply, merge, or declare `done`.

## Failure modes

- **Inventing a target/targetId or a business rule** → forbidden; emit an OpenQuestion instead.
- **Gameable red set** (asserts implementation, passes without behaviour, or is a truth-test) → rework the mirror.
- **Writing truth to get to green faster** → blocked by the PreToolUse wall hook; you have no GRANT anyway.
- **Orphan mirror / truth without mirror** → completeness law / Stop hook blocks.
- **Mirror green on first run** → it proves nothing; it must be red first.
- **Editing an existing mirror without a SemanticDiff** → anti-overwrite (§9); supersede via a new changeset.

## Related hooks

- **PreToolUse** (`back/hooks/pretooluse`) — refuses any write to `kernel` / `mirrors` / `fitness`; returns an actionable BlockReason.
- **Stop** (`back/hooks/stop`) — blocks finish if a layer lacks its living mirror or a monster exists.
- **PostKernelChange** (`back/hooks/postkernelchange`) — fires once a goal is approved and applied (out of this gesture's scope).

## Related MCP tools

- **idea-intake** — read/normalize the candidate-truth from the `ideas` schema.
- **changeset** — open the DRAFT, stage Truth + Mirror atomically (append-only).
- **store** — stage the Kernel DSL AST / content-address it.
- **mirror-runner** — materialize and run the mirrors to confirm the red set.
- **memory** / **context** — pull prior episodes and the ContextGraph for reuse decisions.

## Workbench visualization

Surface the goal in the Workbench (`front/web/app/<route>/`): the DRAFT changeset, the SemanticDiff (Truth before/after), the enumerated **RedWorkQueue** (the red set), and the Approve / Reject control that routes the human decision back as an approved ChangeSet. Add a Playwright e2e for the goal-review flow.

## Honesty rules

Never invent a `target`, a `targetId`, or a business rule to make the goal look complete — any uncertainty becomes an explicit **OpenQuestion** attached to the changeset for the human to resolve. The red set is the truth; you compute it, you never declare the goal reached.
