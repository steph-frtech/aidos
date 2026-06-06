---
name: project-el08-cascade
description: EL08 anchor-cascade verification — the compound PROVEN (frozen anchors narrow lower OptionSpace + anti-overwrite ChangeSet); verified-green
metadata:
  type: project
---

EL08 (`back/runtime/besoin/cascade.go` + TS twin `front/web/lib/besoin-cascade.ts`) turns EL07's per-level `CanDescend` verdict into the COMPOUND PROVEN. Four pure/total/deterministic fns:

- **AnchorsAbove(graph, level)** → frozen (NodeResolved only) SOURCE rungs STRICTLY above, in descent order via `Levels()` walk (insertion-order-independent); bands/non-grammar → nil. `IsAnchored` = immediate-prev resolved.
- **Descend(graph, fromLevel, meta)** → opens fromLevel+1 ONLY when `CanDescend.enough`; premature → refusal stacking gate BlockReasons + new `CANNOT_DESCEND_LEVEL_NOT_RIGHTSIZED`; non-destructive value-semantics (§9), emits `constrains` edge + drafting next node; leaf entity OK with Opened="".
- **ShrinkOptionSpaceCascade(graph, level)** → CascadeShrink{Before,After,Shrink,Enumerable,OQ}. Before=full EL06 declared set; After=|selects∩choices| under a FROZEN anchor; **After<Before STRICTLY** under real frozen anchor; **Shrink=0** when not resolved OR selects-nothing (compounding-not-happened go/no-go); non-enumerable operation→entity + leaf → positive sentinel(1) (carried OQ from EL06, never fabricated count). Pinned by rapid `TestProp_Cascade_StrictShrinkUnderFrozenAnchor` (k of N: k<N⇒strict, k==N⇒no narrow, k=0⇒Shrink 0) + reproducible 20×.
- **ReopenAnchor(graph, level, changeSet)** → anti-overwrite §9: frozen+no-CS → refused `BESOIN_ANCHOR_OVERWRITE`; with CS → recorded decision, node→drafting, prior body PRESERVED (append-only) + provenance/OpenQuestion cite the changeset; unfrozen node needs no CS.

`BesoinBlockCode` additions local, reuse blockreason.BlockReason SHAPE (no kernel-registry pollution, EL07 pattern). Wall STRUCTURAL: cascade.go imports only encoding/json, fmt, blockreason — NO pgx/INSERT/UPDATE/sql; determinism check NO time.Now/rand/llm/http.

Go: gofmt/vet clean, `go test ./runtime/besoin/` PASS (fixture RED→GREEN + rapid repro). TS twin tsc clean, vitest 13/13. Prior-green siblings (grammar/thresholds/candescend) 32/32 intact. e2e 4/4 on :3000 (right-sized descends / frozen-vacant CANNOT_DESCEND / shrink Before=7 After=2 Shrink=5 strict vs drafting Shrink=0 / reopen refused-without-CS then OK cs-42). Action-capable /compound-besoin-cascade — 4 controls run twin, no headless, nav wired `besoinCascade` under brain. i18n parity 2843==2843 (report's 3033 STALE), 35 besoinCascade keys + nav present BOTH locales. Docs fd4414d HEAD==origin/main, concept+internals 3 layers, mint validate passed.

SCAR: biome-clean-lie recurred AGAIN ([[feedback-biome-clean-report-lie]]) — report claimed "biome clean" but 3 `useOptionalChain` warnings in besoin-cascade.ts (lines 64/186/195, all `!x || x.foo !== Y` → `x?.foo`). Autofix SEMANTICALLY SAFE here (undefined?.status !== "resolved" is true → same branch), same as EL07. Fixed all 3 + committed (fe6a1f5). NOTE EL07 fixed 1, EL08 had 3 of the same pattern — the twin author keeps writing `!node || node.x !== Y` guards that biome flags.

FwdDep: operation→entity OptionSpace non-enumerable = carried OQ from EL06 (sentinel, never count). Linear MCP unauth (only authenticate/complete_authentication surfaced) = OQ. verified-green.
