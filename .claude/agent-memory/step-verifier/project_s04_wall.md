---
name: s04-wall
description: S04 the wall — PreToolUse Go hook (pure Classify) + Postgres GRANT level 2 (Testcontainers fault-injection); read-only /wall UI is correct (ui-completeness vacuous)
metadata:
  type: project
---

S04 erects the wall (defense-in-depth, CLAUDE.md §2) and is the canonical two-level pattern.

- **Level 1** = pure `Classify(target) -> Decision` in `back/hooks/pretooluse/wall.go`: deny IFF target above waterline (kernel/mirrors/fitness schemas, or `back/kernel/` / `back/migrations/` paths), emits BlockReason{AGENT_WRITE_ABOVE_WATERLINE, severity, explanation, how_to_fix naming idea→mirror→/goal}. `Run` fails-closed on decode error (exit 2). Determinism-first: rapid property `TestClassifyDenyIffAbove` + `TestClassifyDeterministic` are the reproducibility mirror.
- **Level 2** = `back/migrations/wall_grants_baseline.sql`: aidos_agent gets USAGE+SELECT only, explicit REVOKE INSERT/UPDATE/DELETE/TRUNCATE + REVOKE CREATE + SELECT-only ALTER DEFAULT PRIVILEGES; aidos writer role keeps write. Idempotent/append-only.
- **Fault-injection (hook-honesty, §5)** = `wall_grant_injection_test.go` (Testcontainers real Postgres): aidos_agent INSERT into kernel.truth/mirrors.mirror/fitness.waterline → permission denied; aidos INSERT → ok. Uses SET LOCAL ROLE on superuser conn (carries the same GRANTs a LOGIN role would) — acceptable proof of the privilege wall.

**UI**: `/wall` is **read-only and that is correct** — the wall writes no truth and exposes no capability, so the action-capable clause of ui-completeness is **vacuously satisfied** (no headless capability hidden). Same verified-green pattern as [[project_s03_cli_stub]] and [[project_s02_content_address]].

**OpenQuestions (by-design forward-deps, non-blocking)**: mirror records materialized to tests/+migration (mirrors schema lands S06); hook not yet wired into .claude/settings.json (runtime concern, not S04's package).

Verified green: go vet/gofmt/build clean; `go test -count=1 ./hooks/pretooluse/` 4.6s (Godog 5 + rapid + Testcontainers); vitest 6/6; tsc exit 0; i18n 235/235; Playwright 6/6; mint validate ok, docs pushed (4280d57); prior green (kernel/cmd/archive) intact; Linear AID-31 Done.
