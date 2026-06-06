---
name: ce01-compound-spike
description: CE01 is the first COMPOUND-track spike (KRD §84) — verify spike-criteria + the bonus Workbench surface; deterministic effort-delta measure, verdict GO computed.
metadata:
  type: project
---

CE01 = first COMPOUND track spike. Confined Go module `aidos.spike/compound` at /data/dev/aidos/spike/compound/ (imports only stdlib, never back/ — go.mod = `module aidos.spike/compound`). Models a goal as ordered work-units with token costs; Capture() extracts the shareable motif (pure fn); MeasureDelta/CostOf/Decide compute the effort delta WITH vs WITHOUT capturing goal-1's pattern. Verdict GO: similar pair order→invoice 7800→1940 = 75.1% reduction (≥ declared 25% floor); dissimilar control order→migration 16.6% (≤ 20% false-positive ceiling); reproducible. NO-LLM, pure functions.

**Why:** spike rules differ from normal steps ([[hr01-spike-headroom]]).
**How to apply:** for a /spike step verify spike-criteria not normal gates — (1) writes confined to /spike/ only (wall: zero kernel/mirrors/fitness; the untracked `??` GV-step .md/dirs in git status are NOT CE01 — grep status for kernel|mirrors|fitness|migrations to confirm), (2) deterministic measure = pure code + a reproducibility mirror (TestReproducible 100× in Go, fast-check/`===` repro in TS twin) — [[project_determinism_repro_mirror]], (3) go/no-go COMPUTED not declared (clearsFloor ∧ noFalsePositive ∧ reproducible), with a DISSIMILAR control as honesty/false-positive guard (the model must NOT fabricate reuse on an unrelated goal), (4) OpenQuestions for fwd-deps (OQ-CE01-1 token estimates calibrate at CE02+; CE03 persists procedural via firewall.ViaIdea; similarity→real router CE05), (5) two Mintlify « Pour moi » pages (concept + internals w/ 3 layers Implémentation·Méta·Méta-méta) shipped & pushed (commit a25438d on steph-frtech/docs).

UNLIKE HR01, the executor ALSO shipped a bonus action-capable Workbench /compound route + TS twin (lib/compound.ts, byte-faithful to Go) + e2e — all green. tsc clean, vitest 6/6, biome clean on 4 files, e2e 1/1 on :3000 (200; :3100 dead). gofmt -l on the spike dir = CLEAN this time (the struct-alignment scar from HR01/BA20/BA16 did NOT recur). Numbers on screen (7800/1940/75.1%/16.6%) match the Go probe exactly. Observation 4062: vitest CAUGHT a TS twin off-by-one (m.size 6→7) during exec, fixed before report.

Linear MCP unauthenticated (only authenticate/complete_authentication exposed) — OQ-CE01-5, never a step-failure. Verified-green.
