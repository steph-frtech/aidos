---
name: merge-semantic
description: Merge a branch by re-running every mirror on the merged cut so the mirror decides the merge, not the text diff — a red mirror blocks it. Use whenever two DAG branches or stable phases must be joined, someone asks to "merge this branch / can these merge / is this merge safe", a textual git/jj merge looks clean but behaviour must still be proven, or a merge changeset needs gating before it lands.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Merge Semantic (KRD gesture)

A KRD gesture: join two branches of the version **DAG** (stable phases as nodes, changesets as edges) by computing the **merged cut** and re-running **all** the mirrors on it. The **mirror is the judge** — a clean text diff means nothing; behaviour on the union of both branches must still be green. Any red mirror **blocks the merge**.

> The wall (CLAUDE.md §2): this gesture never writes the `kernel` / `mirrors` / `fitness` schemas. It produces a **merge changeset** (DRAFT) on the `dag`; the merge only lands through `/goal` → human approval, never from here.

## Purpose

Decide a merge by **proof, not by text**:

- compute the **merged cut** — the union of kernel truths + mirrors implied by joining branch A and branch B at their merge-base,
- **re-run every mirror** on that cut (the live set, not just the changed files): a textual three-way merge can succeed while two independently-green changes contradict each other (a **semantic conflict**),
- **gate** on the result — all green → the merge changeset is mergeable; any red → blocked, with the offending mirror(s) named,
- record the merge as a DAG edge (append-only) and surface every gap as an **OpenQuestion**.

## When to use

- Two DAG branches / stable phases must be joined and the join must be *behaviour-safe*, not just *text-clean*.
- A `git`/`jj` merge of the projection code resolves with no conflict but the underlying truths may still disagree.
- Someone says "merge this branch", "can these two merge", "is this merge safe", "rebase these phases".
- Evolutionary search (QD) proposes joining two explored phases and the join needs a verdict before it enters the DAG.

## Inputs

- `branchA`, `branchB` — the two DAG branches / phase ids to join (required). **Read from the `dag`, never invented.**
- The **merge-base** phase (their last common ancestor) — read from the `dag`, not guessed.
- The mirror set live on the merged cut (`reflects`, `test_kind`, `cert_language`, `liveness`) from the `mirrors` schema.
- `CONTEXT-MAP.md` + the subsystem `CONTEXT.md` for the glossary (DAG / phase / red wave / merged cut).

## Outputs

A **merge changeset** (DRAFT, append-only) recorded on the `dag` via the dag / changeset MCP — never a direct kernel write:

- `merged_cut` — the union of truths + mirrors resolved from `branchA`, `branchB`, and the merge-base.
- `mirror_verdict` — the full pass/fail of **every** mirror re-run on the cut, each named by the truth it `reflects`.
- `mergeable` ∈ { `true` (all green), `false` (≥ 1 red) } — **computed**, never declared.
- `blocking_mirrors` — when `false`, the exact red mirror(s) and the conflicting truths, so the human can decide.
- Zero or more **OpenQuestion** records for every unresolved branch id, missing merge-base, or ambiguous truth.

## BDD / mirror required before use

This is a verification + gating gesture, not a behaviour. It writes no truth, so it needs no truth-test of its own. But:

- The merge engine (in `back/archive/merge/`) ships with a **red property mirror first** (rapid): e.g. *two branches that are each green do not imply the merged cut is green* — the merge re-runs the full live mirror set, and if any is red, `mergeable` is `false`. `red → green → refactor`.
- Its **fault-injection test**: construct two branches whose changes are each independently green but jointly violate one invariant (a semantic conflict a text merge would miss); assert the merge goes **red** and names that mirror. Break the re-run so a known-red mirror is skipped → assert the gate goes red (incomplete coverage), never a false green.
- Computing a merge does **not** land it — landing truth is `/goal` → human approval, never here.

## Steps

