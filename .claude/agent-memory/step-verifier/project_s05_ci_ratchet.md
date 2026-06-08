---
name: project-s05-ci-ratchet
description: S05 verification — the cliquet (ratchet) pre-merge gate; verified-green, zero corrections
metadata:
  type: project
---

S05 = the cliquet (ratchet): replay every living mirror, reject merge the moment a baseline-green mirror reddens (RED_REGRESSION).

**Why:** KRD iteration 3 — make the cliquet mechanical, caught BEFORE merge not after.

**How to apply:** when re-verifying S05 or steps that consume the run-log, this is the shape to expect.

- PURE CORE back/mcp/mirror-runner/regression.go: Regressed (green→red only, sorted by id, mirror-absent-from-candidate NOT regression, already-red NOT regression, newly-added NOT regression) + Verdict (ALLOWED iff empty else REJECTED+RED_REGRESSION BlockReason) + Decide. No clock/rng/IO. Reproducibility mirror regression_property_test.go (TestRegressedIsDeterministic/IffGreenThenRed/IsSorted/VerdictTotality).
- I/O SHELL runner.go: Ratchet.Check wires MirrorSource (PgMirrorSource reads mirrors.mirror SELECT-only, content-hashes body) + Replayer seam (BaselineReplayer = honest S05 seam, typed test_kind dispatch deferred to S06 OQ) + RunLog (PgRunLog INSERT+SELECT runtime.mirror_runs). RunID supplied by caller (caller owns identity, no clock inside).
- HOOK back/hooks/ci-ratchet/ratchet.go: fail-closed (undecodable event → REJECTED exit 2). exit 0 allow / exit 2 deny. TestHookFaultInjectionRedRegressionFires = the §5 hook-honesty meta-test; TestHookFailsClosedOnGarbage; AlreadyRedNotRegression; AllowsAllGreen.
- MIGRATION mirror_runs_baseline.sql: runtime schema BELOW waterline (run-log NOT truth, agent may write own log without breaching wall). Append-only content-addressed; CHECK regressed=(baseline=green AND status=red); GRANT INSERT+SELECT, REVOKE UPDATE/DELETE/TRUNCATE from aidos_agent; ALTER DEFAULT PRIVILEGES append-only. TestPgRunLogRoundTrip/MirrorRunsAppendOnlyForAgent/WallHoldsForRunner/RegressedCheckConstraint (Testcontainers pg16, fresh 10.5s GREEN).
- BDD tests/runtime/ci-ratchet.feature 3 scenarios (reddened→REJECTED, all-green→ALLOWED, already-red→not-regression) via TestRatchetBDD.
- FRONT lib/mirrors.ts byte-faithful PURE port of Go core (regressed/computeRatchet/blockReasonFor) + declared demo inventory S01..S05; vitest 6/6. actions.ts runRatchet Server Action runs pure core + revalidatePath only (writes no truth; canonical door = mirror-runner MCP, gateway reconcile S36 OQ). /mirrors RatchetRunner.tsx 2 executable controls (run-all-green/run-reddened) → ui-completeness; e2e mirrors-ratchet.spec.ts 4 specs.
- Sensors: gofmt/vet/go build ./... clean; tsc clean; biome clean 5 files; i18n 3441==3441 mirrors keys match fr/en; nav WorkbenchHeader:93.
- Docs: concept+internals (3 layers Implémentation/Méta/Méta-méta) docs.json:77-78. mint already validated/pushed prior session.
- All S05 paths committed clean on build/s00-s47 (shipped prior session obs 947, 2026-05-31). Verified against done-criteria, not redone.
- OQ (by-design fwd-deps, NOT residual): S06 mirrors schema back-fills typed test_kind replay dispatch; S36 gateway reconciles Server Action→MCP; Linear MCP unauthenticated (needs OAuth+restart).

verified-green ZERO corrections.
