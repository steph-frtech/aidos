---
name: evolve
description: Run the medium loop (/evolve self-play + QD) on a cell inside the EvolutionSandbox quarantine — generate variants that may write only branches/reports/ideas, never the kernel; a variant is promoted into a QD niche only when it carries a green mirror (∧ out-of-sample green ∧ authority approval). Use whenever someone wants to evolve a cell, run the medium/QD loop, explore variants of an operation, search the archive for stepping stones, or asks to "improve this cell automatically" — and to make plain that /evolve proposes, it never governs.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# evolve (KRD gesture)

## Purpose

Run the **medium loop** (KRD §62 algorithm ②, §64, §66) on a cell **inside the EvolutionSandbox** (KRD §66.1) — the quarantine where the loop **explores but does not govern**. Sample the QD archive (stepping stones included), generate variants, read the **non-gameable** fitness, keep one élite per niche, and emit candidate **branches/reports/ideas**. The sandbox `can_write` only `/branches/evolution`, `/reports`, `/ideas/proposed`; it `cannot_write` `/kernel`, `/mirrors/above`, `/authority`, `/fitness`. A variant is **promoted** into a niche only with `mirror_green ∧ out_of_sample_green ∧ authority_approval` — and even then `/evolve` produces a **proposal**, never a freeze.

## When to use

- A populated QD archive exists and you want to search it for a better variant of a cell (operation/policy).
- The medium loop ② must run in quarantine: generate candidates without any risk of writing truth.
- Someone says "evolve this cell", "run the QD loop", "explore variants", "find a stepping stone".
- Not the same as `/spike` (S28): `/spike` is the **manual throwaway** idea-exploration zone; the EvolutionSandbox is the quarantine of the **automated** medium loop.

## Inputs

- The **cell** to evolve (operation/policy id) — read-only from the kernel, never invented.
- A **budget** and a **seed** (passed in — the run must be deterministic and replayable; never read `now`/RNG from the ambient).
- The QD niche/élite shape + the anchored fitness reading — **consumed** from S26, never redefined here.
- Target subsystem context (`back/runtime/evolve`) and `back/runtime/CONTEXT.md`.

## Outputs

- An `EvolutionRun`: candidate **branches** under `/branches/evolution`, **reports** under `/reports`, optional **ideas** under `/ideas/proposed` — and nothing else.
- Per candidate, its niche + non-gameable fitness reading (`kernel_red_to_green ⊕ sensors_computational ⊕ out_of_sample`).
- For a gate-passing variant: a **promotion proposal** (a candidate a later human `/goal` can freeze) — never a kernel/mirror/authority/fitness write.

## BDD / mirror required before use

This gesture **runs** an evolution loop; it does not author a mirror. Promotion of a candidate to truth requires the candidate's **green mirror** (∧ out-of-sample green ∧ authority approval), but that mirror and freeze are the separate human `/goal` gesture, not this skill. If you find yourself writing a kernel truth, a mirror above the line, an authority right, or a fitness definition, **stop**: the sandbox proposes, the human freezes.

## Steps

1. **Name the cell** it evolves. Confirm the kernel id via `store`. Absent/ambiguous → raise an **OpenQuestion** (provenance); do not invent it.
2. **Open the run** with `evolve_run` (the `evolve` MCP), passing `cell`, `budget`, `seed`. The sandbox-confinement hook is now active.
3. **Sample the archive** (stepping stones / weak ancestors included) and generate variants — generation is behind the MCP; this gesture orchestrates the shape, it does not coin the generator.
4. **Read the fitness** per variant (consumed, never edited): `kernel_red_to_green ⊕ sensors_computational ⊕ out_of_sample`. Out-of-sample via `backtest_out_of_sample` (the `backtester` MCP) — never in-sample (§87).
5. **Emit** only branches/reports/ideas (under `can_write`). Keep one élite per niche (S26 shape).
6. **Propose promotion** of a gate-passing variant with `evolve_propose_promotion` — `mirror_green ∧ out_of_sample_green ∧ authority_approval`. It records a **proposal**; the freeze is the human `/goal`.
7. Confirm via the `/evolution-sandbox` route: the quarantine write ledger, the niche grid, the three-pill gate.

