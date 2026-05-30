---
name: trim-kernel
description: Measure KernelDebt — stale fixtures, surviving mutants, orphan mirrors, dead (never-failing) liveness — and propose minimal reductions. Use whenever someone runs `aidos trim`, asks to "trim the kernel", "measure kernel debt", "find stale fixtures / surviving mutants / orphan mirrors / dead mirrors", or wants to shrink the truth surface. Suggests only; it NEVER deletes a truth, a mirror, or a fixture automatically.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# trim-kernel (KRD gesture)

## Purpose

Compute **KernelDebt** — the drift between the truth surface and its living proof — and **propose** the smallest set of reductions that would pay it down. Debt has four shapes: **stale fixtures** (workflow fixtures whose target operation/AST moved underneath them), **surviving mutants** (gremlins/StrykerJS mutations the mirrors fail to kill — a hole in the proof), **orphan mirrors** (a mirror that `reflects` nothing — a monster), and **dead mirrors** (mirrors that never go red under fault injection — a missing proof wearing a green coat). The gesture **measures and suggests**; the human disposes via `/goal` + an approved changeset. The AI never trims truth.

> The wall (CLAUDE.md §2): this gesture **never** writes the `kernel`, `mirrors`, or `fitness` schemas, and never deletes a fixture or a truth. Every reduction is a **proposal** (a `TrimProposal`) for a human to approve as a changeset. The only door to changing truth stays `idea → mirror → /goal → human approval`.

## When to use

- The `aidos trim` CLI runs, or the Workbench **KernelDebt** panel is opened.
- Someone says "trim the kernel", "measure the debt", "what's stale / surviving / orphaned / dead here?", or "shrink the truth surface".
- After a changeset, revert, or merge in the DAG, to detect fixtures the move left stale and mutants the change opened.
- During curation / quality-diversity housekeeping of the Archive, before a stable phase.

## Inputs

