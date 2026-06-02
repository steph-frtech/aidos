---
name: s47-adoption-release
description: S47 AdoptionStage ladder T0→T4 (pure Plan, monotone) + Release v0 Assemble (content-addressed inventory); read-only projection, verified-green
metadata:
  type: project
---

S47 — AdoptionStage ladder + Release v0 pack. Verified green.

**What it is:** pure `back/runtime/adoption.Plan(capabilities)→AdoptionPlan` — 5 declared tiers T0..T4 (KRD §82.5, reused), monotone ladder (current = contiguous satisfied floor, next = smallest unsatisfied tier whose lowers all satisfied). Three load-bearing gating facts: T1.requires ↛ QualityDiversity (§82.6 advanced), T2 requires reality_mirror_live (Livre XX), T4 requires evolution_sandbox (§66.1). Plus `release.Assemble(view,caps,now)→ReleasePack` — inventories 7 fields (cli/routes/demo/docs/mirrors/changelog/limits) from a read-only View, content-addressed id=Hash(Canonicalize(body)) reusing S01/S02, assembled_at excluded from hash; empty view ⇒ empty-but-valid pack.

**Wall:** `fitness.release_pack` migration append-only, content-addressed, body-shape CHECK; agent SELECT-only, aidos writer SELECT+INSERT (no UPDATE/DELETE). Testcontainers 3/3 (real PG ~7s).

**Determinism-first:** Go pure core + TS twin (lib/adoption.ts) + repro mirrors (Plan/Assemble deterministic, now passed in). fast-check 10/10.

**ui-completeness vacuous on write-path:** /adoption is a read-only projection — assembling/computing writes no truth; the only control is scenario-select (bound + e2e-proven). Recording a pack = aidos writer via ChangeSet S20 = forward-dep OQ-S47-ui-live, NOT residual. Correct read-only pattern.

**Sensors:** go vet/build clean, tsc --noEmit exit 0, vitest 10/10, e2e 7/7. Docs both pages + 3 layers, docs.json registered, mint validate clean, pushed steph-frtech/docs main 3ce0b14.

**Gotcha hit:** stale dev server on :3100 (started before /adoption existed) 404'd the route → all 7 e2e failed at beforeEach. Fresh server on :3200 (PLAYWRIGHT_WEB_PORT=3200, Playwright's own webServer) ⇒ 7/7 pass. Reconfirms [[project_playwright_port_targeting]]: never trust a long-lived dev server for a brand-new route; spin a fresh one.

OQ: Linear S47 issue not flippable (linear-server MCP unauthenticated) — OpenQuestion per rule, does not fail the step.
