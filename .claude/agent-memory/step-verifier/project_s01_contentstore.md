---
name: s01-contentstore
description: S01 verification — Archive content-addressed append-only store (Postgres archive schema, SHA-256, head+history, in-DB wall)
metadata:
  type: project
---

S01 = Archive content-store. Done-crit: Atlas migration applies; content-addressed by hash; head+history exposed; destructive writes rejected (append-only) under test. ALL MET, re-verified live (docker available).

- archive_baseline.sql: schema `archive` — content(PK=hash immutable, byte_size GENERATED), head(PK=key mutable pointer FK→content), history(BIGSERIAL append-only, parent_hash FK). GRANT to aidos_agent = INSERT/SELECT on content+history (NO update/delete), INSERT/SELECT/UPDATE on head (no delete) = the in-DB wall.
- contentstore/store.go: Hash=sha256 hex, Put idempotent (ON CONFLICT DO NOTHING via sqlc), Get/SetHead(tx: read prior head→parent, upsert, append history)/GetHead/History oldest-first; sqlc gen at back/gen/archive.
- TESTS RAN FRESH -count=1 GREEN: contentstore 7.87s (TestAppendOnlyWall = least-priv role-swap, UPDATE/DELETE content+history → permission denied, INSERT allowed; TestContentStoreBDD 3 scenarios; TestContentStoreInvariants rapid 4 props Get(Put(b))==b/deterministic/no-overwrite/hash-det) + mcp/store 3.08s. go build+vet RC=0.
- WALL: front app/store/actions.ts writes ONLY archive.content/head/history (below line, append-only) — grep confirms no kernel/mirrors/fitness write (only a comment names them). put=sha256Hex matches Go; setHead=tx parent+upsert+history. biome clean 5 files.
- UI-completeness: /store route (StorePanel read + StoreActions put/set_head executable + StoreTeach) + tests/e2e/store.spec.ts 9 tests incl "put + set-head controls reachable", "put → reports hash", "set head → reports move". i18n store ns 38==38, total 3441==3441.
- MCP store_put/get/set_head/get_head/history registered (ADR 0009 single door) mcp/store/main.go.
- Determinism-first: Hash/Put pure-det Go, repro mirror present (Put_deterministic, Hash_deterministic_no_store).
- DOCS: concept+internals s01-content-store.mdx, internals 3 layers (Implémentation L11/Méta L129/Méta-méta L177), registered docs.json:69-70, mint validate PASSED, HEAD==origin/main d5c9a0b clean.
- OQ (by-design, NOT residual): Linear move-to-Done = MCP unauth (prior long-run drove to Done); store-write-via-MCP-gateway reconciliation deferred to later API-projection step (noted in actions.ts).
- VERDICT: passed, ZERO corrections.
