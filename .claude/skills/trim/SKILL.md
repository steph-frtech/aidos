---
name: trim
description: The /trim gesture (KRD §S41) — scan the kernel for debt (orphan mirrors, stale fixtures, surviving mutants) and PROPOSE a trim plan over the findings. Suggests only; it DELETES NOTHING. Use when someone runs `aidos trim`, opens the Workbench /kernel-debt panel, says "trim the kernel", "what's orphaned / stale / surviving here?", or wants to shrink the truth surface. Every proposed action is the opening of an idea; acting on it goes through idea → mirror → /goal → human approval.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# trim (KRD gesture, S41)

## Purpose

Run **KernelDebt** — the read-only diagnostic that names the *rot* accumulating in the truth-store — and **propose** a trim plan over it. This is the **executable** `/trim` gesture pinned to the S41 implementation (`back/runtime/debt`). It **detects and ranks**; it **deletes nothing, writes no truth, opens no ChangeSet**. The human disposes; the AI proposes.

> The wall (CLAUDE.md §2/§8): `/trim` **never** writes the `kernel`, `mirrors`, or `fitness` schemas, and never deletes a mirror, a fixture, or a truth. Recording a debt **snapshot** (`fitness.kernel_debt_snapshot`) is done only by the `aidos` CLI writer role through an **approved ChangeSet** (S20) — never by the agent, never by this gesture. The only door to acting on debt stays **`idea → mirror → /goal → human approval`**.

## The three declared kinds — never invented

KernelDebt classifies rot into **exactly three** kinds (declared in `back/runtime/debt`, never coined ad hoc):

- **`orphan_mirror`** — a mirror reflecting **no live truth** (a monster by the completeness law). CONSUMED from S12/S06 `no_orphan_mirror`; the monster notion is never re-defined here.
- **`stale_fixture`** — a **fixture** mirror whose pinned truth `@version` no longer matches the **live head** it reflects (the pin moved).
- **`surviving_mutant`** — a mutation reported **alive** by the CONSUMED mutation/gremlins run (S40), against a truth a **living mirror** claims to cover (the mirror did not kill what it should). Mutants are CONSUMED, never produced here.

## The three trim actions — every one opens an idea

`SuggestTrim` maps each debt item to **exactly one** `open_idea_*` action — never a removal:

| Debt kind | Proposed action | Requires |
|---|---|---|
| `orphan_mirror` | `open_idea_to_retire_mirror` | `idea → mirror → /goal → human approval` |
| `stale_fixture` | `open_idea_to_repin_fixture` | `idea → mirror → /goal → human approval` |
| `surviving_mutant` | `open_idea_to_strengthen_mirror` | `idea → mirror → /goal → human approval` |

There is **no** `delete_*` action. The plan is a *proposal a human (or a later goal) may act on*.

## Inputs (a read-only snapshot)

- The live **kernel** truths (id, head version, live) — SELECT-only, the wall.
- The **mirror** records (`reflects`, `test_kind`, `liveness`, pinned version) — SELECT-only.
- The latest **mutation run** (S40) — survived/killed per target — CONSUMED.
- A passed-in `now` (the recorder's stamp; `Scan`'s classification never reads the clock — it is deterministic and replayable).

## Procedure

1. **Take a read-only snapshot** of `kernel ⋈ mirrors ⋈ latest mutation run` (the `store` MCP read path; no new backend service). Never write.
2. **`Scan(snapshot, now)`** (`back/runtime/debt`) → the ranked `KernelDebt` (`[]DebtItem{id, kind, target_ref, reason, severity}`). `id = Hash(Canonicalize(body))` (S01/S02 reused).
3. **`SuggestTrim(debt)`** (`back/runtime/debt/trim`) → the `TrimPlan` (`[]TrimSuggestion{debt_item_ref, proposed_action, rationale, requires}`).
4. **Present** the findings + the plan (the `/kernel-debt` Workbench panel renders them; no delete/apply affordance).
5. **Stop.** Acting on any suggestion is a **separate** `idea → mirror → /goal → human approval`. `/trim` never bypasses the door.

## Honesty rules (mandatory)

- **Suggest, never delete.** `Scan`/`SuggestTrim` and `/trim` delete nothing and write no truth — a trim is a *suggestion*.
- **Never invent** a debt kind beyond the three, a trim action beyond the three `open_idea_*`, or a `target_ref` that does not trace to a real input truth/mirror/mutation. Uncertainty → an **OpenQuestion** in `provenance`, then stop on that branch.
- **The judge is the deterministic mirror** (the fixture + rapid property in `back/runtime/debt`), never an LLM scoring its own output. Debt is **computed**, never declared.
- **Reuse, never re-coin**: S01/S02's `Canonicalize`/`Hash`, S12/S06's monster notion, the S40 mutation-run shape. Any change to a prior contract goes through a ChangeSet + SemanticDiff.

## Outputs

- A `KernelDebt` report (ranked `DebtItem`s) + a `TrimPlan` (suggestions), surfaced in `/kernel-debt`.
- Optionally, a recorded `fitness.kernel_debt_snapshot` row — written **only** by the `aidos` writer role via an approved ChangeSet (never by the agent).
