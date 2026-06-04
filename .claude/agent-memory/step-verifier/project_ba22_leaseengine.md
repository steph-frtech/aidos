---
name: ba22-leaseengine
description: BA22 lease/expire engine + tick driver + write-path fencing over the BA20/BA21 scheduler — verified-green; pure planner + single impure Clock shell pattern
metadata:
  type: project
---

BA22 = the runtime scheduler's lease/expire ENGINE + the only impure shell + write-path FENCING. Built on BA20 (Claim, role+migration+epoch token) and BA21 (MatchRole, HeadOf, DetectStarvation). Files: back/runtime/scheduler/lease.go (Schedule + Fence), tick.go (Driver/Clock/QueueSource/Applier/LeaseWindow), lease_fixture_test.go, lease_property_test.go, tick_test.go; TS twin in front/web/lib/scheduler.ts (schedule + fence, verbatim).

Shape:
- `Schedule(queue, agents, now, leaseUntil) -> ScheduleResult{Queue, Assignments}`: pure, total. Order: (1) EXPIRE stale claimed (lease_until<now) → open, owner+lease dropped, epoch KEPT (monotone, NOT reset), emits `expired` assignment; (2) BLOCK/UNBLOCK on dep gate (all deps resolved); (3) LEASE greedily, mirror-first head (HeadOf), role-matched (MatchRole), lex-smallest free agent marked busy for the tick. Never leases blocked, never claims for agent role. Reclaim keeps epoch N; if re-leased same tick Claim bumps N→N+1 (fencing advances → woken-late agent fenced).
- `Fence(writeEpoch, currentEpoch)`: == → OK; != (both < and >) → refused AGENT_LEASE_FENCED (blockreason.go has the code + how_to_fix). Pure, total.
- `Driver.Tick()/Run(ctx)`: the SINGLE sanctioned impurity. Clock seam (SystemClock prod / stepClock test) supplies `now`; QueueSource (read), Applier (BA23 UPDATE seam). LeaseWindow.Until(now) = now+Duration, fail-closed empty on bad now. Run uses time.NewTicker — runtime daemon, the §7 arg-less-clock ban is for /long-run scripts not runtime daemons (documented in tick.go header).

Mirrors: Go fixture 4 + rapid 6 properties (determinism, never-lease-blocked, expire/keep-live, cross-invariant K4, fencing, stable order) green; fast-check 17 green. e2e tests/e2e/agents.spec.ts BA22 block 5/5 on :3000. UI: SchedulerSection BA22 block on /agents (tick / resolve-mirror / fence controls), action-capable, themed+bilingual, all pure-lib computed.

Wall: lease.go + tick.go contain NO SQL — all INSERT/UPDATE/kernel. mentions are in COMMENTS only. The UPDATE is BA23's MCP shell under aidos_scheduler role. Schedule never claims for the agent.

Verified clean: gofmt -l empty, go vet ok, go test ./runtime/scheduler/... 13.3s (incl. BA20 Testcontainers — prior green intact), go build exit 0; tsc clean, biome clean on the 3 touched front files, vitest 17/17; mint validate passed; docs commit f022388 on origin/main (concept + internals with Implémentation·Méta·Méta-méta). 7 BA22 i18n keys both fr+en.

OpenQuestions (NOT residual, by-design fwd-deps): BA23 = MCP UPDATE wiring (the SQL WHERE lease_epoch=$writeEpoch guard Fence mirrors); BA24/BA25 = contention/OrchestrationPolicy/MaxConcurrency; S06 = Postgres mirror persistence back-fill. Linear MCP unauthenticated (only authenticate tool exposed) = OQ per §11, not blocking. Verified-green.
