# ADR 0029 — S39 meta-meta self-test: a SessionStart fault-injection over the three inviolable guarantees

- Status: accepted
- Date: 2026-06-01
- Step: S39 (Runtime — Méta-méta / fitness, read-only)
- Linear: AID-54

## Context

KRD LIVRE XIII §70 makes NIVEAU 3 — the **fitness** (definition of "passed") + the layer
grammar + the waterline — **inviolable**: owned only by the human + reality, **no loop
edits its own fitness**, and there is **no level 4**. §71 wires `SessionStart: [
"harness-self-test" ]`. The regress stops because the floor is **deterministic
fault-injection** (KRD §60 « le miroir du miroir, c'est est-ce que ce détecteur
détecte ? »), not another LLM judge.

S39 must deliver: the SessionStart hook + a pure self-test runner that PROVES three
guarantees — every sensor still fires, the wall still holds, the fitness is unchanged —
without authoring the fitness (S04 created the `fitness` schema, SELECT-only to the
agent), without a new sensor (S07), and without a new wall (S04).

## Decisions

1. **`Run(harness, at)` is a pure function behind a `Harness` port.** The three faculties
   (`ProbeSensor`, `ProbeWall`, `FitnessRows`/`BaselineHash`) are injected so the mirrors
   drive deterministic in-process fault adapters while the production `PgHarness` PROBES
   the real S04 wall (a low-grant `aidos_agent` pgx connection attempting a rolled-back
   write above the line) and reads the real `fitness` rows (SELECT-only). `at` is passed
   in — never `time.Now()` inside — so `Run(h,t) == Run(h,t)` (determinism-first).

2. **Reuse S02 `Canonicalize`/`Hash` for the fitness content-hash; never fork it.** The
   fitness probe is `records.Hash(records.Canonicalize(rows)) == baseline`.

3. **Local BlockReason codes, NOT an in-place extension of S13's closed enum.** The three
   codes `MUTED_SENSOR` / `WALL_BREACHED` / `FITNESS_MUTATED` reuse the S13
   `blockreason.BlockReason` *shape* (code, severity, explanation, how_to_fix[]) but are
   declared locally in `selftest` — the established hook precedent (pretooluse,
   posttooluse, ci-ratchet each declare their hook codes locally). Extending S13's CLOSED
   `Code` enum would be an in-place edit of a prior contract (§9), which requires a
   ChangeSet + SemanticDiff; the self-test does not need S13's enum, only its shape.

4. **Fail closed.** A self-test that cannot prove a guarantee (no DB wiring, no pinned
   baseline) blocks the session — an unverifiable guarantee is a failure made explicit
   (KRD §82 `.passthrough()`), never a silent pass. The baseline is **never guessed**
   (`SELF_TEST_FITNESS_BASELINE`, else an OpenQuestion), honoring CLAUDE.md honesty.

5. **The ledger is written by the privileged `aidos` writer role, agent SELECT-only.**
   `runtime.self_test_runs` is a below-the-line audit log; the meta-meta history is
   authoritative, so the agent reads it but never appends (the wall posture is
   asymmetric on purpose).

## Consequences

- The hook's own meaning IS fault-injection (§5 hook-honesty satisfied without a separate
  "does the self-test detect?" regress — the floor is deterministic mutation).
- No new MCP (`Run` is a pure library, `/self-test` is a harness gesture). No new sensor /
  no new wall. No CellVitality / promotion fitness. No level-4 governor.
- `Verdict` is `green | red` (DB CHECK + the rapid invariant pin the two-verdict set).

## OpenQuestions

- **OQ-S39-sensorprobe** — the live wiring of the S07 fired-detection surface into
  `PgHarness.SensorProber` (the mirrors drive in-process fault adapters; the live PostToolUse
  reddening is deferred). By-design forward-dependency, not a residual issue.
- **OQ-S39-ui-live** — `/meta` reads seeded scenarios + run history until the live
  `runtime.self_test_runs` + `fitness` SELECT wiring lands (same pattern as /sensors OQ-S07-3).
