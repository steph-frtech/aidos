---
name: wb2-08-liens
description: WB2-08 /v2/liens — the six §17/§41 typed links between kernels (React Flow), filter by edge-kind, pinned @version
metadata:
  type: project
---

§WB2-08 (after WB2-07 DAG) /v2/liens = LES SIX LIENS §17/§41 between kernels (React Flow, ADR 0053) read-only filter-by-edge-kind + click edge→pinned detail + pan/zoom.

TWIN lib/v2/links.ts PURE: LINK_KINDS CLOSED set of 6 families (composes/depends_on/supersedes/provenance/triggers_binds/mirrors) reused/aliased from S17 lib/links.ts canonical via KIND_TO_CANON (composes→projects_to, depends_on→contracts_with, supersedes+provenance→derives_from, triggers_binds→triggers+binds, mirrors→mirrors). Ref{id,version} isPinned(both non-empty), Link{kind,from,to}, LinkGraph{nodes,links}. validate→err-string (unknown kind / from not pinned / to not pinned — a NUDE to is itself a monster §41). allLinksPinned, filterByKind (exact subgraph, unknown kind→zero links no error), countByKind, kindToCanon, refString. syntheticLinkGraph()=8 kernels 8 links each target content-pinned @vN (SYNTHETIC — forward-dep to live store, OQ same prior WB2). No LLM/clock/rng.

MIRROR lib/v2/links.test.ts vitest+fast-check 8/8: PINNING(validate accepts iff kind∈closed∧from,to pinned) / nude-to ALWAYS refused / canonical graph fully pinned + 6 families present / filter = EXACT subset (partition, no loss/dup) / closed set (unknown→[]) / determinism / kindToCanon / refString.

SCREEN: page.tsx Server (getTranslations v2Liens) → LinksClient "use client" React Flow. nodesDraggable=false nodesConnectable=false Handle isConnectable=false selectable=false (wall at UI level). Filter buttons (action-capable, the done-criterion "filter by edge type") + click edge→openEdgeId→detail (kind/from/pinned-to @version/canon, read-only). Deterministic node positions (index grid, no rng). KIND_STROKE uses --color-* tokens (no hardcoded hex except fallbacks).

ROUTING FIX: 'liens' is a glossary slug WITH a dedicated route → excluded from app/v2/[slug] generateStaticParams AND notFound() at runtime in catch-all (DEDICATED_SLUGS) so static segment primes. Additive non-regressing — /v2/mur (non-dedicated) still renders concept-title+def, /v2/idee 200.

VERIFIED-GREEN ZERO corrections: vitest links 8/8, lib/v2 79/79, tsc0, biome0 (6 files), build green /v2/liens ƒ + /v2/[slug] ƒ (now dynamic due to notFound exclusion), i18n v2Liens fr21==en21, WALL clean (only doc-comment matches for kernel/mirrors, no fetch/mutation, UI no-write enforced), docs 3-layer (Implémentation:9/Méta:34/Méta-méta:41) docs.json:505-506 mint validate PASS, HEAD 8ba4f81==origin/main both pages on origin.

SSR :3208: all testids (title/wall-note/canvas/filter-all/filter-composes/filter-mirrors/summary) present, data-link-count=8 default. React Flow EDGES hydrate CLIENT (same WB2-04/05/06/07 scar — e2e needs live server, executor ran :3205). Coexistence /,/v2,/v2/arbres,/v2/dag all 200. SCAR respected: killed only 3208 pid via lsof, prod :3000 re-confirmed 200.

OQ by-design: synthetic graph (forward-dep live store), Linear-unauth, Mintlify index reindex-lag. Executor report fully accurate.
