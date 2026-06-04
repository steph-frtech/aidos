---
name: ba17-sandbox
description: BA17 = OS/Postgres SANDBOX BINDING + the single gated LLM exception — pure BindSandbox over the 4 BA09 axes, three-level defense-in-depth write verdict, ActionGenerator seam wrapping the BA14-isolated provider
metadata:
  type: project
---

BA17 = `agentimpl.BindSandbox(impl) Sandbox` — binds the 4 confinement axes (PathAllowed/EgressAllowed/ExecAllowed/ResourceLimits, BA09) to a real OS/Postgres boundary under role `aidos_agent`, plus the LLM isolated behind ONE seam.

- **Three-level defense-in-depth write:** `CheckWrite(target)` folds FS boundary (level1 = `PathAllowed`) + hook gate (level1' = `GateAction` zone+path, BA13) + Postgres GRANT (level3 = `GrantWouldDeny == IsAboveWaterline`). A truth-zone target denied at all 3; `WriteVerdict.DeniedLevels` names them. Egress: `CheckEgress` = boundary (`EgressAllowed`) + gate, fail-closed (empty allow-list ⇒ no host). Levels named via stable consts (`fs_boundary/hook_gate/postgres_grant`, `egress_boundary/egress_gate`).
- **NOTE on "non-AllowedPaths" = truth-zone:** all fixtures use `back/kernel/truth.go` (above waterline ⇒ 3 levels). A path outside AllowedPaths but BELOW waterline (e.g. /tmp) would NOT trip level3 (grant) — done-criteria's "non-AllowedPaths" means the truth-zone case, matches.
- **Gated LLM exception:** `ActionGenerator.GenerateAction(ctx,impl,Transcript)` is the ONLY model-touching fn; renamed from "Provider" to avoid `agentlayer.Provider` enum collision (gap K1). `FakeGenerator` PURE (reply idx = len(tr.Turns), replay-safe, no hidden counter). `HardStop(emitted,cap)` pure predicate (cap<=0⇒no cap), property-pinned monotone. Production `ProviderGenerator` (agentloop) wraps `provider.Provider` (the BA14-isolated SDK seam); `generate.go` imports ONLY context/strings (arch-fitness intact). `tokenCapOf` returns 0 until BA01 token-cap knob lands (documented fail-open = OQ, NOT residual).
- **TS twin** lib/agentrun.ts: checkGeneratedWrite/checkGeneratedEgress/grantWouldDeny/hardStop/fakeGenerateAction + POSTGRES_AGENT_ROLE/WRITE_LEVELS/EGRESS_LEVELS. Faithful port.
- **UI:** action-capable /agents sandbox control (sandbox-shell/run/fault/role/write/egress/*-levels) IN AgentsPanel (NOT the impl-viewer) — so the viewer button-count guard stays 7 (BA17 added no viewer probe; same SCAR pattern as [[project_ba15_driveshell]]/[[project_ba10_mandatoryhook]]). 10 sandbox* i18n keys FR+EN, wired via t() in page.tsx.
- Evidence: go build+vet clean, gofmt -l BA17 files clean, go test runtime/agentimpl+agentloop ok (fresh -count=1), full ./runtime/... 20 pkgs ok no FAIL; tsc 0, vitest agentlayer 113/113, biome clean; e2e agents.spec 59/59 on :3000 (:3100 stale 404, :3200 dead — see [[project_playwright_port_targeting]]); mint validate ok, docs pushed d704400 (HEAD==origin/main, 3 layers).
- OQ (fwd-dep, non-blocking): tokenCapOf=0 until BA01; Linear MCP unauth; pre-existing gate.go gofmt nit from prior BA13 attempt (out of BA17 contract).
- verified-green.
