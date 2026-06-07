---
name: project-s59-gateway-sdk
description: S59 verification — typed SDK over S58 gateway, never-double-typed decoder, deterministic demo fallback, /gateway cutover
metadata:
  type: project
---

S59 (app-builder EPIC 2) = the single typed client SDK over the S58 gateway + first panel cutover.

**Done-crit (all met):** Vitest+fast-check proves (a) the client NEVER double-types — `Decoder<T>` declared once, static type INFERRED via `Decoded<typeof dec>`, no parallel interface; type-level assignment + runtime round-trip pin it; (b) decoder REJECTS any malformed payload (property over null/int/string/array/wrong-shape/non-empty-malformed-items → toBeNull, never coerces) and `readVia` falls back DETERMINISTICALLY to demo (no-endpoint / transport-throw / malformed-payload → source:"demo"; well-formed → source:"live"); reproducible same-input→same-output. e2e per converted panel = /gateway cutover 4/4 (demo fallback offline, surface populated, route still executes, reproducible across reloads).

**Verified green ZERO corrections:** vitest 9/9 (gateway-sdk.test.ts) + full front suite 982/982 (90 files), tsc rc=0, biome clean on 4 changed files, i18n 3361==3361 both locales (sourceLive/sourceDemo present FR+EN), e2e 4/4 :3000, docs concept+internals present 3 layers (Implémentation·Méta·Méta-méta) registered in docs.json (2 refs) mint validate passed, docs HEAD==origin/main 1179a22, code committed 74021a6.

**WALL:** SDK READS only (below-the-line), carries (identity,project) scope in x-aidos-identity/x-aidos-project headers, faithful to S58 closed registry (`lookup(tool)` rejects unexposed tool client-side before the wire). grep for INSERT/UPDATE/kernel_write/truth in changed front files = comments ONLY, no truth-write. Truth-writes stay propose→ChangeSet. Transport (callGateway/callMeta) is the ONLY impure surface, pinned by the property mirror. Determinism-first: decoder + fallback are pure, zero LLM.

**OQ (non-blocking, NOT residual):** (1) only /gateway cutover this step — other named panels (store/records already live-Postgres from S01/S02; mirrors/version-dag/red-wave/completeness/kernel-debt/ideas/goal/changeset still serve *-data.ts fixtures) reuse the SAME single SDK path, per-panel decoders+reads are mechanical follow-on each adds when its live gateway tool wiring lands — done-crit says "e2e per converted panel" and the SDK is the authoritative single typed door, proven on /gateway. (2) Linear MCP unauthenticated (only authenticate/complete_authentication exposed) → can't move issue. (3) uncommitted back/mcp/gateway + back/runtime/gateway = S58 comment fixes (14→13 server count), NOT S59, executor left unstaged, doesn't affect front-only S59.
