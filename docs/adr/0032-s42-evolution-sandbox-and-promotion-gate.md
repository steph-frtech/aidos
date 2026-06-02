# ADR 0032 — S42 EvolutionSandbox: the medium-loop quarantine + the promotion gate

- Status: Accepted
- Date: 2026-06-01
- Step: S42 (AIDOS Runtime — `back/runtime/evolve`)
- Linear: AID-22 (`S42 · Evolution sandbox`)

## Context

KRD §66.1 declares the **EvolutionSandbox**: every `/evolve` medium-loop run (the
self-play + QD loop, §62 algorithm ②, §64, §66) must execute in a **quarantine**.
"L'évolution explore, elle ne gouverne pas." The loop may produce candidates,
branches, scores, hypotheses, suggestions — and it may never produce truths,
approvals, exceptions, or rights. §62's own insight names the single real danger of a
self-improving system: *it grades its own copy into the kernel*. The defence is a
typed, non-bypassable sandbox over the loop, plus a promotion gate whose Judge is the
**deterministic mirror, never an LLM scoring its own copy** (§66), anchored
**out-of-sample, never in-sample** (§87 — in-sample Sharpe ≈ no predictive power; the
market is adversarial / non-stationary).

The decisions needing a record: (1) the promotion-proposal shape, (2) the
out-of-sample evidence contract the backtester returns, (3) how the
sandbox-confinement hook learns a run is active, and (4) the two new `BlockReason`
codes.

## Decision

1. **The EvolutionSandbox AST is declared verbatim from §66.1, never learned.**
   `can_write = {/branches/evolution, /reports, /ideas/proposed}`;
   `cannot_write = {/kernel, /mirrors/above, /authority, /fitness}`;
   `promotion.requires = {mirror_green, out_of_sample_green, authority_approval}`. No
   fourth zone, no fourth gate condition (the honesty rule). The §66.1 `cannot_write`
   set **is** the §2 wall — same wall, one place.

2. **Three pure functions, no I/O.** `Confine(write{path}) → Allowed | Refused`,
   `Promote(variant, evidence) → Promoted(proposal) | Refused`, and
   `Evolve(cell, budget, seed, sampler) → EvolutionRun`. All total/deterministic; any
   seed/budget/now is passed in (replayable). `Confine` is an **allow-list** (fail
   closed): a path outside `can_write` is refused, not just the four `cannot_write`
   zones. The package writes nothing (the wall).

3. **The promotion-proposal shape.** `Promote` on a passed gate yields a
   `PromotionProposal{variant_id, niche, evidence, proposal:true, writes_truth:false,
   requires_goal}` — explicitly a *proposal* a later human `/goal` freezes; it never
   itself writes kernel/mirror/authority/fitness. The gate is **binary**: a red-mirror
   variant is refused whatever its fitness (the anti-Goodhart anchor); the fitness
   reading only orders within a niche, it never overrides the gate.

4. **The backtester returns a reading, never the fitness.** `back/mcp/backtester`
   evaluates **out-of-sample only** (an `in_sample:true` request is refused) and
   returns green/red against a declared bar. It is read/evaluate — it does not define
   or edit the fitness (the metre-stick stays above the line, §8/§87).

5. **The sandbox-confinement hook reads an injected `run_active` signal.** The
   `back/hooks/sandbox-confinement` binary defers to `evolve.Confine` and blocks
   escaping writes while a run is active; a direct truth/approval/right write is
   blocked with `SANDBOX_CANNOT_GOVERN`. The hook never reaches into kernel/mirrors
   (the agent has no grant); the signal is fed by the harness / the evolve MCP. It
   fails closed on a malformed event. It ships a fault-injection test (an active run
   writing `/kernel` and `/fitness` → red).

6. **Two new BlockReason codes, additively.** `SANDBOX_WRITE_ESCAPES_ZONE` (an
   escaping write) and `SANDBOX_CANNOT_GOVERN` (a direct truth write). Both are
   additive extensions of the closed `blockreason.Code` enum (the same pattern S28/S37
   used) — `change_type: refine`, never a removal; recorded by this ADR.

## Consequences

- `/evolve` is now a typed, non-bypassable quarantine over the medium loop: writing
  `/kernel` (and `/fitness`/`/authority`/`/mirrors/above`) from a run is forbidden, a
  candidate branch under `/branches/evolution` is allowed, and a variant is promotable
  only with `mirror_green ∧ out_of_sample_green ∧ authority_approval` — proven by the
  Godog journey, the fixture, the rapid property, and the hook's fault-injection test.
- **Consumed, not redefined:** the QD niche/élite shape (S26 `archive/qd`), the
  anchored fitness reading, the S13 `BlockReason` shape, the `ideas`/`dag`/`changesets`
  schemas. No new Postgres schema. No codegen.
- **Out of scope (separate gestures):** the `/goal` freeze that promotes a candidate
  to a frozen, mirrored, authority-approved truth; the real self-play/AlphaEvolve
  generator and the real out-of-sample backtest (behind the MCP capabilities);
  CellVitality as a promotion fitness (§66.2 is diagnostic only).

## Alternatives considered

- **A deny-list `Confine` (refuse only the four `cannot_write` zones).** Rejected: a
  path outside both sets would slip out of quarantine. An allow-list fails closed.
- **`Promote` writes the niche élite directly.** Rejected: that is governing. The
  sandbox stops at a proposal; the human `/goal` freezes (KRD §118/§132).
- **A new `evolution` Postgres schema.** Rejected (out of slot): branches live in
  `dag`/`changesets`, ideas in `ideas`, reports as ledger rows — reused, never forked.
