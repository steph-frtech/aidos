---
name: project-s07-sensors
description: S07 PostToolUse sensors hook — pure Aggregate verdict + per-check adapters + append-only sensor_runs; read-only /sensors (ui-completeness vacuous); verified-green
metadata:
  type: project
---

S07 = the PostToolUse sensors hook (`back/hooks/posttooluse`), twin of the S04 wall: PreToolUse blocks an illegal WRITE, PostToolUse blocks a BROKEN DIFF.

**Shape:** pure `Aggregate(results)` (block iff any !Pass, no third verdict, failing[] = exact subset) + resolver (`ChangedFiles`/`AffectedGoPackages`) + per-check adapters that INVOKE frozen tools (gofmt -l, go vet, go build=lint, in-process archtest boundary check, go test=affected) + append-only `runtime.sensor_runs` (+ `sensor_check_results`).

**Wall:** writes only to `runtime` schema (below waterline, S05), INSERT+SELECT only, REVOKE UPDATE/DELETE/TRUNCATE. Never touches kernel/mirrors/fitness. The archtest sensor itself guards `back/kernel/` import boundary.

**Determinism:** Aggregate is pure (no clock/rng/I/O); rapid property test is its reproducibility mirror; TS port (lib/sensors.ts `aggregate`) pinned by fast-check vitest (7/7).

**Mirrors:** Godog journey (sensors.feature, 4 scenarios incl. Scenario Outline over 5 checks), rapid invariant, MANDATORY fault-injection (TestFaultInjection_{Gofmt,Vet,Lint,Archtest,Affected} — each fires red→green on a real injected fault in a throwaway module).

**UI:** read-only /sensors (projects sensor_runs, static declared registry mirroring CanonicalChecks). ui-completeness vacuous — hook is harness-invoked, no headless capability. Playwright 5/5 green on :3100.

**Errored = failure made explicit** (KRD §82 .passthrough() anti-pattern): unknown sensor + errored check both have Pass=false, flow through Aggregate as failing, DB CHECK (NOT(errored AND pass)) enforces in-database.

**OpenQuestions (forward-deps, NOT residual):** OQ-S07-1 affected-set transitive closure; OQ-S07-2 go-arch-lint/depguard at arch-fitness step; OQ-S07-3 sensors MCP for rerun-on-demand.

Verified PASS, zero corrections, zero residual. AID-48 Done (correct). Docs live + pushed, three layers present docs.json:81-82.

RE-VERIFIED 2026-06-07 (post S61, build/s00-s47): all green again on this build — Go -count=1 GREEN 11.6s Testcontainers real pg, gofmt/vet/build ./... clean; vitest 7/7, tsc rc=0, e2e 5/5 live 5.5s, i18n 3441==3441 sensors 19==19 zero drift. WorkbenchHeader:292 biome useKeyWithClickEvents warning = PRE-EXISTING commit 295112e (2026-06-03), NOT S07 (S07 only added nav line 95) — recurring scar, never a residual. Linear MCP unauth=OQ. ZERO corrections.
