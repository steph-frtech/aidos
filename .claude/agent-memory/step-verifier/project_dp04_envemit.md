---
name: dp04-envemit
description: DP04 .env.example + scripts emitter — verified green ZERO corrections; 2nd consecutive clean DP biome (scar pre-suppressed); Go hashes re-derived by verifier match TS pins byte-for-byte
metadata:
  type: project
---

DP04 = additive Targets `env-example` + `start-scripts` (EPIC A, after [[dp03-composeemit]]). Done-criteria ALL MET, verified live by me, ZERO corrections.

**Shape:** back/runtime/envemit — pure (no DB import at all): mergeEnv folds the ENGRAVED /data/dockers order global→bp-default→bp-secrets→deploy-time (last write wins, deploy-time APP_NAME overrides), MergeOrder()/Mode() pure (0600 .env*, 0755 *.sh), Emit = HashManifest(DP02/S02) → render (.env.example sections per layer sorted keys + start.sh down→up + start_with_rebuild.sh down→build --no-cache→up, protected header, back/gen/<app>/), reuses composeemit.Artifact + secretstore.EnvVar/ScanEmission (S91 verbatim) + generators.Drifted. 9 rapid laws incl. ×100 Example repro, DP03↔DP04 coherence (ComposeEnvRefs ⊆ env keys), zero secret values (placeholders <<from-secret-store>>/<<set-at-deploy-time>>), refusal closed DP02 codes, 1-byte drift, double content-address, chmod. TS twin lib/env-emit.ts pins 3 GO output hashes + source hash 8011728e…62acdd2; 11 vitest tests incl. L8 fault-injection (scanner fires on real fake leak hunter2 — intentional, in vitest only, never in e2e spec).

**Verified live (all re-run by me):** go test -count=1 fresh green; gofmt/vet clean; **I re-derived the Go hashes myself via a throwaway test — ENV 0f8a5147…, START 10525a91…, REBUILD 8a1b598c…, SOURCE 8011728e… all match the TS/e2e pins exactly** (strongest twin-parity check yet on a DP step). vitest 2091/2091 (baseline 2080 intact); tsc 0; biome 7 files clean (re-run despite executor claim — really clean, noTemplateCurlyInString pre-suppressed on L4∀ title); i18n stackEmit fr40==en40. Build → next start :3210 → 24 passed (env-emit 4 + stack-emit 4 + v3 16); :3210 killed (NOTE: `kill $(cat pid)` of nohup npx didn't kill the next-server child — had to kill the ss-listed pid directly; check ss after kill). Prod :3000 root 200; **prod /stack-emit is 404 — EXPECTED: prod runs a pre-DP03 build, untouched ≠ regressed; don't flag**. Docs 2 pages 3 layers, docs.json:567-568, mint validate+broken-links clean (re-run), 6b6c701==origin/main, live 200/200. Code 10ac7fb+2824d60 pushed, 0/0, working tree clean; rapid .fail artifact committed in 10ac7fb then REMOVED in 2824d60 (gone from disk).

**Re-verified 2026-06-13 (HEAD 50d233e post-DP10, executor correctly did NOT redo work):** envemit core files unchanged since 2824d60 (only app/stack-emit extended additively by DP05); full live re-run by me ZERO corrections — go test fresh green, gofmt/vet clean, biome 7 files clean, vitest 2162/2162, build → :3210 → env-emit 4 + stack-emit 4 + v3 16 = 24 passed, ss-pid kill clean, prod :3000 200, mint validate + live docs 200/200, branch 0/0. NOTE: v3 spec file is `tests/e2e/v3.spec.ts` (NOT workbench-v3.spec.ts — a wrong glob silently runs fewer tests, count the passed total).

**User-requirements:** `validation_humaine` STILL 0 hits in front/web (4th consecutive DP step — vacuously non-regressed); infra/dev-preview intact; v3 16/16 green.

**OQ (by-design, never residual):** OQ-DP04-secret-keys (manifest declares no arbitrary secret keys yet; engraved = global PAT + APP_SECRET_* per connector scope; per-env declarations DP06+, vault wiring DP32); Linear MCP unauth (recurring — only authenticate tool exposed); prod redeploy of /stack-emit route owned by a later deploy step.

**Pattern:** when a TS twin pins Go hashes, re-derive them with a throwaway `zz_*_test.go` printing the hashes (cp in, run, rm) — cheap and conclusive.
