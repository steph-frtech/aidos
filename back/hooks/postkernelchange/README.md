# PostKernelChange hook — fire the red wave (SCAFFOLD)

> **Status: SPEC ONLY. Not wired live.** This is a scaffold per CLAUDE.md §5
> (hook-honesty: *a hook that never fires is dead*). It is **activated and
> fault-injection-tested at step S22**, never before. The `doc.go` in this
> package compiles but carries **no logic** on purpose.

## Role

When the kernel head changes (a changeset is APPLIED), **fire the red wave**
(*vague de rouge*) by **stigmergy**: recompute the agent worklist from the
mirror state. The propagation is left in the environment (the recomputed red
queue), not pushed through the context — agents pick up the next red work item
on their own. This is the on-ramp from *a truth changed* to *here is the new red
set to drive green*.

This phase is AIDOS-specific (it has no entry in the generic
`KRD_CLAUDE_scaffold/runtime/hooks/hooks.yaml` `PostToolUse/Stop` lists; it
corresponds to the `Continuous` notions `update_red_work_queue` +
`compute-red-wave`, promoted to a dedicated kernel-change phase per CLAUDE.md
§3 Hooks slot `PostKernelChange`).

## When it fires

- **Phase:** `PostKernelChange` — after a changeset moves to `APPLIED` and the
  kernel head (the `kernel` schema, content-addressed) advances.
- Fires **once per applied kernel change**, not per diff and not at Stop.
- Input: the SemanticDiff of the changeset (add / refine / override / rescope /
  reweight / deprecate) and its blast radius.

## What it enforces / does

1. **Recompute the worklist** — walk the affected subgraph from the changed
   truths through their `reflects` links to the mirrors, mark newly-red mirrors,
   and (re)build the **red queue** in the `dag` / worklist projection.
2. **Stigmergic propagation** — it *writes the trail* (the recomputed red set
   below the line); it does not assert truth and does not block. It is an
   enabling hook, but it must still be **honest**: if a kernel change produced no
   recomputation when the blast radius says it should have, that is a failure.
3. **No monster introduced** — a kernel change that leaves a truth without a
   reachable mirror is flagged for the Stop completeness gate (it does not
   silently pass).

## BlockReason emitted

This phase is primarily an *enabling* hook (it recomputes rather than refuses),
but it emits a `BlockReason` when the red wave cannot be computed honestly:

```json
{
  "code": "RED_WAVE_RECOMPUTE_FAILED",
  "severity": "error",
  "explanation": "Kernel change cs-3f9a touched operation order.create but no mirror reflects it; the red wave cannot be propagated.",
  "how_to_fix": [
    "Run `aidos impact --changeset=cs-3f9a` to see the blast radius.",
    "Ensure every touched truth has a reflecting mirror (no monster) before applying.",
    "Re-apply once the SemanticDiff resolves; the worklist will recompute from the mirror state."
  ]
}
```

Related codes: `RED_WAVE_RECOMPUTE_FAILED`, `BLAST_RADIUS_UNREACHABLE`,
`WORKLIST_WRITE_FAILED`.

## Fault-injection test (required at activation, S22)

- **Inject:** apply a kernel change that reddens a known set of mirrors.
  **Assert:** the recomputed worklist contains exactly that red set (the wave
  fired) — not empty, not the whole project.
- **Inject:** apply a change whose blast radius reaches a truth with no
  reflecting mirror. **Assert:** `RED_WAVE_RECOMPUTE_FAILED` /
  `BLAST_RADIUS_UNREACHABLE`.
- **Negative control:** a no-op / projection-only change must produce an **empty**
  red wave (the hook must not redden the world on every change).

## Activation

**Activated at step S22.** Until then this package is an inert scaffold.
