---
name: s90-api-surface
description: S90 verification — emitted-app COMPLETE API surface emitter (Hono router + per-app OpenAPI + Pact-per-op + provider-verify + Go sidecar parity)
metadata:
  type: project
---

# S90 — api-surface (emitted app's COMPLETE API surface, EPIC9, ADR 0040)

`back/runtime/apisurface` = PURE deterministic emitter projecting the FULL operation set into: EmitRouter (Hono/TS, one route per SYNC op, handler delegates to Go SIDECAR interpreter callback ADR0040 Déc.7, policy DENY→403), EmitOpenAPI (per-app OpenAPI 3.1 byte-stable), EmitPactSuite/EmitPactArtifacts (ONE contract per sync op, generalises S36 createOrder.pact.json + DENY interaction for authorize ops), VerifyOp/VerifySuite (in-process httptest provider verification on ALL endpoints, status+field-set assertions), SidecarVerdict (operation.Interpret behind JSON boundary).

**Done-criteria all PROVEN + RAN:** (1) pact-verifier on ALL endpoints — VerifySuite Go + verify MCP tool + e2e over multi-endpoint surface (createOrder POST/authorize + listOrders GET); (2) OpenAPI byte-stable — rapid TestOpenAPIByteStable (re-emit identical + input-order-shuffle invariant + hash unchanged) + TestRouter/PactSuiteByteStable + TestSourceHashSensitive; (3) Gherkin runtime — TestCreateOrderPersistsARow (201) + TestPolicyDenyEnforcedAtRuntime (403, real S10 interpreter); (4) **parity mirror** TestSidecarParityWithNativeInterpreter pins SidecarVerdict==operation.Interpret for allowed AND denied. NOTE parity test: both SidecarVerdict and nativeVerdict call operationBodyFor+operation.Interpret with SAME denyOnMarkerDeps double — proves the JSON-boundary wrapper preserves verdict (the done-crit) and that NO business rule is re-implemented in TS (ADR0040 honored). Honest, not gamed.

Design note: Op gained explicit `Input` schema (command payload e.g. createOrder→{cartId}) DISTINCT from Entity (response) — read from operation's two Kernel schemas, never authored. denyOnMarkerDeps = reproducible double (deny iff $.input.__deny__, cart-with-2-items reader, summing mutator) no LLM/clock/RNG.

**Verification results:** go build/vet/gofmt clean; go test runtime/apisurface+mcp/apisurface OK; broad `go test ./runtime/... ./mcp/...` exit 0 prior-green intact. Wall-grep CLEAN (no kernel/mirrors/fitness truth-write; only reads kernel/entities, kernel/operation, kernel/records). MCP aidos-apisurface 4 PURE tools (openapi/router/pact/verify) write-NOTHING. TS twin vitest 8/8, tsc clean. Nav reachable `/api-surface` k=apiSurface WorkbenchHeader:152, i18n apiSurface present fr+en. e2e 6/6 RAN GREEN live:3000. Docs concept+internals s90-api-surface.mdx 3-layer (Implémentation/Méta/Méta-méta) docs.json:249-250, mint validate PASS, pushed 3b98084 HEAD==origin/main.

**ONE CORRECTION:** biome noUnusedVariables — `const sh = sourceHash(s)` dead in TS twin emitOpenAPI (Go OpenAPI puts sourceHash in Artifact field not JSON body, TS Emitted shape omits it → leftover). Removed the line. emitRouter's `sh` IS used (header comment) — left. Remaining 1 biome warning = noNonNullAssertion `byName.get(c.op)!` in verifySuite = idiomatic twin style, safe (c.op always in map), NON-blocking, tsc clean. RECURRING: biome warns on TS twins (unused-var + noNonNullAssertion) — see [[recurring-gofmt-biome-on-touched-files]].

**OQ (by-design fwd-dep, NOT residual):** (a) Linear MCP browser-OAuth unauth in non-interactive run → S90 issue not moved, record manually. (b) ApiSpec supplied per-call (agent SELECT-only mirror of project ops); changeset/kernel projection for emitted-app operation set binds here unchanged when it lands — documented forward-dependency.

Verdict: PASSED after 1 biome cleanup correction.
