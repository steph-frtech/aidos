---
name: self-test
description: Run the AIDOS harness meta-meta self-test now (the same routine the SessionStart hook runs) — a deterministic fault-injection proving the three inviolable NIVEAU 3 guarantees: every sensor still fires, the wall still holds, and the fitness is unchanged. Use when someone says "run the self-test", "is the harness still sound", "prove the guardrails are alive", "did a loop edit its own fitness", or before trusting a session whose guardrails may have drifted.
allowed-tools: Read, Bash, Grep, Glob
---

# self-test

## Purpose

Replay the **meta-meta self-test** (KRD LIVRE XIII §70) on demand — the same routine the
`SessionStart` hook (`back/hooks/sessionstart`, the `harness-self-test` binary) runs at
every session start. It is a **deterministic fault injection** proving the three
**inviolable** guarantees of NIVEAU 3:

1. **Every sensor still fires.** Break a known-green watched check → assert the detector
   goes red (the *mirror of the mirrors*, KRD §60 « est-ce que ce détecteur détecte ? »),
   then roll back. A sensor that stays green on injected breakage is **dead** — a removed
   guardrail.
2. **The wall still holds.** Attempt an agent-role write above the line on **kernel ·
   mirrors · fitness** → assert each is **refused** (permission denied / a `BlockReason`).
3. **The fitness is unchanged.** Recompute `Hash(Canonicalize(fitness rows))` (S02, never
   forked) → assert it equals the **graven baseline**. A loop that edited its own fitness
   reddens here — the cardinal sin.

The **méta loop may ADD a guardrail, NEVER REMOVE one** (CLAUDE.md §5; KRD §70): a
missing/muted sensor, a breached wall, or a mutated fitness is a **red self-test**. The
self-test is **read-only** on the fitness it checks (the checker cannot touch what it
checks). There is **no level 4** — the regress stops at deterministic fault injection,
never another LLM judge.

## When to use

- "Run the self-test" / "prove the guardrails are still alive" / "is the harness sound?"
- Before trusting a session whose sensors, wall GRANTs, or fitness baseline may have drifted.
- After a suspicious ChangeSet that *might* have touched the fitness schema.
- To reproduce a red `SessionStart` block and read its `BlockReason`.

## Inputs

- The wired truth-store (`DATABASE_URL`) with the `kernel` / `mirrors` / `fitness` +
  `runtime` schemas (S02 + S04 + S07 + S39 baselines applied).
- The **pinned fitness baseline** (`SELF_TEST_FITNESS_BASELINE` = `Hash(Canonicalize(fitness rows))`).
  **Never guess it** — if it is not pinned, that is an OpenQuestion (`provenance`), not a fabricated hash.
- The S07 sensor inventory (`selftest.CanonicalSensorInventory()`) and its fired-detection surface.

## Outputs

- A `SelfTestReport` (`sensors_checked[]`, `wall_probe`, `fitness_probe`, `verdict`, `at`)
  appended append-only to `runtime.self_test_runs` (via the **`aidos` writer role** — the
  agent has SELECT only).
- On any violated guarantee: a non-zero exit + an actionable **`BlockReason`**
  (`MUTED_SENSOR` / `WALL_BREACHED` / `FITNESS_MUTATED`, each with a non-empty `how_to_fix`).

## BDD / mirror required before use

- Fixture: `tests/runtime/harness_self_test.fixture.md` →
  `back/hooks/sessionstart/selftest/selftest_fixture_test.go`.
- Property (∀): `selftest/selftest_property_test.go`.
- Testcontainers (GRANT proof + ledger round-trip): `selftest/selftest_ledger_roundtrip_test.go`.

## Steps

1. Inject the known fault into **each** sensor of the inventory → assert it fires → roll back.
2. Attempt the agent-role write on **kernel, mirrors AND fitness** → assert each is refused.
3. Recompute the fitness content-hash → assert it equals the baseline.
4. Compute the verdict: **green** iff every sensor fired ∧ every above-the-line write was
   refused ∧ the fitness is unchanged; else **red** with the precise `BlockReason`.
5. Record the run via the writer role; surface it on the `/meta` Workbench panel.

Run it:

```bash
go test ./hooks/sessionstart/...          # the mirrors (fixture + property + Testcontainers)
DATABASE_URL=... SELF_TEST_FITNESS_BASELINE=... \
  go run ./hooks/sessionstart                # the live self-test (prints a BlockReason + exits 2 on red)
```

## Stop conditions

- **Green** → the session may start; the three guarantees hold.
- **Red** → block the session; emit the `BlockReason` and walk its `how_to_fix`.

## Failure modes (honesty rules)

- **Never invent** a sensor id, a fitness row, a baseline hash, or a protected schema
  beyond `kernel` / `mirrors` / `fitness`. Uncertainty → an **OpenQuestion** in `provenance`,
  never a guess.
- **Never author the fitness** it asserts unchanged, and **never re-implement** the sensors
  or the wall it probes (the wall §2; KRD §70). This step PROVES they hold.
- A self-test that cannot prove a guarantee **fails closed** (block) — an unverifiable
  guarantee is a failure made explicit (KRD §82 `.passthrough()`), never a silent pass.

## Related hooks

- `back/hooks/sessionstart` — the `harness-self-test` binary (this skill's live form).
- S04 `back/hooks/pretooluse` (the wall) and S07 `back/hooks/posttooluse` (the sensors) —
  PROBED here, never re-implemented.

## Related MCP tools

- **None** — `Run` is a pure library and `/self-test` is a harness gesture. If a callable
  `self_test_run` op truly emerges, record an OpenQuestion (do not build a new MCP here).

## Workbench visualization

- `/meta` (`front/web/app/meta`) — the latest run as the three guarantees (sensors fired
  N/N + per-sensor fault-injection, wall refused on kernel · mirrors · fitness, fitness
  baseline-vs-current hash) + the **read-only** fitness baseline + the append-only history.
