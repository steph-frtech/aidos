---
name: project-s115-first-app-funnel
description: S115 verification — /first-app rewritten from confetti FirstAppBuilder simulation to a REAL deterministic onboarding funnel (template-first default, blank-idea advanced)
metadata:
  type: project
---

S115 (app-builder ROADMAP) — `/first-app` REWRITTEN from the retired local SIMULATION (confetti `FirstAppBuilder`, deleted) into a guided-but-REAL onboarding funnel. PURE COMPOSITION write-NOTHING.

**What:** `lib/first-app-funnel.ts` = a PURE TOTAL deterministic state machine threading FunnelInput through EXISTING twins: `templates.instantiate` (S81 green starter, content-addr starterId) + `capture-idea.contentAddress`/`captureIdea` (ideaId) + `grilling-loop.knownVerdict` + `build-loop.isClosed`/`terminate`/`noProgress` (non-gameable Stop). Steps closed-ordered: signup→project→idea→grill→goal→build→deploy. Two paths ONE engine: template-first DEFAULT (instantiate green S81 starter→modify, acceptance gate already green so stranger SUCCEEDS) + blank-idea ADVANCED (free-text, NO starter). funnelRedSet = starter mirrors (7 for ecommerce) + 1 modification mirror = 8 template-first / 1 blank-idea. deploySubdomain content-addr off slug+anchor 16-hex; UI renders `{subdomain}.deploy.aidos.app`. Each checklist row done IFF its real artefact exists (honest stops: empty email→signup, fuzzy/bad verdict→grill, non-green build→build).

**Done-crit PROVEN:** Playwright-bdd 6/6 GREEN live:3000 route-200 — template-first new account reaches deployed app driven by real engine (each step tied to real artefact starter:/idea:/green/subdomain) + blank-idea tested SEPARATELY (project: not starter:) + honest non-green build→no deploy + empty email→blocks signup + panels deep-linked + reachable from home hero (first-app-link→/first-app).

**Sensors:** vitest 11/11 (fast-check reproducibility same-input→byte-identical + never-deploy-without-green property). tsc: 1 PRE-EXISTING err behavior-capture.test.ts(101) `Cannot find name 'Kind'` committed 013664c S64-S68 UNTOUCHED by S115 — NOT a residual issue. Wall grep CLEAN (no INSERT/Exec/db/pgx/fetch/fs in lib or actions.ts). i18n fr4972==en4972 EXACT, firstApp 107==107, funnel 32 keys + stepNames. Docs 3-layer (Impl:9/Méta:38/Méta-méta:44) docs.json:297-298 mint validate PASS, .aidos-docs HEAD==origin/main (steph-frtech/docs, s115 concept+internals committed clean).

**Correction applied:** 1 cosmetic biome line-width format on tests/e2e/first-app.spec.ts (toContainText regex wrap) — RECURRING biome-format scar, `--write` fixes mechanical non-blocking. Otherwise green.

OQ by-design: Linear MCP unauth (only GitHub MCP surfaced, no mcp__linear-server__*); funnel computes DRY-RUN artefact values, actual below-the-line ROWs (starter-project/captured-idea/deployment) written by project/idea-intake/deploy store paths owned by their own steps. Leftover firstApp.steps.sN.{title,body,gesture,doneWhen} i18n keys remain valid JSON (panelLabel still used by deep-link panels). All by-design / non-blocking.

verified-green AFTER 1 cosmetic biome fix.
