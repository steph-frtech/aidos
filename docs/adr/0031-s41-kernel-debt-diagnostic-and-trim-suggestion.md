# ADR 0031 — S41 KernelDebt diagnostic + /trim suggestion: three declared kinds, suggest-only, snapshot above the waterline

- Status: accepted
- Date: 2026-06-01
- Step: S41 (Runtime — KernelDebt + /trim-kernel; stale fixtures, surviving mutants, orphan mirrors)
- Linear: AID-10

## Context

KRD on kernel debt / curation / completeness: the truth-store accumulates *rot* — stale
fixtures, surviving mutants, orphan mirrors — and **naming it is a DIAGNOSTIC, never a
deletion**. The only door to changing a truth stays `idea → mirror → /goal → human
approval` (CLAUDE.md §2). Debt is **computed**, never declared (the anti-Goodhart Judge is
the deterministic mirror, §8). S41 lands the pure `Scan(snapshot, now) → KernelDebt`
diagnostic and the pure `SuggestTrim(debt) → TrimPlan` gesture, plus the
`fitness.kernel_debt_snapshot` record and the `/kernel-debt` Workbench panel.

This step makes no real *tool* substitution (the stack slots are frozen). This ADR records
only the genuine design choices.

## Decisions

1. **Exactly three declared debt kinds — never invented.** `DebtItem.kind ∈
   { orphan_mirror, stale_fixture, surviving_mutant }`. The `orphan_mirror` notion is
   **consumed** from S12/S06 (`records.NoOrphanMirror` / `no_orphan_mirror`), not
   re-coined. The three kinds are mutually exclusive by construction: a mirror whose
   reflected truth *id* has no live truth at all is `orphan_mirror`; a **fixture** whose
   *id* is still live but at a moved version is `stale_fixture` (version drift, not an
   orphan); a **survived** mutation against a truth a **living** mirror covers is
   `surviving_mutant`. This split keeps each rot counted **once**.

2. **Surviving-mutant scope = covered-by-a-living-mirror only.** A survived mutation
   against a truth **no** living mirror covers is a coverage gap, a *different* diagnostic
   — S41 flags only survivors the completeness law says a mirror should have killed (it
   names the mirror that failed). The mutation results are **consumed** from the S40 run,
   never produced here.

3. **`now` is a parameter; classification never reads the clock.** `Scan(snapshot, now)`
   is a pure, total function of the snapshot alone for its DebtItems (`now` is reserved for
   the recorder's `scanned_at` stamp). Same snapshot ⇒ same ranked report (the rapid
   determinism property pins it). No DB, no I/O, no `time.Now()`.

4. **Suggest-only: every trim action opens an idea, never deletes.**
   `TrimSuggestion.proposed_action ∈ { open_idea_to_retire_mirror,
   open_idea_to_repin_fixture, open_idea_to_strengthen_mirror }` and `requires` is always
   the door `idea → mirror → /goal → human approval`. There is **no** `delete_*` action.
   `SuggestTrim` deletes nothing, writes no truth, opens no ChangeSet. The `/kernel-debt`
   panel exposes **no** apply/delete affordance (the rule made visible).

5. **Content-addressing reuses S01/S02 — not forked.** A `DebtItem` id and a recorded
   snapshot id are `Hash(Canonicalize(body))` over the same scheme S01/S02 use
   (`records.Canonicalize` + `records.Hash`).

6. **The debt snapshot lives in `fitness`, above the line — agent SELECT-only.** Unlike
   the runtime audit logs (mutation_runs, sensor_runs — `runtime` schema, below the
   waterline, agent INSERT+SELECT), the KernelDebt snapshot is recorded in
   `fitness.kernel_debt_snapshot` (the NIVEAU-3 read-only diagnostic zone). The agent role
   gets **SELECT only**; only the `aidos` CLI writer records a snapshot, via an approved
   ChangeSet (S20). The table is **append-only** (a new scan is a new row; UPDATE/DELETE
   revoked from the writer too) and **expand-only** (it adds a table; it alters/drops
   nothing prior). No fitness WRITE GRANT is added to the agent — the wall is unchanged.

## Consequences

- KernelDebt is a **diagnostic**, not a garbage collector / purge / retention policy /
  deleting linter; `/trim` is **not** a delete command. Acting on debt is a *later*
  `idea → mirror → /goal`.
- No new MCP server (Scan/SuggestTrim are pure libraries; reading the snapshot reuses the
  `store` read path; recording it reuses the S20 changeset MCP + `aidos` writer). No new
  hook (`/trim` is advisory, not a non-bypassable rule — a hook that never fires is dead).
- The Stop conjunct is unchanged: completeness (S12) already blocks on orphan monsters;
  S41 only *names and ranks* the debt for human disposal.

## Open questions

- **OQ-S41-ui-live** — the `/kernel-debt` panel renders seeded scenarios until the live
  `fitness.kernel_debt_snapshot` read path (SELECT-only) is wired; a by-design
  forward-dependency, not a residual issue.
