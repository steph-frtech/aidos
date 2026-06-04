---
name: ba18-identity
description: BA18 = AGENT IDENTITY/AUTH toward MCP (gap K3) — capability token IS the records.Hash∘Canonicalize content-address of the identity body (kind+LayerRef); owner_agent PROVEN not chain-declared, fail-closed AGENT_IDENTITY_UNVERIFIED
metadata:
  type: project
---

BA18 = `agentimpl.CapabilityToken` + `MintToken/MintTokenFor/VerifyToken` (identity.go) + `agentloop.PresentedToken/ActAsIdentity`. The token IS the S01/S02 content-address (`records.Hash ∘ records.Canonicalize`) of `identityBody(layerRef)` = `{kind:"agent_capability_token", layer_ref}`. Identity = the CoucheAgent@version (LayerRef), NOT the mutable runtime knobs — two projections of same @version share a token; different @version = different identity.

- **VerifyToken**: accepts ONLY on `presented != "" && presented == MintTokenFor(expected)`. Empty/malformed/another-identity all fail equality → fail-closed `blockreason.For(CodeAgentIdentityUnverified)` (28th code, in blockreason.go line ~262/664, how_to_fix non-empty). owner_agent PROVEN by token, never read from self-declared field.
- **agentloop side**: PresentedToken(in)=MintToken(in.Impl); ActAsIdentity verifies loop's own token binds it to expected LayerRef before acting. Pure delegation to agentimpl.
- **Mirrors green**: agentimpl 5 fixtures (incl wrong-identity/empty/malformed fault-injection) + 3 property (repro/binds-exactly-one/junk-never); agentloop 4 fixtures + 3 property (incl present==server-expectation round-trip). All SEMANTIC (no count-only). RED-first proven by compile-red.
- **TS twin** lib/agentlayer.ts (file: data — use grep -a): mintToken/mintTokenFor/verifyToken/IdentityVerdict/CODE_AGENT_IDENTITY_UNVERIFIED via `identityHash` = FNV-1a over same canonical body. NOT byte-identical to Go SHA-256 (established front-twin pattern, same as implContentHash) — what matters is determinism + faithful verdict logic (same equality/fail-closed/code). vitest 120/120.
- **UI**: action-capable /agents BA18 identity section IN AgentsPanel (NOT impl-viewer ⇒ viewer button-count guard 7 unaffected, same SCAR pattern as [[project_ba17_sandbox]]/[[project_ba10_mandatoryhook]]). Fault selector own|other|empty + verifyToken button + verdict/BlockReason/how_to_fix render. 14 identity* i18n keys FR+EN BOTH present + all 14 wired via t() in page.tsx (cross-checked per [[feedback_i18n_keys_missing]]).
- Evidence: go build+vet clean, gofmt clean, go test agentimpl+agentloop + full ./runtime/... green; tsc 0; biome rc=0 (3 warnings = PRE-EXISTING BA03 isKnownModel nit per [[project_ba09_confinementaxis]], not BA18); e2e agents.spec 63/63 on :3000 (4 BA18 semantic) — :3100 stale 404, :3200 dead, see [[project_playwright_port_targeting]]; mint validate passed, internals has 3 layers, docs pushed beb09f1 (HEAD==origin/main).
- Wall: pure runtime functions, no kernel/mirrors/fitness write ⇒ vacuously held. Determinism-first: pure total hashing+equality, repro mirrors both planes, no LLM.
- OQ (fwd-dep, non-blocking): MCP servers (agentimpl/scheduler/agentloop transport) that ENFORCE VerifyToken on the call path = BA19/BA23 (Testcontainers transport-boundary test is BA19 done-criterion); Linear MCP unauth.
- verified-green.
