---
name: dp07-connresolve
description: DP07 verification record — ResolveConnection(service,env)→Mode closed set, verified green with ZERO corrections; all sensors re-run live by verifier.
metadata:
  type: project
---

# DP07 — connresolve (connection-mode projection) — VERIFIED GREEN, ZERO CORRECTIONS

Commit 0838c6e (pushed, origin in sync). Docs 668509f pushed to steph-frtech/docs main, live 200.

**What it is:** `back/runtime/connresolve` — pure total `ResolveConnection(svc, env) → Resolution{Mode ∈ {docker_internal, traefik_url, managed_url}}` over DP06 envbindings + DP02 stackmanifest closed sets; refusals UNKNOWN_ROLE/UNNAMED_SERVICE package-local + DP06 UNKNOWN_ENVIRONMENT reused. `EmitConnectionsModule` emits the Hono boot-config TS (requireEnv fail-closed, process.env only). TS twin `front/web/lib/connections.ts` byte-parity-pinned GO_MATRIX_HASH eb382dcf… (same literal in rapid mirror, vitest mirror, e2e — both suites green ⇒ cross-language parity proven without separate derivation).

**Verified live by me:** go test -count=1 + whole back green, gofmt/vet clean; vitest 2128/2128; biome clean on all 7 changed front files (re-run — scar respected, did NOT recur: executor pre-suppressed noTemplateCurlyInString with reasons in lib + e2e spec); tsc 0; e2e 40/40 on :3210 in ONE run (connections 4 + v3 16 + environments/stack-manifest/stack-emit/env-emit/stack-bundle 4 each) — prod :3000 untouched; i18n fr==en (40 keys env namespace, 11 new — executor said 12, reused `working`; harmless slip); no Temporal/Coolify/Drizzle in diff (Windmill image in DemoManifest); no untracked binaries; wall clean (pure measures, server action hashes only); mint validate + broken-links clean; both Mintlify pages 200; docs.json 573-574.

**Why:** DP biome scars (noTemplateCurlyInString on literal ${VAR}) now consistently pre-suppressed by executor since DP03 — keep re-checking but 5 consecutive clean.
**How to apply:** for DP UI-matrix steps, running ALL DP e2e specs + v3 in one playwright invocation on :3210 is fast (~1.2m) and covers anti-overwrite in one shot.

OQ (by-design, recurring): Linear MCP unauthenticated (only authenticate tool exposed); validation_humaine still 0 hits in lib/v2/builder.ts (the 2 user reqs still don't exist → non-regression N/A); zero-hardcoded structural ratchet over gen/ = DP08's object; per-env subdomain value materialized at DP04/DP12.
