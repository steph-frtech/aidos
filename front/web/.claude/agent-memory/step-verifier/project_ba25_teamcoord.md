---
name: ba25-teamcoord
description: BA25 ScheduleTeam multi-agent coordination — pure team planner reusing ResolveConflict + BA22 Schedule; verified green.
metadata:
  type: project
---

BA25 `ScheduleTeam(queue, agents, policy, now, leaseUntil)` in `back/runtime/scheduler/team.go` — pure N-agent tick planner. Verified green (Go tests + vet + gofmt, vitest 29, tsc, biome, 4 Playwright e2e all pass; back `go build ./...` clean; docs `mint validate` pass + pushed to origin/main 15110ac).

**Why it passes determinism-first cleanly:** the three coordination rules are DECLARED algorithms reusing one authoritative impl each — same-target conflict delegates to kernel `agentlayer.ResolveConflict` (team.go:165), EXPIRE+BLOCK/UNBLOCK reuse BA22 `Schedule`'s rules, cap (F1) is a count, hand-off is the BA22 dependency gate. No LLM in the loop, no duplicated rule.

**How to apply (scheduler BA2x series verification recipe):**
- Run Go from `/data/dev/aidos/back` (module root). The glob `./agentloop/...` FAILS with "setup failed" — `back/agentloop` is a stray non-module dir; the real package is `runtime/agentloop` (green). Not a regression; ignore that one glob.
- The TS twin lives in `front/web/lib/scheduler.ts` (NOT agentlayer.ts for the BA20+ scheduler steps) — verbatim mirror of the Go; check the conflict/assignment sort orders match between Go `sortConflicts`/`sortAssignments` and the TS `.sort`.
- Trace the one-tick e2e by hand: cap=2, A(mirror) leases first, x1 beats x2 on lower mirror-rank (projection<operation_action), x2 waits as conflict loser, B stays blocked on dep A. Matches the e2e expectations.
- Wall: team.go is a pure planner — `grep INSERT|UPDATE|DELETE|.Exec` finds only comments. Importing kernel/agentlayer for a READ (ResolveConflict) is the established runtime→kernel pattern, not a wall breach.

Linear MCP unauthenticated this session → BA25 issue status move is an OpenQuestion (§11), not a fail.
