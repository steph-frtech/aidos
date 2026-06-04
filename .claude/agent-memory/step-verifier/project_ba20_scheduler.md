---
name: ba20-scheduler
description: BA20 scheduler ROLE+fencing — distinct aidos_scheduler role alone transitions RedWorkItem open→claimed; pure Claim core + monotone lease_epoch; agent stays INSERT+SELECT; verified-green
metadata:
  type: project
---

BA20 = the runtime ORDONNANCEUR primitive. A NEW Postgres role `aidos_scheduler` (NOLOGIN) is the ONLY role that may TRANSITION a RedWorkItem (open→claimed) via column-scoped GRANT UPDATE(status, owner_agent, lease_until, lease_epoch) on runtime.red_work_queue; it SELECTs kernel.agent_layer (gap E4, for BA21 MatchRole) and has NO write on any truth schema (asserted positively by TestScheduler_NoTruthWrite). The agent role stays INSERT+SELECT (the wall, S22 posture re-stated). lease_epoch BIGINT NOT NULL DEFAULT 0 + CHECK>=0 = the fencing token (gap E2); write-path enforcer is BA22 (OQ fwd-dep).

Pure core: `Claim(item, owner, leaseUntil) -> (claimed, AgentAssignment, err)` — total, no clock/rng/IO, epoch=prev+1 declared bump. TS twin lib/scheduler.ts verbatim. AgentAssignment has NO Version/Mirror (structural — not a layer, TestProp_Assignment_NotALayer). UpdateColumns const = Go mirror of the GRANT (4 cols).

Mirrors: 5 Testcontainers integration tests (real Postgres, the central red set) all PASS in 12.5s; rapid 3 properties + fast-check 6/6 green. UI: /agents SchedulerSection (action-capable: claim button bumps 0→1 + shows assignment; agent-claim button shows agentCanTransition()=false refused in place). e2e 3/3 on :3000.

SCAR: report claimed "biome clean / gofmt" but committed scheduler.go had a gofmt alignment gap (one extra space in a struct-tag comment column) — `gofmt -l` flagged it. gofmt -w fixed it. Lesson: ALWAYS run `gofmt -l <dir>` on the committed Go file; "report says formatters clean" is not proof (same scar shape as BA16). See [[project_ba16_postcheck]].

Scope split: BA20 = role+migration+fencing primitive + open→claimed Claim. MatchRole algo = BA21. Lease/expire planner + stale-epoch write enforcer (AGENT_LEASE_FENCED) + tick driver = BA22 (by-design fwd-deps, OpenQuestions). Linear MCP unauth = OQ (not blocking, §11). verified-green.
