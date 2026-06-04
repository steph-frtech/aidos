---
name: ba21-rolematching
description: BA21 deterministic role-matching + anti-famine starvation detector over the BA20 scheduler — verified-green pattern + biome non-null-assertion scar
metadata:
  type: project
---

BA21 adds deterministic ROLE-MATCHING to the BA20 scheduler (`back/runtime/scheduler/matchrole.go` + TS twin `front/web/lib/scheduler.ts`).

Shape:
- `MatchRole(item, layer, agents)→(ref,ok)`: pure, total. Among FREE agents whose declared Role == the layer's required role (`layerRole` declared map: mirror→bdd-writer, else executor), lex-smallest Ref wins. Unknown layer / no free matching agent ⇒ ("",false). Never a wrong-role fallback (the wall), never a panic, never a busy agent.
- `LayerRank`/`HeadOf`: mirror-first total order (mirror 0 < projection 1 < operation_action 2 < button 3, unknown=4), ties by item id. Same rule as redwave's unexported layerRank, re-stated as a declared exported total order.
- `DetectStarvation(head, agents, ticksWaited, threshold)→(StarvationSignal, bool)`: anti-famine gap E3. still_red signal iff head unmatchable ∧ ticks≥threshold; silent if matchable (any wait) or threshold≤0. PURE — ticks SUPPLIED, no clock (impure tick driver is BA22). Signal has NO Version/Mirror (runtime event, wall-correct).

Wall: MatchRole reads only Candidate (projection of kernel.agent_layer SELECT BA20 opened), writes nothing — only chooses the owner Claim stamps. Not a 2nd privileged writer.

Forward-deps (OpenQuestions, NOT residual): BA22 = impure tick driver (the only shell carrying `now`); BA28 = on-ramp consuming still_red; Postgres mirror persistence back-filled at S06.

SCAR: report claimed "biome clean" but `lib/scheduler.test.ts:186` had a `lint/style/noNonNullAssertion` WARNING (`h1!.layer`). Biome's auto-fix (`h1?.layer`) would be WRONG (changes layerRank arg to undefined). Fixed with an explicit `if (h1 === undefined) throw` guard before the deref. Verifier always re-runs `biome check` on touched front files — warnings count, and the auto-fix is not always semantically safe.

Verified: gofmt/vet clean, go test ok, go build exit 0; tsc clean, biome clean (after fix), vitest 548/548 full; e2e BA21 3/3 + BA20 3/3 on :3000 (served new markup); 13 i18n keys both fr+en; mint validate passed, pushed origin/main 896f0c9. Linear MCP unauthenticated = OpenQuestion. Verified-green.
