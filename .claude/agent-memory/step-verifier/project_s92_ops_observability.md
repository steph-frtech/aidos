---
name: project-s92-ops-observability
description: S92 per-app ops-observability engine verification — OTel signals → deterministic dashboard, writes no truth (render layer distinct from E12 RealityMirror)
metadata:
  type: project
---

S92 = per-app OPS OBSERVABILITY engine (EPIC9/E12, ROADMAP §S92, DP17/ADR0043): emitted app instrumented w/ OTel (JS/TS), signals (log|span|error closed set) flow into a PER-APP ops panel. LOAD-BEARING SEPARATION: this is the OPPOSITE direction from E12 RealityMirror — E12 is the only Kernel on-ramp (incident→Idea), S92 is a pure RENDER layer the user reads to operate the app, writes NOTHING.

**Engine** back/runtime/opsobservability: Ingest (PURE fail-closed validation — ErrEmptyProject + ErrUnknownKind closed set, empty log/error sev→info default never guess-higher) + BuildDashboard (PURE aggregation → TotalRequests/Errors/ErrorRate, latency p50/p95/p99 nearest-rank, per-route breakdown sorted, redacted log feed + error feed, content-addr Fingerprint via records.Hash). Report.WroteKernel ALWAYS false. No clock/RNG/DB. redactLog REUSES S91 gitleaks-style closed-regex gesture (panel never prints a logged secret = itself a leak). percentile = nearest-rank ceil(p*n/100) on a COPY (never mutates caller).

**Done-crit BOTH met + RAN**: Godog/acceptance (fixtures app-emits-spans→dashboard-renders-latency/error-rate + app-emits-logs→log+error-feed + leaked-secret-redacted + A-never-leaks-to-B isolation + unknown-kind-refused) + property (rapid: WritesNoTruth WroteKernel-always-false + reproducible same-signals→same-fingerprint + project-isolation foreign-signal-never-changes-P + percentile observed-value+monotone p50≤p95≤p99 + redaction-soundness AKIA-secret-never-survives + error-rate∈[0,1]).

**Verification all green**: go test opsobservability+mcp ok (cached), vet clean, gofmt -l clean. MCP aidos-ops-observability 3 PURE tools (ops_ingest/ops_dashboard/ops_fingerprint) all WroteKernel:false, write NOTHING. Wall-grep CLEAN (only records.Hash = read-only hash). TS twin lib/ops-observability vitest 11/11; TS fingerprint = FNV-1a NOT byte-pinned to Go records.Hash (Go authoritative, documented-acceptable like prior steps) but percentile/rate/redaction math IDENTICAL to Go (rank ceil(p*n/100) matches). tsc clean (no ops errors), biome 1 INFO only (unsafe-fix template-literal nudge feed(d.projectId+"\n") — NON-blocking stylistic, not error). nav:154 (/ops-observability registered k=opsObservability), i18n fr4360==en4360 opsObservability 27==27, h1 t("title")="Observabilité d'exploitation" MATCHES e2e regex. e2e 4/4 RAN GREEN live:3000 (panel boots, emit→build renders latency 42ms + requests, demo set 25% error-rate + error-feed + [REDACTED] + fingerprint, foreign-kind closed-set). Docs 3-layer (Implémentation·Méta·Méta-méta) docs.json:253-254 mint registered, concept+internals URLs HTTP 200, HEAD==origin/main 2d4c823.

**OQ (by-design, non-blocking)**: Linear MCP unauthenticated (only authenticate/complete_authentication exposed) — S92 issue flip deferred; DP17 substrate (OTel→SigNoz/GlitchTip) is deploy-track concern (engine ships deterministic, panel ships per-app).

verified-green ZERO corrections.
