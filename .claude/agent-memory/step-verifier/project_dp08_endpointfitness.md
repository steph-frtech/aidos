---
name: dp08-endpointfitness
description: DP08 verification record — EMITTED_NO_HARDCODED_ENDPOINT arch-fitness invariant (Go lexer + TS AST pass), verified green with ZERO corrections; all sensors re-run live.
metadata:
  type: project
---

# DP08 — endpointfitness (EMITTED_NO_HARDCODED_ENDPOINT) — VERIFIED GREEN, ZERO CORRECTIONS

Commit 26f4309 (pushed, origin/build/s00-s47 in sync). Docs ebc5cf0 pushed to steph-frtech/docs main, both pages live 200, docs.json:575-576, mint validate + broken-links clean (re-run live).

**What it is:** `back/runtime/endpointfitness` — deterministic TS lexer (AST-equivalent: template ${expr} spans poison adjacency via NUL sentinel, comments skipped, inner-span literals scanned) + closed 4-reason classifier (localhost_literal, ip_literal, url_concrete_host, host_port_literal); Sense/Block/Address content-addressed (records S02); SensorArchFit → selfcert S84 archfit slot, fail-closed; package-local BlockReason code (FN04 motif). Declared rule `emitted_no_hardcoded_endpoint` in arch-fitness.json + Go parity fixture. Authoritative TS twin `front/web/lib/endpoint-fitness.ts` = REAL TypeScript compiler API (A7, ADR 0066); Go addresses pinned in BOTH suites (green 43f2e914…, red 5164a99a…) + the e2e — both green ⇒ cross-language byte parity proven (DP07 motif generalized to the whole verdict).

**Verified live by me:** go test ./... whole back exit 0, gofmt/vet clean; vitest 2139/2139 (baseline 2128 + 11); tsc 0; biome GENUINELY clean on all 8 changed front files + e2e spec (re-run — noTemplateCurlyInString pre-suppressed with reasons in lib + file-level in test/e2e); e2e 44/44 in ONE run on :3210 (endpoints-fitness 4 + connections/environments/stack-manifest/stack-emit/env-emit/stack-bundle 4 each + v3 16), :3210 released after, prod :3000 untouched; no .fail files, no untracked binaries, no Temporal/Coolify/Drizzle; wall clean (server action = pure in-memory sandbox measure, zero fetch/POST); i18n endpointsFitness fr27==en27 + nav key both locales; nav link WorkbenchHeader.tsx:162 (reachability).

**Why:** the test-table literals (1.2.3.4, db.sagedesk.fr:5432, arbLeak) are the CANONICAL FAULT-INJECTION FIXTURES — the step's very object — not real hardcoded endpoints; never flag them under "no hardcoded URL". Prod :3000 404 on the new route = pre-step build, recurring DP expected state (DP04 precedent).
**How to apply:** for arch-fitness/sensor steps verify the 4 axes: (1) fault-injection law red→green BOTH directions, (2) declared-config↔code parity test exists, (3) the cut actually blocked (battery refuses green, not just a red verdict), (4) cross-language hash pins in Go fixture AND vitest AND e2e (three places, same literal).

OQ (by-design, recurring): Linear MCP unauthenticated (only authenticate tools exposed — every DP step); validation_humaine still 0 hits in lib/v2/builder.ts (the 2 user reqs still don't exist → non-regression N/A); mirrors-schema persistence = bootstrap exception (backfill S06); Go lexer doesn't lex TS regex literals (absent from emitted tree by construction; extending = idée→miroir→/goal); Mintlify search-index lag (pages 200).

Executor report ACCURATE AND COMPLETE — 2nd consecutive zero-correction DP step (after DP07); "Biome clean" claim TRUE again.
