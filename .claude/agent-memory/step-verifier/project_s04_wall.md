---
name: project-s04-wall
description: S04 the wall — PreToolUse hook (level 1) + Postgres GRANTs (level 2) defense-in-depth; verified green zero corrections
metadata:
  type: project
---

S04 = THE WALL (CLAUDE.md §2), defense-in-depth two levels. All 3 done-crit met.

Single-source classifier (OQ-S52-wall resolved at BA03): back/hooks/pretooluse/wall/wall.go (package wall) is the ONE place above-waterline zones declared — schemas {kernel,mirrors,fitness} + path prefixes {back/kernel/,back/migrations/}. ForbiddenZones() returns fresh copy. Hook back/hooks/pretooluse/wall.go (package main) re-exports verbatim via type aliases (anti-overwrite §9 supersede-via-projection, public surface unchanged). Importers VERIFIED: runtime/agentimpl/{gate,agentimpl}.go + kernel/agentlayer/wall.go all import the wall pkg.

Level 1 Classify(target)->Decision PURE/TOTAL, deny IFF above-waterline, code AGENT_WRITE_ABOVE_WATERLINE + 4-step how_to_fix naming idea->mirror->/goal door; Run() fail-closed on undecodable event (exit 2). Determinism mirror TestClassifyDeterministic + DenyIffAbove.

Level 2 back/migrations/wall_grants_baseline.sql: creates fitness schema+waterline table; aidos_agent USAGE+SELECT only, REVOKE INSERT/UPDATE/DELETE/TRUNCATE+CREATE on kernel/mirrors/fitness, default privileges SELECT-only; aidos writer role keeps write = single door. Idempotent (IF NOT EXISTS, guarded role creates).

Fault-injection RAN GREEN Testcontainers real postgres:16 (5.1s): TestWallGrantsDenyAgentRole (SET LOCAL ROLE aidos_agent INSERT kernel.truth/mirrors.mirror/fitness.waterline -> permission denied all 3) + TestWallGrantsAllowAidosRole (aidos succeeds). Godog tests/runtime/wall.feature 3 scenarios (kernel deny + Outline 3-zone + below-line allow) via in-process Evaluate. gofmt/vet/build ./... clean.

Front /wall READ-ONLY panel (lib/wall.ts static declared registry mirrors wall.go field-for-field, page.tsx Server Component no I/O); ui-completeness VACUOUS (wall enforced by hook+GRANTs never from screen, no headless capability hidden — correct). tsc clean, biome clean 4 files, vitest lib/wall.test.ts 6/6, i18n 3441==3441 (wall 19 keys both), nav WorkbenchHeader:151. Playwright tests/e2e/wall.spec.ts 6/6 GREEN live :3000 (waterline above/below, block-event code, how_to_fix names idea/mirror//goal).

Docs concept+internals s04-the-wall.mdx 3 layers (Implementation:11/Meta:54/Meta-meta:77), docs.json:75-76, mint validate PASS, committed remote 4280d57, tree clean HEAD==origin d5c9a0b.

OQ (not residual): mirrors Postgres schema=S06 so Gherkin materialized to tests/ (valid pre-S06 mirror); Linear MCP unauth this session. verified-green ZERO corrections.
