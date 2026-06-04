---
name: ba23-schedulermcp
description: BA23 scheduler MCP shell (scheduler_tick/assignments/fence) + /agents Queue & Dispatch panel — verified-green; pure-planner shell + below-line capture applier, wall holds
metadata:
  type: project
---

BA23 = the MCP SHELL of the runtime ordonnanceur (ADR 0009: every backend op = MCP tool). back/mcp/scheduler/main.go exposes 3 tools: scheduler_tick (run ONE pure scheduler.Schedule pass, apply transitions via captureApplier seam below the line, return dispatch view + StarvationSignal), scheduler_assignments (read last tick's AgentAssignments), scheduler_fence (write-path epoch fence → AGENT_LEASE_FENCED). Built on BA20/BA21/BA22 runtime/scheduler pure planner. now/lease_until are SUPPLIED in tickInput (no arg-less clock on the MCP path).

Wall: the shell contains NO SQL — UPDATE/kernel./mirrors. appear only in comments + tool descriptions. The only write is captureApplier.Apply recording the ScheduleResult in-process (below-the-line lease/telemetry). Production applier (real aidos_scheduler-role UPDATE WHERE lease_epoch=$writeEpoch) is the BA22 Applier seam, back-filled at the consuming step (OQ fwd-dep, NOT blocking).

Mirrors: journey_bdd_test.go (Godog, 4 scenarios in tests/runtime/scheduler-dispatch.feature) + repro_property_test.go (rapid: same request ⇒ identical tickOutput; never-lease-blocked) + transport_integration_test.go (REAL MCP server↔client over NewInMemoryTransports, tick reclaims dead lease epoch 2→3, blocks dep-gated proj, leases mirror head; fence refuses stale epoch). go test ./mcp/scheduler/... green 0.03s. UI: SchedulerSection BA23 block (data-testid scheduler-dispatch) on /agents — queue table, free agents, starvation alert, Dispatch next/Reclaim expired/Resolve/Reset controls, all via pure schedule(). e2e tests/e2e/agents.spec.ts BA23 block 4 cases.

Verified clean: gofmt -l empty (no scar this time — same dir as BA20 which HAD the alignment scar), go vet ok, go build ./... exit 0, runtime/scheduler prior-green intact 12s (incl BA20 Testcontainers, Docker available), vitest lib/scheduler.test.ts 17/17, tsc clean, biome clean on 5 touched files. Docs: concept + internals (3 layers Implémentation·Méta·Méta-méta) registered in docs.json, mint validate passed, commit b57d9ee on origin/main.

OQ (NOT residual, by-design): production SQL applier = consuming step; S06 = mirrors-schema Postgres persistence back-fill; Linear MCP unauthenticated (only authenticate tool exposed) = §11 best-effort, not blocking. Verified-green.
