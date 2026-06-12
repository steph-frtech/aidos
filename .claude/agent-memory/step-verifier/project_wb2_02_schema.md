---
name: wb2-02-schema
description: §WB2-02 verification — /v2 home becomes the interactive KRD schema diagram; done-crit met, zero corrections
metadata:
  type: project
---

§WB2-02 (after WB2-01, WB2 track spec WB2_PLAN.md NOT docs/plan) — the /v2 home page becomes THE interactive KRD schema diagram (React Flow read-only @xyflow/react): idée(entree)→MUR(/goal)→kernel+verticale(verticale)→facette+paires-miroir(axes)→liens+arbres+cellules(structure). Each block = a real Next <Link href=/v2/<slug>> anchor (navigates pre-hydration, no click race — robust+accessible; executor's onNodeClick had hydration race, fixed to <Link>).

DETERMINISM-FIRST twin lib/v2/schema.ts PURE: SCHEMA_NODES(9 canonical glossary slugs × 5 tiers)/SCHEMA_EDGES(10)/nodePosition(pure layout y=tierRank×ROW_STEP, x centers tier)/nodeLabel(slug,locale)=term(glossary) NO hardcoded strings/isSchemaTotal/schemaHash(FNV-1a 8hex). No LLM/clock/rng/IO.

DONE-CRIT BOTH MET: (1) e2e — each block navigates to its screen: all 9 /v2/<slug> render v2-concept-title+v2-concept-def HTTP 200, nodes are <Link> anchors. (2) property — labels from glossary not hardcoded: fast-check proves nodeLabel(slug,locale)===GLOSSARY[slug][locale].label FR+EN + totality/no-dead-link/no-orphan(covers all 9 glossary slugs)/determinism. vitest 10/10 GREEN.

VERIFIED GREEN ZERO CORRECTIONS: vitest 10/10, tsc exit0, biome 6 files clean, next build "Compiled successfully 12.6s" /v2 ƒ + /v2/[slug] ƒ + /v2/lab ƒ. i18n v2Shell fr17==en17 fr-only=[] en-only=[] (schemaHeading/schemaSubtitle/schemaHash added FR+EN, schemaHash="empreinte du schéma"/"schema hash" matches e2e regex). WALL clean (only a comment mentions kernel, pure read-only projection no truth-write).

REACT FLOW IS CLIENT-ONLY: SchemaDiagramMount uses dynamic(import SchemaDiagram, ssr:false) — Next 16 forbids ssr:false in Server Component so isolated in a Client Component wrapper. Consequence: v2-schema-diagram + v2-schema-node-<slug> testids DO NOT appear in SSR HTML (rendered client-side); but v2-schema-hash + "empreinte du schéma" + all 9 v2-concept-<slug> fallback-list Links ARE server-rendered. Verified e2e selectors via curl on UNIQUE port 3418 (per SCAR: never collide prod :3000); diagram testids confirmed present via the spec's own Playwright run (executor ran 9/9 GREEN on PLAYWRIGHT_WEB_PORT=3100).

SCAR RESPECTED: started fresh next start -p 3418, killed by EXACT lsof pid (never pkill -f next — that took down prod historically); prod :3000 /v2 re-confirmed HTTP 200 after cleanup. Playwright config reuseExistingServer reuses long-lived prod :3000 (stale build) → V2 e2e MUST run on unique PLAYWRIGHT_WEB_PORT.

docs concept+internals(3-layer Implémentation/Méta/Méta-méta) docs.json:493-494 mint validate PASS HEAD 31ab036==origin/main pushed. OQ by-design: Linear-unauth(WB2-02 issue not moved, needs OAuth+restart)/mintlify-crawl-lag(WB2-02 not yet indexed, pages live)/no docs/plan/WB2-02.md(WB2 track uses WB2_PLAN.md). executor report fully accurate.
