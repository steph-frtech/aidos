---
name: dp05-stackemit
description: DP05 EmitStack(phase) full-bundle emitter — verified green after 2 corrections (biome scar RECURRED in new e2e spec + rapid .fail committed AGAIN); Go hashes re-derived == TS pins
metadata:
  type: project
---

DP05 = EmitStack(phase, manifest, ledger, disk) — pure composition of composeemit (DP03) + envemit (DP04) + NEW additive target `traefik-dynamic` (file-provider projection, `${VAR}` references only), after [[dp04-envemit]]. Done-criteria ALL MET; verified live; **2 corrections by me** (commit fce38f0, pushed 0/0).

**Shape:** back/runtime/stackemit — Bundle triple-addressed (PhaseVersion S23 · SourceHash S02 · BundleHash = records.Hash over "phase:<v>\npath:output_hash…"); PhaseFor = minimal vacuously-stable one-constraint cut; fail-closed gates ORDERED: PHASE_NOT_STABLE → OUT_OF_SCOPE (manifest unpinned, phase authoritative) → EMITTED_FILE_HAND_EDITED (NEW closed blockreason code, additive const+catalogue+codeOrder; first drift sorted-path blocks WHOLE bundle, generators.Drifted verbatim); InterpreterSidecar pure lookup (ADR 0040 D7, role=interpreter profile core, no profiles: block, INTERPRETER_PORT env key). 9 rapid laws incl. ∀×2 + Example×100 repro, scanner fault-injection, ledger+disk explicit inputs (S78 motif).

**Verified live by me:** go test stackemit+composeemit+envemit+blockreason+phases fresh green; gofmt/vet clean; **re-derived Go hashes via throwaway zz test — PHASE a26d29c7…, SOURCE 8011728e… (== DP02), TRAEFIK 8d08ebf5…, BUNDLE 19670343… all == TS pins** (phase-emit.test.ts). vitest 2103/2103 (baseline 2091 intact); tsc 0; i18n stackEmit fr52==en52. Fresh build → next start :3210 → **28 passed** (stack-bundle 4 + stack-emit 4 + env-emit 4 + v3 16); :3210 killed via ss pid; prod :3000 root 200 (prod /stack-emit still pre-DP03 build — expected, don't flag). Docs 2 pages 3 layers, docs.json:569-570, mint validate+broken-links clean (re-run), a46d359==origin/main, live 200/200. validation_humaine STILL 0 hits (5th consecutive — vacuous); no Temporal/Coolify/Drizzle; no hardcoded URL/secret; wall clean (action = pure measure, zero fetch/SQL).

**SCAR RECURRED ×2 (both fixed by me in fce38f0):**
1. **noTemplateCurlyInString in the NEW e2e spec** — executor suppressed it in lib/phase-emit.ts (biome-ignore-start/end) but FORGOT tests/e2e/stack-bundle.spec.ts (4 warnings on literal traefik/compose `${VAR}` assertions); claim "biome propre" FALSE. Fix = single-line biome-ignore with reason. Rule: on every DP step, biome-check the e2e spec EXPLICITLY, not just lib.
2. **rapid .fail artifact COMMITTED again** (testdata/rapid/…AllRefsHaveKeys….fail, 45 lines, in 04a1ef7 — same as DP04 where it needed a follow-up removal commit) and OMITTED from the report's files_changed. Fix = git rm. Rule: on every DP step with a written-red-first rapid mirror, run `git show --stat HEAD | grep -i fail`.

**OQ (by-design, never residual):** OQ-DP05-ledger (persistent emission ledger lands DP10+/DP25; today ledger+disk explicit inputs — gate fully mirror-proven); real multi-constraint DAG phase from S23/S96 plugs in without changing EmitStack; Linear MCP unauth (recurring — only authenticate tool exposed).

**Report accuracy:** core 100% accurate (laws, hashes, e2e counts, docs) EXCEPT "biome propre" false on the e2e spec + the committed .fail omitted from files_changed.
