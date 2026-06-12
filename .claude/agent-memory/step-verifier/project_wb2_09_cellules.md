---
name: wb2-09-cellules
description: WB2-09 verification — /v2/cellules bounded-contexts federation twin + screen, verified-green after 1 biome fix
metadata:
  type: project
---

§WB2-09 (after WB2-08) /v2/cellules = LES CELLULES (bounded contexts, KRD §49) + Pact. Une grosse app n'est jamais un seul Kernel: FÉDÉRATION de petites cellules; par cellule sa GRILLE niveau×facette (rollup Σ, REUSES WB2-05 buildGrid no fork), liens INTERNES composes↓, CONTRATS depends_on/Pact → autres cellules.

TWIN lib/v2/cellules.ts PURE: CellKernel extends KernelNode+cellId; buildFederation PARTITIONNE par cellId + roule buildGrid par cellule (invariant cardinal total=Σ Cell.count=#kernels, partition exacte aucune spec perdue/dupliquée); withContracts classe depends_on inter-cellules en CellContract (composes interne JAMAIS contrat, fromCell≠toCell, cible non-pinnée §41 ignorée), contracts initialised [] in buildFederation then filled by withContracts; internalComposes/cellContracts/findCell totales; syntheticFederation 3 cellules(checkout/order/inventory) 10 kernels 7 composes internes 2 depends_on contrats @v1 SYNTHETIC(OQ).

MIROIR vitest+fast-check 8/8: déterminisme/CONSERVATION(total + grille per-cell Σrows=Σcols=count)/PARTITION(seen exactly once, all placed, cells sorted)/rejet id vide/CONTRAT §49(2 contrats, 7 composes=0)/cible nue refusée/INTERNE/CANONIQUE(3 cells [checkout,inventory,order] total10 2 contrats drill-down).

SCREEN CellulesClient client-only useState selectedCellId+selectedCase: cell picker buttons drill-down→grid+internal composes+contracts; clic case→specs links /v2/anatomie/<id>; summary data-cell-count/contract-count/total. SLUG dédié DEDICATED_SLUGS={liens,cellules} excluded generateStaticParams + notFound() runtime (WB2-08 liens preserved).

VERIFIED-GREEN AFTER 1 CORRECTION: biome noUnusedFunctionParameters — internalComposes declared cellId but uses cellKernelIds (param kept for API symmetry w/ cellContracts) → prefixed _cellId, all callers positional so safe, committed 7dc4c8f. vitest cellules 8/8 lib/v2 87/87(79+8) tsc0 biome clean build13.0s /v2/cellules ƒ +/v2/[slug] ƒ i18n v2Cellules fr23==en23 all 23 page-keys present WALL clean(no fetch/mutation/kernel/mirrors/fitness imports, read-only projection) docs 3-layer docs.json:507-508 mint PASS docs-HEAD 46da354 origin/main in-sync both pages on origin; code HEAD pre-fix 9474ddd==origin then 7dc4c8f local.

SSR :3219 carries title+wall-note+summary(cell-count=3 contract-count=2 total=10 matching e2e)+3 cell buttons; drill-down/grid/case-detail hydrate CLIENT post-click (same WB2-04/05/06/07/08 scar, e2e needs live server, executor ran :3209). SCAR-RESPECTED: lsof -ti tcp:3219 returned EMPTY (process under different lookup) → fell back to `ss -ltnp | grep :3219 | grep -o pid=N` to get exact pid 1356018, killed only that, prod:3000 re-200 NEVER touched. OQ synthetic-federation/Pact-verify-S101/Linear-unauth/Mintlify-lag by-design; executor report ACCURATE (8/8 real, not the WB2-06 false-green scar).
