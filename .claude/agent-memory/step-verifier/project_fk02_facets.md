---
name: fk02-facets
description: FK02 (FKE piste, after FK01) — the 8 canonical KRD facets (F/I/S/B/R/V/M/X) collapsible facet-set + validator + content-addressed signature; verification notes
metadata:
  type: project
---

FK02 — « les 8 facettes déclarées ». Second FKE-piste step (BUILDER_PLAN.md, after FK01). Spec: ROADMAP-fke FK02, KRD FKE-1.3 (the orthogonal facet axis paired with FK01's truth_level vertical axis, FKE-1.4). ADR 0044.

**What it ships (PURE, write-NOTHING wall-respecting):**
- `back/kernel/facets/facets.go` — eight canonical lenses F/I/S/B/R/V/M/X as a CLOSED set (Facet string type, facetName/facetOrder/softFacets declared never derived). `Instance{Facet,HasIntent,HasProofPair}`; collapsible `FacetSet{KernelID,Instances}`. `Validate(FacetSet)→Result` PURE TOTAL: refuses no-F (`ErrNoFunctionalFacet`), empty facet (`ErrEmptyFacet`), declared facet missing proof pair (`ErrMissingProofPair`=monster), unknown (`ErrUnknownFacet`), duplicate (`ErrDuplicateFacet`). X is SOFT (§13.6): missing pair → `Advisory:true`, never flips Valid. Issues emitted in canonical F→X order. `Canonicalize` totally orders WHOLE Instance (facet rank, then letter, then flags) so order-independent EVEN with duplicates (real design point flagged by executor: stable sort alone breaks order-independence under duplicate facet — fixed). `Hash`=SHA-256 over canonicalized instances, KernelID-excluded.
- Migration `kernel_facet_baseline.sql` ADDITIVE expand-only: NULLable `facet` text col + CHECK pinning the 8 letters on BOTH kernel.truth AND mirrors.mirror. No GRANT change (wall). Single-letter col = PRIMARY lens; full set lives in JSONB body.

**3 done-criteria ALL PROVEN (ran):**
1. kernel sans facette fonctionnelle refusé — `ErrNoFunctionalFacet`, fixture + rapid `TestValidate_NoFunctionalInvalid` + e2e validity-k-nof=false.
2. facette déclarée sans ses paires = monstre — `ErrMissingProofPair`, fixture + e2e validity-k-nopair=false; soft X advisory (`TestSoftX_NeverBlocks`).
3. round-trip content-adressé — rapid `TestHash_OrderAndKernelIndependent`+`TestHash_SensitiveToDeclaration` + Testcontainers `TestFacetSemanticDiffIsAdd`.

**Verification result: PASSED, ZERO corrections.**
- gofmt -l CLEAN (no scar this time — unlike FK01/S104/S109 struct-align scar), go vet clean, go build ./... exit0 broad prior-green intact.
- Property ROBUST -count=2 -rapid.checks=3000 0.217s (not flaky). Test forms: property (5 invariants) + fixture (10 done-criteria cases incl. empty-set total) + integration (migration_roundtrip Testcontainers PG16-alpine 4 cases: expand-only/8 letters accepted/out-of-enum CHECK-rejected/SemanticDiff add). facets pkg test 7.2s (testcontainers).
- WALL grep CLEAN on mcp/facet/main.go + front/web/app/facets/ + lib/facets.ts (no INSERT/UPDATE/Exec/pgx/GRANT/db.). MCP aidos-facet = 3 PURE read-only tools (validate/hash/facets), main_test green.
- TS twin lib/facets.ts matches Go authoritative (djb2 display-only digest, Go SHA-256 authoritative; same validate logic + canonicalize total order). vitest 8/8, tsc clean (no facets errors), biome 6 files clean.
- Panel FacetsPanel.tsx useActionState filter-select+filter-submit, octuor section, per-kernel validity badge 🟢/🔴 + signature. h1=t("title")="Les 8 facettes déclarées"/"The 8 declared facets" matches e2e regex. i18n fr total 5073==en 5073, facets ns fr 21==en 21, facets.facet 8 letters. nav WorkbenchHeader:199 { href:"/facets", k:"facets" }. Playwright 4/4 GREEN live :3000 (route HTTP 200).
- Docs 3-layer (Implémentation/Méta/Méta-méta all present) concept+internals fk02-facets.mdx, docs.json:457-458, mint validate PASS, HEAD 6f9eb57 == origin/main pushed clean (steph-frtech/docs).

**OpenQuestions (by-design, NOT residual):**
- OQ-FK02-LINEAR: Linear MCP unauthenticated (only authenticate/complete_authentication exposed) — issue not movable. Recurring across ALL steps (FK01, S110-S117…). Record, don't fail.
- OQ-FK02-PERSIST (bootstrap §6): the actual WRITE of facet/facet_signature onto a record flows through the privileged aidos CLI at the legal door (idea→mirror→/goal→ChangeSet); agent stays SELECT-only. FK02 delivers pure validator + additive column + content-addressed signature = its full contract. Forward-dependency.
