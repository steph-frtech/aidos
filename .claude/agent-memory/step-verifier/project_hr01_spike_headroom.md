---
name: hr01-spike-headroom
description: HR01 is a SPIKE step (KRD §84) — verify spike-criteria not normal-step gates; no Workbench route/e2e/Postgres-mirror required for throwaway code.
metadata:
  type: project
---

HR01 = first HEADROOM-track spike. Confined Go module `aidos.spike/headroom` at /data/dev/aidos/spike/headroom/ (imports only stdlib, never back/). Deterministic model of headroom retrieve∘compress on AIDOS prompts; verdict GO (large_session lossless 84.1% ≥ ReductionFloor 0.15, carriers preserved).

**Why:** spike rules differ from normal KRD steps.
**How to apply:** for a /spike step do NOT demand a permanent Workbench route, a Playwright e2e, or a Postgres-persisted mirror — the SKILL spike forbids permanent artifacts for throwaway code (ratchet OFF, T0). The action-capable surface is the executable verdict (`go run ./cmd/verdict`) + `go test`. Verify instead: (1) writes confined to /spike/ only (wall: zero kernel/mirrors/fitness), (2) deterministic measurement = pure code, no LLM in the probe, with a reproducibility mirror (TestReproducible 100×) — [[project_determinism_repro_mirror]], (3) go/no-go COMPUTED not declared, (4) OpenQuestions recorded for unresolved gaps, (5) the two Mintlify « Pour moi » pages (concept+internals w/ 3 layers) shipped & pushed. Spike dir shows as untracked `??` in the aidos repo (not gitignored, just uncommitted) — that's normal for throwaway code.

The gofmt struct-alignment slip (see [[ba20-scheduler]], [[ba16-postcheck]]) recurred again here (measure.go Verdict struct) — executor reported "go test vert" but gofmt -l flagged it. ALWAYS run `gofmt -l` on the changed Go dir even for spikes; go test/vet do NOT catch alignment.

Linear MCP unauthenticated (OAuth needed) — recorded as OpenQuestion, never a step-failure.
