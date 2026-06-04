---
name: ba09-confinementaxis
description: BA09 PathAllowed/EgressAllowed/ExecAllowed — 4th wall axis (allow-list, distinct from zone deny-list); pure fail-closed; verified-green
metadata:
  type: project
---

BA09 = the CONFINEMENT axis, the 4th of the four wall axes (after S04/S52 zone, BA07 capacity, BA08 skill).

`PathAllowed(impl,target)` pure prefix allow-list: allowed IFF (∃ a∈AllowedPaths: prefix(a,target)) ∧ (∄ f∈ForbiddenPaths: prefix(f,target)); empty AllowedPaths denies all (max-confinement default). `EgressAllowed`/`ExecAllowed` defer to AgentImplementation methods over agentlayer (those fields/methods + agentlayer.EgressAllowed/ExecAllowed pre-existed from S52/BA-series — BA09 only adds the enforcer wrappers + 3 BlockReason codes). 3 new S13 codes AGENT_PATH/EGRESS/EXEC_NOT_ALLOWED, non-empty how_to_fix, Go+TS verbatim.

**Key invariant — distinct from zone deny-list:** TestProp_PathAllowed_DistinctFromZoneDenyList asserts `tmp/scratch` is NOT IsAboveWaterline yet confinement denies it (allow-list ≠ deny-list), AND allow+deny co-exist on one impl. This IS the done-criterion.

Verified-green: go build/test agentimpl+blockreason ok, gofmt+vet clean, tsc clean, vitest 62/62, Playwright agents.spec.ts 33/33 on live :3000 (4 new BA09). Docs commit 20978f7 on origin/main, mint validate passed.

**Watch:** biome `useOptionalChain` warning on lib/agentlayer.ts ~L674 `isKnownModel` is a PRE-EXISTING BA03 nit (commit 1c418db), NOT BA09, and a warning not error — do not flag it against BA-series confinement steps. See [[feedback_i18n_keys_missing]] (i18n clean here, all 8 pathProbe keys in both locales). Linear MCP unauth = OQ; Mintlify async index = OQ; composition→BA13, real OS confinement→BA17.