1. **Resolve both branches + the merge-base** from the `dag` (`dag` MCP). If a branch id or the merge-base is absent or ambiguous → **OpenQuestion**, stop; never manufacture one.
2. **Compute the merged cut:** union the kernel truths + mirrors live on `branchA` and `branchB` relative to the merge-base. A truth changed on both sides since the base is a candidate conflict — keep it in the cut, do not pre-resolve it by text.
3. **Materialize the cut's mirrors** and **re-run the full live set** (Godog / rapid / fixture interpreter via `mirror-runner`) — not only the changed files. The text diff does not get a vote.
4. **Collect the verdict** per mirror, each named by the truth it `reflects`. All green → `mergeable: true`. Any red → `mergeable: false` + the `blocking_mirrors`.
5. **Record** the merge changeset (merged cut + verdict + mergeable) on the `dag` as an append-only edge via the dag / changeset MCP. Attach all OpenQuestions.
6. **Hand off:** `mergeable: true` → `/goal` → human approval to land the edge. `mergeable: false` → return the named red mirror(s); the human decides (revise a branch, open an idea, record an override). Never land from here.

## Stop conditions

- **Done is computed, not declared:** the merged cut is resolved, **every** live mirror was re-run (not a subset), `mergeable` is set from the verdict, and every gap is an OpenQuestion.
- A red mirror → `mergeable: false` → **the merge is blocked.** You cannot force it green.
- Stop and refuse if either branch or the merge-base cannot be confirmed in the `dag`.
- Never land or approve the merge from this gesture — a green verdict is necessary, not sufficient; the DAG edge lands through `/goal` → human approval.

## Failure modes

- **Trusting the text diff.** A clean three-way merge is not a proof; behaviour on the union can still be red. The mirror decides — always re-run.
- **Partial re-run.** Re-running only the changed mirrors hides semantic conflicts in untouched truths. Re-run the **full live set** on the cut, or the green is a lie (§8).
- **Manufacturing a branch / base.** Inventing a branch id or merge-base to make the merge resolve → monster. Leave it open + OpenQuestion.
- **Auto-resolving a conflict.** Picking branch A's truth over B's to silence a red is an unrecorded edit (§9). Surface the conflict; the human resolves via a recorded decision.
- **Forcing the gate.** Declaring `mergeable: true` while a mirror is red. Forbidden — done is computed.
- **Wall breach.** Writing the merge result straight into `kernel`/`mirrors`. It belongs on the merge changeset via MCP.

## Related hooks

- `PreToolUse` (the wall) — refuses any write to `kernel` / `mirrors` / `fitness` from this gesture; route via the dag / changeset MCP.
- `Stop` (completeness) — blocks finish if the merged cut leaves a truth without its living mirror, or if a merge changeset is left with mirrors un-rerun / `mergeable` unset.
- `PostKernelChange` — fires when the merge edge lands; uses the merged cut to know what is now head.

## Related MCP tools

- **dag** — resolve `branchA` / `branchB` / merge-base; record the merge as an append-only DAG edge.
- **mirror-runner** — materialize and re-run the full live mirror set on the merged cut (Godog / rapid / fixture interpreter); return the verdict.
- **changeset** — carry the merge as a DRAFT changeset (merged cut + verdict + mergeable) until human approval.
- **store** — read the kernel ASTs on both branches to union the cut and detect candidate conflicts (read-only).
- **context** — walk the ContextGraph to know which mirrors are live on the cut.

## Workbench visualization

Next route `front/web/app/dag/` (or a dedicated merge panel): one merge per card showing the DAG with the two branch tips, the merge-base, the merged-cut node, a green/red **mirror verdict** strip, and — when blocked — the named `blocking_mirrors` and conflicting truths. A Playwright e2e asserts that a semantic-conflict merge renders **red + blocked** (not mergeable) even when the text diff is clean, and that an all-green merge renders mergeable pending approval. Add/extend this route's e2e for the visualization (never touch existing routes).

## Honesty rules

Never invent a `branch`, a branch/phase id, a merge-base, a `targetId`, or a business rule to make a merge resolve or to silence a red; every gap — unconfirmed branch, missing merge-base, ambiguous truth, un-rerun mirror, unresolved semantic conflict — becomes an **OpenQuestion**, never a guess, and the merge is never landed from this gesture.
