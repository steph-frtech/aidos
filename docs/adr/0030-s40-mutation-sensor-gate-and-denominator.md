# ADR 0030 — S40 mutation-testing sensor: the gate, the score denominator, and the local block codes

- Status: accepted
- Date: 2026-06-01
- Step: S40 (Mirror — Mutation testing; the threshold gates the stable phase)
- Linear: AID-9

## Context

KRD §19 (the three timing drawers), §43/§59.8 ("Serrage"), §64/§1485/§1767/§2274 (the
non-gameable Stop), §66.2/§1831/§1893 (the fitness is read-only, the agent never authors
its own bar). Mutation testing is the *densimètre* of kernel tightness: a noyau trop
maigre lets behaviour leak through the holes ("les tests passent mais le système se
dégrade", §188). S40 lands a Go adapter over the FROZEN runners (gremlins for Go,
StrykerJS for the front — CLAUDE.md §3 mutation-testing slot, `replaceable`), computes a
mutation score, and gates the stable phase against a DECLARED threshold read SELECT-only
from the `fitness` schema.

The stack slot is frozen-but-replaceable, and the runners are mandated (gremlins, Stryker).
No real tool *substitution* was made — so this ADR records only the genuine choices the
spec flagged as "do not silently pick one": the score denominator, the threshold read
shape, and the block-code home.

## Decisions

1. **Score denominator = `killed / (total − not_covered)`** (uncovered mutants EXCLUDED).
   A timeout counts as a kill (`numerator = killed + timed_out`), matching both gremlins
   and Stryker. `not_covered` is excluded from BOTH numerator and denominator, so an
   uncovered file neither helps nor hurts the score — the score measures *the tightness of
   the covered surface*, not coverage (coverage is a different meter). When the
   denominator is 0 (no coverable mutant) the score is UNDEFINED and the gate BLOCKS with
   `UNPARSABLE_REPORT` — never a silent 1.0 (KRD §82 anti-passthrough, §1831 "une fitness
   function buggée passe tout").

2. **`Gate(report, threshold *float64)` is pure, total, deterministic.** `threshold` is an
   INPUT read SELECT-only from `fitness` — never a literal in the package (§8
   anti-Goodhart: the agent must not author the bar it is graded against). It is a
   `*float64` so an ABSENT bar (`nil` ⇒ `MISSING_THRESHOLD`) is distinct from a declared
   `0.0` bar. `score ≥ threshold ⇒ pass`, else `block`; a malformed bar (outside `[0,1]`
   or NaN) ⇒ `UNPARSABLE_REPORT`. The rapid property pins determinism, `pass ⇔ score ≥
   threshold` (no third verdict), monotonicity (killing more never turns pass→block),
   `score ∈ [0,1]`, and "parsing never panics".

3. **Local BlockReason codes, NOT an in-place extension of S13's closed enum.** The two
   codes `MISSING_THRESHOLD` / `UNPARSABLE_REPORT` reuse the S13
   `blockreason.BlockReason` *shape* (code, severity, explanation, how_to_fix[]) but are
   declared locally in the `mutation` package — the established precedent (ADR 0029 §3:
   pretooluse / posttooluse / sessionstart each declare their own codes locally).
   Extending S13's CLOSED `Code` enum in place would edit a prior contract (CLAUDE.md §9)
   for codes S13 does not need. Every code carries a non-empty `how_to_fix` (a wall without
   a door is a prison — KRD §44.5).

4. **The `mutation ≥ seuil` conjunct is ALREADY wired into the Stop predicate (S29) —
   S40 FEEDS it, it does not re-wire it.** `runtime/goal.IsClosed` condition (3) is
   `if Mutation < MutationFloor { return false }`, and `back/hooks/goal-check` already
   reads `Mutation`/`MutationFloor` from its injected event. So S40 needs NO ChangeSet on
   the Stop hook and NO second Stop hook (CLAUDE.md §5 meta-loop: ADD, never duplicate).
   S40's contribution is the *densimètre that produces the live score* that conjunct
   reads. A fixture (`stop_conjunct_test.go`) consumes the `goal` contract READ-ONLY and
   proves: score 0.40 < floor 0.80 ⇒ Stop not satisfied; score 0.80 ⇒ satisfiable.

5. **The threshold lives in `fitness` as a content-addressed, head-mutable row**
   (`fitness.mutation_threshold`, body JSONB mapping scope → bar, mirroring
   `fitness.waterline`'s shape). The agent reads it SELECT-only; the `aidos` writer role
   engraves it via an approved ChangeSet. S40's migration adds **no** `fitness` row and
   **no** `fitness` write GRANT — the bar is engraved above the line, OUT of this step's
   reach (see OpenQuestions).

6. **`runtime.mutation_runs` (+ child `runtime.surviving_mutants`) is below the waterline,
   append-only, content-addressed.** The agent role holds INSERT+SELECT (S05 default
   privileges on the `runtime` schema), NEVER UPDATE/DELETE/TRUNCATE. The expand-only
   migration alters no prior table or GRANT.

7. **Mutation is the PIPELINE drawer (KRD §19), not the per-diff S07 drawer.** It is an
   on-demand callable op (the `mutation-runner` MCP `run_mutation` / `read_threshold`
   tools), run PERIODICALLY (serrage) — never a PostToolUse per-diff sensor. The runner's
   `Run` subprocess seam is the only impure surface; `Parse` is pure and unit-tested
   against real gremlins/Stryker JSON shapes (so the gate is provable without the tools
   installed).

## Consequences

- The densimètre gates the stable phase against the DECLARED bar: 0.40 → BLOCK, 0.80 →
  PASS at the 0.80 example bar (the S40 done criterion), with the surviving mutants carried
  into the result and the `mutation_runs` row.
- The agent cannot game the bar: a missing threshold blocks, an unparsable/empty report
  blocks, and the bar itself is read-only above the line.

## OpenQuestions

- **OQ-S40-1 — the `fitness.mutation_threshold` row is not engraved yet.** This step
  cannot write `fitness` (the wall). The `PgxThresholdReader` reads the
  `fitness.mutation_threshold` head row; until a human/`aidos` ChangeSet engraves it, the
  gate blocks with `MISSING_THRESHOLD` in a real deployment (the mock supplies an EXAMPLE
  bar for the Workbench seam). The exact column/JSONB shape is proposed here, to be
  confirmed when the threshold is engraved. By-design forward dependency — does NOT block
  the step.
- **OQ-S40-2 — the real gremlins/Stryker subprocess invocation is deferred.** `Parse` is
  proven against real report JSON; the `Run` subprocess wiring (e.g. `gremlins unleash
  --output …`, `stryker run --reporter json`) is supplied where the tools are installed,
  off the deterministic gate path.
- **OQ-S40-3 — no "plug-the-surviving-mutant" Skill yet** (CLAUDE.md §5: a replayable
  gesture is earned only after a real recurring gap). Recorded; not built.
