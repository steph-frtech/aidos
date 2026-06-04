---
name: ba15-driveshell
description: BA15 = the deterministic LOOP SHELL Drive — pure shell over an injected ActionGenerator seam, gate-before-execute wall, Result computed by goal.IsClosed never self-reported
metadata:
  type: project
---

BA15 = `agentloop.Drive(DriveInput) -> (agentrun.AgentRun, error)`: the runtime loop SHELL below the line, modelled on `evolve.Evolve` (pure shell over an INJECTED generator).

- **Seam:** `ActionGenerator.Next(i)` hides the LLM; `ScriptedGenerator` is the deterministic mock (fixed slice). Real provider-backed generator wires in BA17 behind the same seam (OQ fwd-dep, non-blocking). BA14 arch-fitness already keeps SDK out of every pkg but provider/.
- **Loop order (matters):** close-check (goal.IsClosed) FIRST at top → exhaustion → meter.Tally → CheckBudget(breach⇒abandoned) → GateAction BEFORE execute → refused records Autorisee:false + continue (refusal is NOT terminal) → allowed applies effects + records. Final close-check after loop so a last allowed turn that closed lands green.
- **Wall holds:** GateAction (BA13) is the interceptor on the path; refused above-the-line write's SensorEffect NEVER applies (TestDrive_RefusedWriteEffectNeverLands_StaysRed proves it — mirror.a only flippable by the refused turn ⇒ stays red ⇒ still_red).
- **Result computed §8:** by goal.IsClosed over the EVOLVING sensor world, never self-reported. Property TestDrive_Property_GreenImpliesClosed re-derives final sensors from allowed effects and asserts IsClosed held.
- **Repro mirror:** drive_property_test.go — reproducible (DeepEqual twice + same id), total, wall-holds (no above-line write ever Autorisee:true via IsAboveWaterline), result in closed enum.
- **TS twin** lib/agentrun.ts drive()+isClosed() verbatim port (reuses gateAction/tally/checkBudget); id left "" (content-addressing lives in Go Record). Action-capable /agents control drive-shell/drive-run/drive-fault — fault toggle PREPENDS a back/kernel write proving wall.
- **button-count SCAR unaffected:** drive-run lives in AgentsPanel, NOT the impl-viewer (guard stays 7, see [[project_ba10_mandatoryhook]]). 53/53 e2e.
- Evidence: go test -count=1 ok, vitest 98/98, tsc 0, biome clean, e2e 53/53 on :3000 (served BA15 markup), mint validate ok, docs pushed 1b569f9 (HEAD==origin/main, 3 layers). Linear MCP unauth = OQ.
- verified-green.
