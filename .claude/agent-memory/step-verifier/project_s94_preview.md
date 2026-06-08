---
name: project-s94-preview
description: S94 ephemeral preview environment per app — verifier notes (verified green, zero corrections)
metadata:
  type: project
---

# S94 — ephemeral preview environment per app (app-builder EPIC10, ADR0043/DP25)

PURE deterministic preview planner over an already-EMITTED stable phase (back/runtime/preview).

**Why:** DP25 deploy track precursor — turn the emitted surface of a content-addressed phase into a content-addressed PreviewPlan + judge the done-criterion (served-hash==emitted-hash) by CODE.

**How to apply:** when verifying later deploy-track steps (S96+ real `pulumi up` orchestration), remember S94 owns only the deterministic PLANNING+keying+equality; real process launch is a documented forward-dep (OQ), not its done-criterion.

Key facts:
- `EmittedAppHash(phase, surface)` = single content address of server⊕front⊕infra⊕datastore via S02 records.Canonicalize+Hash (named-key body, ORDER-FREE). Property: any byte change in any component → new hash.
- `BuildPlan` PURE: validate → app-hash → per-phase URL (`subdomainOf`="p-"+12 alnum of phaseHash, DNS-safe) → `pulumi up`/`pulumi destroy` boot/teardown → content-address plan.id. Same input → byte-identical plan. Validate refuses no-phase/no-server/no-front/no-infra/no-program/cross-app(program path must contain `gen/<project>/`) via typed BlockReason CodeOutOfScope (reused, not new code).
- `ServedMatchesEmitted` = the S94 done-criterion, pure comparison, code judges. Mismatch → BlockReason.
- Wall: PURE, writes NOTHING. grep clean. MCP aidos-preview 3 PURE tools (plan/app_hash/check_served) write-nothing.
- DONE-CRIT all 3 RAN: Godog preview.feature 5 scenarios (build-green per-phase URL+pulumi up/destroy / served==emitted / stale refused / no-phase refused / same-phase→same-URL) + rapid property 4 (reproducibility/phase-keying-distinct/app-hash-sensitive/served↔emitted) + fixture 3 (lifecycle BUILD→BOOT→PROBE→TEARDOWN / hash parity / refusals). go test runtime/preview+mcp ok, gofmt/vet clean, broad go build exit0 + runtime/... tests prior-green intact.
- TS twin lib/preview.ts vitest 6/6, digest=FNV-1a (display-only, Go records.Hash authoritative — NOT byte-pinned to Go). tsc clean for preview (only pre-existing uncommitted behavior-capture.test.ts error, NOT S94). biome clean on all 7 touched files.
- Front: /preview action-capable — BUILD plan control + re-emit toggle + PROBE badge (data-match) + LIVE create-order form POSTing real multipart+PNG-blob to `/api/emitted-submit` (below-the-line in-memory datastore stand-in, validates S72 blob contract image/png|pdf ≤5MB, server-assigned monotonic id). nav:/preview registered WorkbenchHeader:154 + i18n nav key. i18n preview ns 25==25, total 4406==4406 EXACT parity.
- e2e preview.spec.ts 5/5 RAN GREEN live:3000 (incl real PNG blob submit returning {ok:true,id,blob}). LIVE curl probe confirmed /api/emitted-submit + /preview 200.
- docs 3-layer (Implémentation·Méta·Méta-méta) steps/concept+internals/s94-preview.mdx, docs.json:257-258, mint validate PASS, HEAD==origin/main 9697aa3 clean.
- OQ (forward-deps, NOT residual): OQ-S87-stackmanifest (DP02 first-class StackManifest later), OQ-S93-datastore (emitted LIVE Doltgres later, /api/emitted-submit in-memory stand-in same shape), real `pulumi up` process launch modelled (DP25 deploy track S96+ owns it; S94 owns deterministic planning+equality). Linear MCP unauth.

VERDICT: verified-green, ZERO corrections.