- The Kernel truths in scope (entity/policy/operation/control/action ids + invariants/budgets) — read-only, from the base.
- The mirror records in `mirrors` (`reflects, test_kind, cert_language, liveness`) + their materialized sources.
- The latest **mutation report** (gremlins for Go, StrykerJS for front) — surviving vs killed mutants per truth.
- The **fixture set** (`state → command → events`) and the AST/version each fixture targets, to detect staleness (target version ≠ fixture's pinned version).
- The relevant `CONTEXT.md` / `CONTEXT-MAP.md` glossary + ADRs (ubiquitous language).

## Outputs

- A **KernelDebt report**: four lists — stale fixtures, surviving mutants, orphan mirrors, dead mirrors — each item carrying the truth it touches, the evidence, and a severity.
- A **debt score** per subsystem (counts + a weighted total against declared waterline thresholds — declared, never learned, §8).
- Zero or more **TrimProposals**: minimal, reversible suggestions (e.g. "re-pin fixture F to op v7", "add a scenario to kill mutant M", "supersede orphan mirror via lifecycle", "strengthen dead mirror's assertion"). Each is a *suggestion* routed to `/goal`, never applied.
- Zero or more **OpenQuestions** in provenance for every gap (unknown target, undecidable cause, ambiguous owner) — never a guess.

## BDD / mirror required before use

This gesture *measures*; it produces no new truth, so it writes no truth-test of its own. The engine it drives ships its proof first (`back/runtime/vitality/` + `back/archive/curation/`): a **fixture** asserts that a known-stale fixture, a seeded surviving mutant, a planted orphan mirror, and a deliberately-dead mirror each surface as exactly one debt item with the right shape and severity, and that a `TrimProposal` is emitted **DRAFT** (no kernel/mirror write, no deletion). If that proof is not green, fix it before trusting a debt number.

## Steps

1. **Gather the surface.** Read the in-scope truths and their mirror records (read-only). Do not invent an id — unknown scope → **OpenQuestion**.
2. **Detect stale fixtures.** For each workflow fixture, compare its pinned target version against the current AST version of the operation/entity it drives. A divergence (the target moved, the fixture did not) is a stale-fixture debt item; cite both versions.
3. **Detect surviving mutants.** Read the mutation report; list mutants that survived (no mirror killed them). Map each to the truth whose proof has the hole. A surviving mutant is a *missing assertion*, not a reason to weaken the budget.
4. **Detect orphan mirrors.** Find mirrors whose `reflects` points at no live truth — the monster. Detect dead mirrors via the fault-injection liveness verdict (stayed green when its target was broken = dead = a missing proof).
5. **Score the debt.** Aggregate counts and the weighted total against the **declared** waterline (read-only from `fitness`); never auto-tune a threshold to hide debt.
6. **Propose, never dispose.** For each item, draft the **minimal, reversible** reduction as a `TrimProposal` (re-pin / add-scenario / supersede-via-lifecycle / strengthen-assertion). Persist proposals + provenance + OpenQuestions via the MCP. Hand off to `/goal`; stop. The human approves the changeset; you delete nothing.

## Stop conditions

- The four debt lists + the score are produced and grounded in evidence (versions, mutant ids, liveness verdicts) — no guessed cause.
- Every reduction is a **DRAFT TrimProposal** routed to `/goal`; nothing in `kernel` / `mirrors` / `fitness` was written; no fixture, mirror, or truth was deleted.
- Every gap (unknown target, undecidable staleness, ambiguous owner) is an **OpenQuestion** in provenance.
- You did **not** weaken a budget, mute a mutant, or "fix" debt by lowering a declared threshold.

## Failure modes

- **Auto-deleting to clear debt** — removing a fixture/mirror/truth to make the number go down. Forbidden and blocked; trim *proposes*, the human disposes.
- **Gaming the metric (anti-Goodhart, §8)** — lowering a waterline, deleting a hard mirror, or muting a surviving mutant to flash green. The score must reflect real proof, not a doctored target.
- **Inventing a target/targetId or a cause** to complete a debt item → emit an OpenQuestion instead.
- **Treating a surviving mutant as noise** — it is a hole in the proof; the reduction adds a scenario, never relaxes the mutation threshold.
- **Calling a dead mirror healthy** — green without ever going red under fault injection is a missing proof, not a passing one.
- **Declaring done** — trim leaves proposals, not a clean kernel. "Done" is computed downstream (§8), never declared here.

## Related hooks

- `PreToolUse` (the wall) — refuses any write to `kernel` / `mirrors` / `fitness` and any delete of a fixture/mirror from this gesture; route reductions through `/goal` + changeset.
- `Stop` (completeness) — blocks finish if an orphan or dead mirror is reported but left unaccounted, or a `TrimProposal` is left with no provenance.
- A **fault-injection** test ships with the liveness check (break a mirror's target, assert it goes red) — a dead liveness sensor is itself debt.

## Related MCP tools

- **store** — read the Kernel AST + truth versions to detect stale fixtures and orphaned `reflects` (read-only).
- **mirror-runner** — read mirror records, run fault injection for the liveness verdict, and read/trigger the gremlins / StrykerJS mutation report.
- **telemetry-reader** — pull the latest mutation + liveness telemetry written to Postgres.
- **changeset** / **idea-intake** — persist each `TrimProposal` as a DRAFT (never applied) and open the `idea → /goal` door; record OpenQuestions in provenance.

## Workbench visualization

Next route `front/web/app/debt/` → the **KernelDebt** panel (do not touch existing routes): the four debt lists (stale fixtures, surviving mutants, orphan mirrors, dead mirrors) with the weighted score against the declared waterline, and each `TrimProposal` rendered as a card explicitly labelled "PROPOSAL — suggests only; reduction needs /goal + an approved changeset". A Playwright e2e (`tests/e2e/debt.spec.ts`) asserts a seeded surviving mutant and a planted orphan mirror appear in their lists and that the proposal card shows no apply/delete affordance.

## Honesty rules

Never invent a `target`, a `targetId`, a business rule, or a debt cause to complete the report or pad a reduction; every gap — unknown target, undecidable staleness, ambiguous owner, untraceable mutant — becomes an explicit **OpenQuestion** in provenance for the human to resolve. Trim measures and suggests; it never deletes a truth, a mirror, or a fixture, never weakens a declared threshold, and never declares the kernel clean.
