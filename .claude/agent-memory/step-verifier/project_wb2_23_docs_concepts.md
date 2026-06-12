---
name: wb2-23-docs-concepts
description: §WB2-23 verification — Docs V2 concepts section (docs-only step, no code/twin/e2e); franglais-lint standard for KRD terms
metadata:
  type: project
---

§WB2-23 (after WB2-22) = DOCS-ONLY step (the Docs V2 pendant of the Workbench V2). NO Workbench route, NO twin lib/v2, NO e2e, NO code — so ui-completeness / determinism-first / wall / sensors DO NOT APPLY (nothing to reach, no truth-write). Its OWN done-criteria are exactly three: (1) `mint validate` clean (2) `mint broken-links` clean (3) chaque concept a sa page + aucun terme franglais.

DELIVERABLE: new Mintlify section `concepts-v2/` (NEW URLs, old `concepts/*` kept intact lines 30-39 docs.json — non-regressed, concepts/glossary still 200). 13 files = 1 index + 12 concept pages in schema order: idée·mur·kernel·verticale·facette·paires-miroir·liens·arbres·cellules·gestes·AI Lab·émission-déploiement. Registered docs.json:44-56 under NEW group "Les concepts (V2)" beside existing groups under the "Pour les futurs utilisateurs" tab (no new tab). Index = CardGroup cols=2 with 12 cards + "La suite" chained nav on each page.

VERIFIED-GREEN ZERO CORRECTIONS: mint validate→success + mint broken-links→no broken links (BOTH re-run live by me). 13 pages HTTP 200 live on aidos.mintlify.app (concepts-v2 + idee + emission-deploiement sampled) + concepts/glossary still 200 (old section non-regressed). Commit 33b8d88 on origin/main, local 0/0 ahead/behind. Content quality HIGH + faithful to KRD: verticale §23 seven levels correct (produit→…→entité), paires-miroir 3 mirror forms correct (Gherkin/Godog·propriété rapid/fast-check·fixture), mur defense-in-depth correct. FR prose vous, canonical terms verbatim, BDD≠base Warning present.

FRANGLAIS-LINT STANDARD (IMPORTANT for future docs steps): the done-criterion "aucun terme franglais" is satisfied when running PROSE is clean of casual anglicisms. The lint hits that ARE acceptable: (a) bilingual `keywords:` frontmatter arrays (idea/idée, wall/mur, cell/cellule, facet/facette — intentional SEARCH-only pairs) (b) load-bearing KRD/technical terms that CLAUDE.md AND the existing concepts/ baseline themselves use verbatim in French context: kernel, miroir, cliquet, mur, grill, goal, spike, monstre, fallback, headless, ui-completeness, blast radius, Traefik, content-addressed, DAG, WhyTree, SemanticDiff, BesoinGraph, app-builder, QD. These are NOT franglais — they're the ubiquitous language. blast radius appears in baseline concepts/fke.mdx:207 + CLAUDE.md semantic-diff skill; headless/ui-completeness verbatim in CLAUDE.md §6/§7; fallback = the WB2-15 code feature name (fallbackPlacements) + CLAUDE.md "plain-Postgres fallback". DON'T flag these.

OQ by-design (non-blocking): Linear MCP unauthenticated (mcp__linear-server__* not in ToolSearch / needs OAuth+restart) → "WB2-23 ·" issue not flippable — RECURRING documented OQ across ALL WB2 steps, never a residual. docs/plan/WB2-23.md absent on disk (no docs/plan/wb2-*.md exist) → inline task spec authoritative, consistent with all prior WB2 steps.

EXECUTOR REPORT ACCURATE & COMPLETE: every claim verified true (13 files, docs.json registration, mint validate/broken-links clean, commit pushed, live 200, old section preserved, franglais=keywords+KRD-terms-only). FIRST docs-only WB2 step — no twin/screen/e2e/biome scars apply. Cleanest verification of the WB2 series (a docs-only step has no code surface to false-green).
