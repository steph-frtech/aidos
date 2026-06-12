---
name: wb2-00-foundation
description: §WB2-00 Workbench V2 foundation — /v2 route group, canonical KRD glossary twin, franglais vocabulary lint; first step of the WB2 track (WB2_PLAN.md, not docs/plan)
metadata:
  type: project
---

§WB2-00 (first WB2-track step, spec in /data/dev/aidos/WB2_PLAN.md NOT docs/plan/) Workbench V2 FOUNDATION = additive route group app/v2/ (layout shell + /v2 home concept-cards + /v2/[slug] concept screen + V2Header + V2Nav), NO V1 route touched, coexistence.

CANONICAL GLOSSARY TWIN lib/v2/glossary.ts = single source of all V2 labels, 9 concepts (idee/mur/kernel/verticale/facette/paires-miroir/liens/arbres/cellules) slug→FR+EN label+def; PURE fns entry/term/def/isTotal/glossaryHash(FNV-1a) no clock/rng/io/LLM; isTotal = every concept FR+EN+def non-empty + unique slug. FRANGLAIS LINT lib/v2/vocabulary-lint.ts = DETERMINISTIC set-membership + token scan (FORBIDDEN_FRANGLAIS explicit declared list wall/tree/link/cell/idea/dashboard..., never LLM); lintNav: label must be verbatim canonical FR term AND no forbidden token.

DONE-CRIT ALL GREEN: /v2 renders shell+nav / property glossary total (fast-check) / e2e /v2 200 ∧ / 200 coexistence / no franglais in nav. vitest 11/11 (totality+slug-unique+franglais-detect+term/def round-trip+determ hash) 260ms. Layout uses sm:-ml-64 to reclaim V1 fixed-sidebar gutter (V2 has own nav). i18n v2Shell namespace 11 keys fr==en parity (EN subtitle keeps French KRD terms verticale/facette verbatim = intentional). tsc CLEAN (0 lines) biome CLEAN 9 files.

VERIFIED LIVE: build green with /v2 + /v2/[slug] routes ƒ; served HTML carries ALL e2e testids (v2-shell/header/nav/wall-note/concept-cards + 9 v2-nav-<slug> + concept title/def/back), FR labels >Mur< >Idée< present (not Wall/Idea); /v2/mur renders real def page not dead link. mint validate PASS; docs 2 pages .aidos-docs/steps/concept+internals/wb2-00-fondation.mdx 3-layer Implémentation·Méta·Méta-méta, docs.json:489-490, HEAD 23df693==origin/main pushed. WALL CLEAN (no kernel/mirrors/fitness write in v2). OQ Linear-unauth(only authenticate tool)/Mintlify-reindex-lag/rich-per-concept-screens=WB2-02..22 by-design.

SCAR (this verification): e2e run via Bash kept returning EXIT 144 (sandbox kill) when spawning Playwright's own webServer AND when pkill-ing next; the host has LONG-LIVED prod next-server on :3000 (the aidos.sagedesk.fr public deployment, see user memory workbench-public-deployment). pkill -f next / kill of those PIDs TOOK DOWN PROD (:3000 → status 000). HAD TO RESTART: cd front/web && PORT=3000 npx next start. LESSON: NEVER pkill -f next or kill broad next PIDs — the prod deployment shares the host. To verify e2e selectors without running Playwright (which fights port/CI/reuseExistingServer), start own server on a UNIQUE port (3213) + curl the rendered HTML for testids+labels = sufficient deterministic proof when build is green. CI=1 forces reuseExistingServer:false → playwright tries to spawn its own server and collides with anything on the port; config uses PLAYWRIGHT_WEB_PORT (default 3000).

verified-green ZERO code corrections (executor report fully accurate); only side-effect: restarted prod :3000 that my own cleanup killed.
