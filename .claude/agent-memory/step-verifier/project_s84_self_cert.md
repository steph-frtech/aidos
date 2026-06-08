---
name: project-s84-self-cert
description: S84 computational self-certification battery (back/runtime/buildloop/selfcert) — verifier notes
metadata:
  type: project
---

S84 = Runtime COMPUTATIONAL self-certification of the build loop. The deterministic SENSOR BATTERY (back/runtime/buildloop/selfcert) gating EVERY diff S83's loop takes. Seven CLOSED SensorKind (types/lint/unit/fixture/property/pact/archfit). GateGreen = PURE anti-passthrough conjunction (missing OR red ⇒ not green). Certify materialises a missing sensor RED + attaches BUILD_LOOP_SENSOR_RED. Runner port = the ONE impure surface (shells tsc/vitest/go test/dep-cruiser), injected+scripted. CertifiedSensors adapter plugs battery into S83 buildloop.Sensors FAIL-CLOSED (red battery ⇒ Run returns nil ⇒ no red-set mirror green ⇒ loop CANNOT declare green ⇒ blocked before green). ToStopSensors projects to goal.IsClosed (non-gameable Stop, reused verbatim).

DONE-CRITERION (fault-injection): a diff breaking an arch boundary OR a Pact contract reddens its sensor and blocks the iteration before green. PROVEN: fixture TestArchBoundaryBreak…/TestPactContractBreak…/TestEachSensorKindCanBlock/TestLoopCannotDeclareGreenWhenABatterySensorIsRed (end-to-end through buildloop.Drive) + property TestAnySingleRedSensorBlocks + 4/4 Playwright e2e live :3000 (clean→green, archfit break→BUILD_LOOP_SENSOR_RED blocked, pact break→blocked).

TWO CORRECTIONS:
1. gofmt -w mcp/self-cert/main.go (struct-tag comment misalignment — RECURRING gofmt-on-touched, go test/vet do NOT run gofmt).
2. TestToStopSensorsIsFailClosed FAILED uncached on counterexample redset=["A","A"]: asserted `len(stop)!=len(redSet)` but ToStopSensors keys a map by mirror ref so DUPLICATES COLLAPSE (len(stop)=1 vs len(redSet)=2). The MAP DEDUP IS CORRECT (a mirror can't carry two states) — fixed the TEST to compare against count of DISTINCT entries. Executor's "go test ok" was cached/lucky-seed. RECURRING: a rapid property that draws a slice (SliceOfN of small strings) and asserts a map's len == slice len is wrong whenever the code keys a map by the drawn element — compare against distinct count. Always run go test -count=1 for property mirrors.

MCP back/mcp/self-cert: 3 PURE tools (selfcert_certify/gate/kinds), no SQL, writes NOTHING (returns Battery as VALUE). Wall held. Front lib/self-cert.ts byte-twin (gateGreen/certify/redSensors/toStopSensors), vitest fast-check 6/6. actions.ts certifyDiffAction = pure compute, writes nothing (truth via propose→ChangeSet S85). Panel useActionState-bound, all e2e testids present (certify-form/sensor-row-*/green-*/detail-*/certify-submit/gate-badge/block-code/red-sensors/battery-sensor-*).

CORRECTION 3 (reachability): /self-cert route was NOT in WorkbenchHeader nav (last was build-loop:144) — a ui-completeness reachability gap. ADDED nav entry {href:/self-cert,k:selfCert} after build-loop + nav.selfCert i18n key in fr (Auto-certification) and en (Self-certification). i18n re-balanced 4127==4127, selfCert ns 19==19, all 19 referenced page+panel keys present.

go test -count=1 buildloop+selfcert+mcp ok, gofmt/vet/build clean. tsc clean (self-cert/header). biome: only pre-existing useKeyWithClickEvents nav-backdrop warning (already biome-ignored, unrelated). Front full lib suite 1207/1207 (prior green intact).

Docs: concept+internals (3 layers Implémentation:9/Méta:50/Méta-méta:60), docs.json:237-238, mint validate PASS, HEAD==origin/main 6aef619 pushed.

OQ by-design forward-deps (NON-blocking): real Runner adapter (shell-out over sandbox) lands with live build console S86; LLM/ContextRouter/sandbox injected as ports; truth-write via propose→ChangeSet S85; Linear MCP unauth (could not flip S84 to Done).

VERDICT: verified-green AFTER 3 corrections (gofmt, property-test dup-redset assertion, nav reachability + nav i18n).
