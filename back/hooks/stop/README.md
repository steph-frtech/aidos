# Stop hook — completeness (ACTIVE, S12) + goal-check (scaffold, S29)

> **Status (S12): the COMPLETENESS half is ACTIVE and fault-injection-tested.**
> The Stop hook now reads the current cut of `mirrors ⋈ kernel`, runs S06's monster
> detector + the S12 gate (`back/kernel/mirror/completeness`), and **blocks** the
> Stop on any monster (BlockReason code `MONSTER`; `INCOMPLETE` when the check
> itself cannot run — KRD §82 fail-closed). Every evaluation is recorded
> append-only in `runtime.completeness_runs` (ADR 0014/0015, below the waterline).
> The **goal-check half** (`red set → green ∧ prior green intact ∧ mutation ≥
> threshold`) remains a scaffold, **activated at S29** (OQ-S12-2).

## Role

The deterministic **stop condition**. "Done" is *computed, never declared by the
agent* (CLAUDE.md §8). At session/turn end this hook decides whether the step is
actually done, and **blocks the Stop** if not.

Taxonomy origin (`KRD_CLAUDE_scaffold/runtime/hooks/hooks.yaml`, `Stop`):
`all_red_green · no_previous_green_broken · completeness_law_holds ·
scope_valid · authority_valid · mutation_threshold_met_if_required`.

## When it fires

- **Phase:** `Stop` — when the agent attempts to end its turn / declare the step
  finished. This is the last gate, not a per-diff gate.
- It runs the **slow gates** the PostToolUse hook deliberately skips: the full
  affected red set, mutation testing, completeness scan.

## What it enforces

The conjunction (all must hold, else block):

1. **Goal-check (S12)** — `red set → green` **∧** `prior green intact` **∧**
   `mutation score ≥ declared threshold`. The red set is the non-gameable
   `/goal`; the agent cannot force it.
2. **Completeness / no monster (S29)** — every spec layer has a *living* mirror;
   no **orphan mirror** (mirror reflecting no truth) and no **mirror-less truth**
   (a wish). The completeness law forbids monsters.
3. **Scope valid** — the diff stayed inside this step's own package / scope.
4. **Authority valid** — no above-the-line mutation slipped through without an
   approved changeset.

## BlockReason emitted

On failure, returns the standard actionable `BlockReason`:

```json
{
  "code": "STOP_BLOCKED_RED_SET_NOT_GREEN",
  "severity": "error",
  "explanation": "Goal S12 red set has 2 mirrors still red; mutation score 0.71 < threshold 0.80.",
  "how_to_fix": [
    "Run `aidos check --goal=<id>` to list the still-red mirrors.",
    "Drive each red→green, then re-run mutation with `aidos check --mutation`.",
    "Stop is blocked until red→green ∧ prior-green-intact ∧ mutation ≥ threshold ∧ no monster."
  ]
}
```

Related codes this hook may emit: `STOP_BLOCKED_RED_SET_NOT_GREEN`,
`PRIOR_GREEN_BROKEN`, `MUTATION_BELOW_THRESHOLD`, `MONSTER_ORPHAN_MIRROR`,
`MONSTER_MIRRORLESS_TRUTH`, `SCOPE_VIOLATION`, `AUTHORITY_MISSING`.

## Fault-injection test (required at activation, S12 + S29)

- **Inject (S12):** leave one red-set mirror red. **Assert:**
  `STOP_BLOCKED_RED_SET_NOT_GREEN`, Stop refused.
- **Inject (S12):** redden a previously-green mirror. **Assert:**
  `PRIOR_GREEN_BROKEN`.
- **Inject (S12):** drop mutation score below threshold (add an unkilled mutant).
  **Assert:** `MUTATION_BELOW_THRESHOLD`.
- **Inject (S29):** add an orphan mirror (reflects nothing). **Assert:**
  `MONSTER_ORPHAN_MIRROR`. Add a truth with no mirror. **Assert:**
  `MONSTER_MIRRORLESS_TRUTH`.
- **Negative control:** a fully-green, complete, in-scope step must **let Stop
  through** (the gate must be passable, not a brick wall).

## Activation

**Activated at steps S12 (goal-check) and S29 (completeness).** Until then this
package is an inert scaffold.
