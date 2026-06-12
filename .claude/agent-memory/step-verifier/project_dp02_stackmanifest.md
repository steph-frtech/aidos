---
name: dp02-stackmanifest
description: DP02 StackManifest engraved as Kernel source — verified green after 1 biome fix; DP01 noTemplateCurlyInString scar RECURRED as predicted (e2e literal ${APP_DATA_PATH})
metadata:
  type: project
---

DP02 = StackManifest engraved as first-class Kernel SOURCE (EPIC A, after [[dp01-stack-spike]] GO). Done-criteria ALL MET, verified live by me.

**Shape:** back/kernel/stackmanifest (pure, no I/O) — closed sets 14 roles (server…interpreter, RoleWorkflow=Windmill NEVER Temporal) + 9 profiles (SPEC-stack-2026); Validate pure total (7 codes incl. the 3 done-criteria refusals); CanonicalBody/HashManifest/NewRecord via records.Hash(records.Canonicalize) — S02 reused never forked; Example() pinned alphashop (server+postgres+interpreter sidecar, volume env-var ref APP_DATA_PATH, traefik_default external). Migration kernel_stack_manifest_baseline.sql additive: 5-col KRDCore table, GRANT SELECT + REVOKE writes for aidos_agent. Testcontainers mirror: round-trip byte-identical + agent INSERT REFUSED (permission denied) = the wall proven in-DB. TS twin lib/stack-manifest.ts pinned byte-for-byte: GO_CANONICAL_BODY full bytes + GO_MANIFEST_HASH 8011728e…62acdd2 (hash also pinned in e2e spec). Route /stack-manifest: seeded manifest + content address + closed sets + ONE control « valider & hasher » (server action = pure measure, writes nothing, zero fetch/SQL).

**Verified live:** go test 5.1s ok (gofmt/vet clean); vitest 2070/2070; tsc 0; e2e build → next start :3210 → 20 passed (stack-manifest 4 + v3 16), prod :3000 untouched (200), :3210 killed. Docs 2 pages 3 layers, docs.json:563-564, mint validate+broken-links clean, 6e72c43==origin/main, live 200/200. No hardcoded URL/secret in DP02 code (sagedesk appears nowhere; volumes are env-var refs); no Coolify/Drizzle; no parasite binaries; git clean.

**SCAR CONFIRMED (2nd occurrence, predicted by DP01):** executor claimed clean but 1 biome `noTemplateCurlyInString` warning (exit 0) on tests/e2e/stack-manifest.spec.ts:56 — literal `${APP_DATA_PATH}` assertion. Fix = single-line `// biome-ignore lint/suspicious/noTemplateCurlyInString: reason` (commit 3177565, pushed). **Pattern holds: EVERY DP step rendering/asserting compose env-var placeholders trips this rule; always re-run biome on changed files even when executor says clean.**

**User-requirements non-regression (DP contract):** `validation_humaine` still has ZERO hits in front/web (vacuously non-regressed); `<projet>-dev.sagedesk.fr` lives in infra/dev-preview + traefik/dynamic/aidos-dev-preview.yaml (commit 139e224), NOT in front/web lib — DP02 touched neither; v3 e2e 16/16 green proves the flows. Re-check both each DP step.

**OQ (by-design, never residual):** per-environment projection (URL/secret resolution) = EPIC B/DP06+; project_id+environment scope (S15 reuse) posed at DP06 per roadmap; S16 authority reused via unchanged idea→mirror→/goal door; real kernel.stack_manifest write stays CLI-role only; Linear MCP unauth (recurring — only the authenticate tool exposed).
