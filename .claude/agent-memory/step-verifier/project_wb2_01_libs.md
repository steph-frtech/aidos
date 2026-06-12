---
name: wb2-01-libs
description: §WB2-01 (after WB2-00 V2 foundation) — install + smoke-prove the V2 frontend libs, deterministic twin registry + reproducibility mirror; verified green zero corrections
metadata:
  type: project
---

§WB2-01 (SECOND WB2-track step, after [[wb2-00-foundation]]) installs the V2 frontend libs into @aidos/web and PROVES each mounts via a smoke bench.

Fact: done-criteria = next build green with all libs + one smoke e2e per lib (tree/XState machine/React Flow mount) + bundle sizes noted (lazy per route). ALL MET.

LIBS installed (front/web/package.json): react-arborist ^3.10.1, react-aria-components ^1.18.0, xstate ^5.32.0 + @xstate/react ^6.1.0, react-hook-form ^7.78.0, zod ^4.4.3, @xyflow/react ^12.11.0. bpmn-js DELIBERATELY NOT installed — deferred OpenQuestion (ADR 0053), declared in registry `deferred:true`, listed-not-mounted. NOT a residual issue (by-design).

DETERMINISM-FIRST twin: front/web/lib/v2/lib-smoke.ts = single source of the smoke list (LIB_SMOKES registry, mountedSmokes/smokeById/isTotal/smokeRegistryHash FNV-1a). PURE, no React/DOM/LLM. Reproducibility mirror lib-smoke.test.ts vitest+fast-check 5/5 GREEN (totality, six-required+bpmn-deferred, five-mounted, smokeById round-trip, determ hash). The irreducible mount/DOM proved by e2e — each truth to its mirror form.

BENCH: /v2/lab (app/v2/lab/page.tsx server + LabClient.tsx client). Each lib has one sonde via next/dynamic(ssr:false) in app/v2/lab/smokes/ (Arborist/Aria/XState/RhfZod/Flow). Reachable from V2Header `v2-lab-link`. Hash shown `v2-lab-hash`. Deferred bpmn shown `v2-lab-deferred`. Cards `v2-lab-card-<id>` for all 5 mounted.

e2e tests/e2e/v2-lib-smoke.spec.ts 7 tests: header-reachable / arborist tree (text "Produit") / aria button click→count 1 / xstate repos→actif→"tours : 1" / rhf+zod ab→error, valid→ok / flow diagram (text "Idée") / bpmn deferred + coexistence (/v2/lab 200 ∧ / 200). All testids verified present in components AND in served HTML.

VERIFICATION (verified-green, ZERO corrections): vitest 5/5, biome 11 files clean, tsc exit 0 (no pre-existing errors), next build "Compiled successfully 12.2s" /v2/lab dynamic ƒ + /v2 + /v2/[slug]. i18n v2Shell fr==en 14 keys (added labTitle/labSubtitle/labRegistryHash/labDeferred). WALL clean (only a comment says "kernels" future-step, no truth-write, authority=below). Served-HTML on UNIQUE port 3417 (NOT prod 3000) carries header lab-link + all lab shell testids + 5 cards + bpmn-js deferred; /v2/lab 200 + / (v1) 200 coexistence; hash label renders. SCAR-RESPECTED: started `next start -p 3417`, killed by EXACT pid, prod :3000 re-confirmed 200 after.

DOCS: .aidos-docs/steps/concept/wb2-01-librairies.mdx + internals (3 layers Implémentation·Méta·Méta-méta) docs.json:491-492, mint validate PASS, HEAD 4cc4f4d == upstream (pushed).

OQ (non-blocking, by-design): Linear MCP unauth (OAuth+restart); Mintlify search-index lag (pages live on push, index async); bpmn-js deferred to later WB2 step; @hookform/resolvers not installed (rhf sonde uses zod safeParse manually — sufficient for mount/validate smoke, resolver at WB2-03 real wizard). VERDICT PASSED.
