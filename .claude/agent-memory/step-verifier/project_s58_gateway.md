---
name: project-s58-gateway
description: S58 MCP-over-HTTP passerelle verification — pure router + server-side wall over the 13 MCP servers; verified-green with cosmetic comment fix
metadata:
  type: project
---

S58 = app-builder EPIC 2 first step: MCP-over-HTTP PASSERELLE. Pure deterministic routing core `back/runtime/gateway` (gateway.go Route + registry.go closed registry) behind MCP server `back/mcp/gateway` served on BOTH stdio AND StreamableHTTPHandler (HTTP honours MCP literally).

**Architecture**: Route(call)→RouteDecision is PURE TOTAL (no clock/rng/IO/LLM). Order IS the wall: (1) unknown_tool, (2) scope refusal via projectwall.Classify REUSED from S55 (AGENT_CROSS_PROJECT_WRITE, same predicate as RLS), (3) truth_write refusal (GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET), (4) below_line → route. Registry CLOSED, no arbitrary passthrough. Exposes 13 MCP servers' tools all BELOW THE LINE (changeset_* IS the legal truth door) + a FENCED truth-zone namespace (kernel_write/mirror_write/fitness_write) registered as TruthWrite so a forged truth-write is REFUSED with ChangeSet-pointing BlockReason rather than 404'd.

**Done-criteria ALL met**: Pact per gateway-tool (pact_test.go — 3 gateway tools route/tools/servers, in-process httptest provider-verification, field-set exact match); Godog round-trip below-the-line to LIVE Postgres (roundtrip_bdd_test.go — st.store.Put/Get reaches Postgres via Testcontainers, 2 scenarios); Testcontainers GRANT-not-bypassed (SET ROLE aidos_agent → INSERT kernel.truth → asserts permission-denied); pure routing zero-LLM (gateway_property_test.go 4 rapid props: determinism/totality+terminality/scope-never-widened/truth-write-always-changeset).

**Sensors**: gofmt clean, go build ./... clean, go vet clean, fresh `go test -count=1` GREEN (mcp/gateway 3.3s = Docker ran). TS twin lib/gateway.ts BYTE-FOR-BYTE port, vitest 8/8 (3 fast-check). tsc rc=0. biome clean on gateway files. i18n parity 3359==3359, gateway namespace 21 keys both + nav entry. e2e gateway.spec.ts 6/6 (below/cross/truth/unknown/surface/custom).

**WALL**: actions.ts writes NO truth (pure projection over twin). Only kernel INSERT in repo = the negative GRANT-bypass Godog test. WorkbenchHeader +1 line = /gateway nav entry only.

**OpenQuestions (by-design forward-deps, NOT residual)**: the generic DISPATCH of a routed call to arbitrary target handler is deferred to S59 cutover (the below-the-line round-trip IS already proven end-to-end via the store in Godog; only the generic seam is deferred). Linear MCP unauthenticated (only authenticate/complete exposed) → S58 issue tracking manual.

**Docs**: concept + internals (Implémentation/Méta/Méta-méta all 3 present) at .aidos-docs, registered in docs.json L183-184, mint validate passed, HEAD==origin/main 73909c4 pushed, clean tree.

**Commit**: 9f40221.

**SCARS**:
- registry.go/main.go/gateway.go comments + the gateway_servers MCP tool DESCRIPTION string said "14 servers" but list is 13 (gateway.ts comment correctly said 13). Cosmetic but the tool Description is user-visible. FIXED 14→13 across all 6 sites (sed). Pattern: executor miscounts server list in prose/descriptions.
- biome WorkbenchHeader:289 useKeyWithClickEvents suppression = PRE-EXISTING from 295112e (nav-drawer), NOT S58 — recurring established scar, ignore.

verified-green, 6 cosmetic comment corrections (14→13 server count).