## Stop conditions

- Every emitted write path is under `can_write` (`/branches/evolution`, `/reports`, `/ideas/proposed`); the loop wrote **no** kernel/mirror/authority/fitness.
- A promotion is produced **only** when `mirror_green ∧ out_of_sample_green ∧ authority_approval`; a red-mirror variant is not promoted whatever its score (the Judge is the deterministic mirror, never an LLM scoring its own copy).
- The run is deterministic for `(cell, budget, seed)`; no niche/fitness/approval invented.
- No monster: every promotion traces to a real variant + gate evidence.

## Failure modes

- **Loop writes the kernel** → blocked by the confinement hook with `SANDBOX_WRITE_ESCAPES_ZONE`; confine to `can_write` and open a `/goal` to promote.
- **Promoting on score, not mirror** → forbidden (anti-Goodhart, §64). The binary gate is the mirror; the score only ranks within a niche.
- **In-sample fitness** → an in-sample Sharpe ≈ no predictive power (§87). Promotion needs **out-of-sample** green.
- **Loop edits its own fitness** → the one real danger of a self-improving system (§62). The fitness is held above the line, never editable by the loop.
- **CellVitality as a promotion fitness** → §66.2: vitality is diagnostic, it never validates a variant.
- **Non-determinism** (`now`/RNG from ambient) → pass seed/budget/now in; otherwise the run is not replayable.

## Related hooks

- **sandbox-confinement** (Go binary / wired into `PreToolUse`) — while an `/evolve` run is open, refuses any write outside `can_write` with `SANDBOX_WRITE_ESCAPES_ZONE`, and any attempt to write a truth/approval/right with `SANDBOX_CANNOT_GOVERN`. Ships with a fault-injection test (an active run writing `/kernel`/`/fitness` must go red).
- `Stop` (completeness) — blocks finish if a promotion is claimed without the gate, or a sandbox zone/gate branch lacks its mirror.

## Related MCP tools

- `evolve` — `evolve_run` (run the ② loop in the sandbox), `evolve_propose_promotion` (gated proposal, never the freeze), `evolve_run_get`, `evolve_run_list`. Carries the `aidos` CLI write-grant on `ideas`/`dag`; cannot write kernel/mirrors/authority/fitness.
- `backtester` — `backtest_out_of_sample` (out-of-sample-only evidence the gate consumes), `backtest_get`. Read/evaluate only — it returns a fitness reading, it never defines or edits the fitness.
- `store` — read the kernel AST to confirm the cell being evolved.

## Workbench visualization

`front/web/app/evolution-sandbox/` → `/evolution-sandbox` — the quarantine write ledger (allowed `can_write` writes green; an escaping `/kernel` write red with its `BlockReason` + `how_to_fix`), the MAP-Elites niche grid (one élite per niche), and the three-pill promotion gate (`mirror_green` / `out_of_sample_green` / `authority_approval`) labelled "PROPOSAL — promotion to truth needs /goal". Add/extend `tests/e2e/evolution-sandbox.spec.ts`; never touch existing routes.

## Honesty rules

Never invent a `target`, `targetId`, business-rule, fitness, or niche-descriptor. The sandbox zones are **exactly** `can_write {/branches/evolution, /reports, /ideas/proposed}` / `cannot_write {/kernel, /mirrors/above, /authority, /fitness}` and the promotion gate is **exactly** `{mirror_green, out_of_sample_green, authority_approval}` (KRD §66.1) — do not coin a fourth zone or gate condition. If a BlockReason code, the QD niche/élite shape, the consumed fitness reading, or the run-active signal is unknown, do not guess — record an **OpenQuestion** (provenance) and stop on that branch. The Judge is the deterministic mirror, never an LLM (nor CellVitality) scoring its own copy; out-of-sample, never in-sample. `/evolve` **proposes**, it never governs.
