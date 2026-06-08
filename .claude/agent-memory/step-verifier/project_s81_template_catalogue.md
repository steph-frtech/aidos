---
name: s81-template-catalogue
description: S81 verification — curated template catalogue (ecommerce/CRM/booking) as content-addressed bundles; verified green, zero corrections
metadata:
  type: project
---

S81 = the CURATED TEMPLATE CATALOGUE (§24.6, app-builder EPIC 7): curated starter apps (ecommerce/CRM/booking) packaged as content-addressed Bundles (entities+relations+behaviors incl. app-auth token+mirrors+operations+UI sources), instantiated into a deterministic GREEN monster-free StarterProject = the S56 duplicate-from-template; Fork = duplicate at a stable phase. Instantiate/Fork/Validate/Completeness/Propose are PURE, WroteKernel ALWAYS false (the wall).

**Done-criterion (property): instancier un template ⇒ projet de départ déterministe et vert (Kernel vert, miroirs présents, aucun monstre) — GREEN.** template_property_test.go (rapid): same (id,slug)⇒byte-identical StarterProject+StarterID; every curated bundle Validate-green (closed scalars/cardinalities, known relation targets) + Completeness monster-free (no truth-without-mirror via truthNames=entities+operations+behaviors, no orphan mirror); WroteKernel=false; starter.Auth byte-identical to the ONE S80 appauth.ExpandAppAuth(slug). Fixture: ecommerce/shop-app→3 entities+app-auth gate (viewer→logout DENIED, editor→ALLOWED reusing S80); Fork deterministic-by-phase (same phase idempotent, diff phase differs); Propose lands DRAFT→APPLIED via changeset.Apply(SpecHasMirror).

**app-auth NO-fork (single-function law):** bundle declares "app-auth" as a behavior TOKEN; Instantiate calls the ONE appauth.ExpandAppAuth. New pure accessor appauth.ExpandAppAuthEntities()=declaredEntities() (fresh copy, canonical order) lets a relation target the auth User entity without re-encoding the shape — legit accessor, NOT a 2nd expansion. entityNames(b) folds in app-auth entities so relation-target validation passes.

**CROSS-LANG byte-identity INDEPENDENTLY verified:** I recomputed Go BundleID(ecommerce)=a29fcea8f530ac838c047ffdc1cc1fd5c183ad17576d8d1007072a4ff27678b5 and StarterID(ecommerce/shop-app)=8d9f02770d87f7e5ccbebcab2d389425f55b4de14bd1540d22c868e9a3d22eb3 — BYTE-IDENTICAL to the front-twin pins AND the e2e data-starter-id assertion. TS canonicalEncode (sorted keys, authBody re-keys camelCase→snake_case expansion_id/wrote_kernel) == records.Canonicalize/Hash.

**Sensors all green:** go test templates+appauth+mcp/templates all ok; gofmt -l clean; go vet clean; go build ./... clean. MCP back/mcp/templates 4 PURE tools (list/get/instantiate/fork) NO SQL/exec/pgx, writes nothing. Front vitest lib/templates.test.ts 10/10; tsc only-pre-existing err=lib/behavior-capture.test.ts:101 `Cannot find name Kind` (S67 RECURRING noise, NOT S81); biome 5 files clean. e2e tests/e2e/templates.spec.ts 3/3 PASS vs live :3000 (route 200, done-criterion test asserts data-starter-id==Go 8d9f0277… byte-identical). Panel testids resolve (tpl-${id} dynamic, ${testId}-result built; grep undercounts template-literals). i18n 116==116 top, templates ns 20==20, 4303==4303 nodes. nav:142 wired.

**Wall:** front actions.ts INSTANTIATE+FORK are dry-run value computations write-NOTHING; Propose wraps Instantiate into DRAFT changeset.Open never APPLIED; MCP writes nothing. wall-grep CLEAN (only hit=page.tsx doc comment describing the wall).

**Docs:** internals 3-layer (Implémentation:9 / Méta:44 / Méta-méta:52), concept+internals registered docs.json:231-232, mint validate PASS, pushed steph-frtech/docs main 631f4c4 0-ahead 0-behind.

**OpenQuestions (by-design forward-deps, NOT residual):** Linear MCP unauthenticated (consistent prior memory) — S81 issue not programmatically set Done; starter-project ROW (duplicate-from-template / new DAG root + namespaced content-store) written BELOW the line by S56 project/DAG store path, not this pure package; mirrors materialized as Go test files (mirrors Postgres schema back-filled by S06).

verified-green ZERO corrections.
