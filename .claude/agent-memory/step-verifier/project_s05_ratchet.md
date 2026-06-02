---
name: s05-ratchet
description: S05 the cliquet (ratchet) — pure Regressed/Decide core + I/O shell over runtime.mirror_runs (append-only, below waterline); action-capable /mirrors; verified-green
metadata:
  type: project
---

S05 makes the cliquet (KRD iteration 3) mechanical: replay every living mirror, compare to recorded baseline, REJECT a merge the moment a baseline-green mirror is red on the candidate.

- **Pure core** `back/mcp/mirror-runner/regression.go`: `Regressed(baseline,candidate)` → green-at-base ∧ red-on-cand ∧ present-in-both (sorted by id, total); `Verdict`/`Decide` → ALLOWED/REJECTED + RED_REGRESSION BlockReason. Determinism-first reproducibility + soundness in `regression_property_test.go` (rapid).
- **I/O shell** `runner.go`: `Ratchet.Check` iterates ALL LivingMirrors, replays via `Replayer` seam, records each run append-only via `RunLog`, decides with the pure core. `BaselineReplayer` = S05 production seam (verdict = last recorded status; fresh=green). Real dispatch-by-test_kind to Godog/rapid/fixture interp is **S06+** (typed mirror records) — by-design OpenQuestion.
- **Migration** `mirror_runs_baseline.sql`: `runtime.mirror_runs` append-only + content-addressed; agent role INSERT+SELECT only, REVOKE UPDATE/DELETE/TRUNCATE; CHECK pins `regressed = (baseline=green AND status=red)`. `runtime` schema is BELOW the waterline → agent may write its own run-log without breaching the wall.
- **Hook** `back/hooks/ci-ratchet/ratchet.go`: pre-merge gate, exit 0 ALLOWED / 2 REJECTED, fail-closed on garbage; fault-injection meta-test fires (reddens a green mirror → exit 2).
- **DB proof** `mirror_runs_db_test.go` (Testcontainers): append-only denied UPDATE/DELETE/TRUNCATE for agent; wall holds (agent denied INSERT into mirrors.mirror); CHECK rejects dishonest regressed=true.
- **UI** `/mirrors` action-capable: two controls (run-all-green / run-reddened) → `runRatchet` Server Action → pure TS port `lib/mirrors.ts` (mirrors Go core). Writes only run-log, no truth from screen. e2e `mirrors-ratchet.spec.ts` 4/4.

Verified green: gofmt/vet/build clean; `go test ./mcp/mirror-runner/ ./hooks/ci-ratchet/` ok 10.9s; vitest 6/6; tsc clean; biome clean; e2e 4/4 (target :3100, see [[playwright-port-targeting]]); prior green (kernel/archive/pretooluse + S04 wall e2e 6/6) intact; mint validate ok, docs pushed b152463; Linear AID-37 Done. Same verified-green pattern as [[project_s04_wall]].
