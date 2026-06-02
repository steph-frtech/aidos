---
name: s22-redwave
description: S22 red wave — pure Impact/Enqueue (transitive closure of stale links via S17 Resolve, mirror-first, load-bearing gates propagation) + PostKernelChange hook INSERT into runtime.red_work_queue; verified-green
metadata:
  type: project
---

S22 — la vague de rouge (KRD §42/§74/§98/§49.4). A kernel bump reddens its mirror FIRST then projections; the wave IS EXACTLY the set of stale links, computed never hunted.

- **Core** `back/runtime/redwave/redwave.go`: pure `Impact(bumped, edges, heads) → RedWave` (fixpoint transitive closure: an edge propagates iff its `to` is already red ∧ `links.Resolve != green` ∧ `LoadBearing`; ordered mirror-first by layerRank then target id — byte-stable) + `Enqueue(wave, waveID) → []RedWorkItem`. REUSES S17 `links.Resolve` (never forks staleness). Cosmetic edge (LoadBearing=false) never propagates (§112; ADR 0020). No bump ⇒ empty wave. Closed Reason/Status/Layer types.
- **Mirrors**: fixture + rapid property (6 invariants: determinism, wave==stale-links, mirror-first, cosmetic-no-propagate, |wave| rows, no-panic-totality) + fast-check front twin `lib/red-wave.test.ts` (10/10). Reproducibility mirror both planes.
- **Hook** `back/hooks/postkernelchange/`: harness-invoked `rehash && fire-red-wave --from-mirror` → `FireRedWave` (pure wiring over Impact/Enqueue) → INSERT into runtime.red_work_queue. NOT an aidos verb, no MCP. Testcontainers fault-injection genuinely runs (round-trip 3.5s, append-only UPDATE/DELETE/TRUNCATE refused for agent, TestWallHoldsForRedWave, reason CHECK) — Docker up.
- **Migration** `red_work_queue_baseline.sql`: append-only runtime.red_work_queue BELOW waterline (same zone as S05/S07/S12); agent role INSERT+SELECT only, REVOKE UPDATE/DELETE/TRUNCATE; S04 truth GRANTs untouched. Status transitions (claim/lease) are the scheduler's job = later step.
- **CLI** `back/cmd/aidos/impact.go`: read-only `aidos impact <id>` over a deterministic catalogue of the canonical §42 bumps (same graphs as fixture); reuses redwave.Impact, never enqueues.
- **UI** `/red-wave`: action-capable (select a bump + fire → runs pure impact, renders items mirror-first grouped by layer). Read-only / no truth write ⇒ ui-completeness vacuous on write-path (truth-write via propose→ChangeSet S20). Panel at `front/web/components/RedWavePanel.tsx` (NOT app/red-wave/components — report mislabeled the path; both page+panel exist). i18n redWave.* + nav.redWave present FR+EN.
- **Verified green**: build/vet/gofmt clean; Go tests + Testcontainers PASS; vitest 10/10; Playwright 3/3 (--workers=1 and in isolation); mint validate clean; docs 2 pages (3 layers) registered docs.json + pushed (cce415e); Linear AID-40 Done.
- OpenQuestions (by-design forward deps, non-blocking): OQ-S22-1 runtime bump-source feed (store/DAG SELECT graph+heads after bump) = S02/S24; scheduler §49.4; projection regen §98; stable-phase gate §43 (S23); red-wave MCP.

E2E FLAKE NOTE: default parallel run flaked once on the cosmetic test (`red-wave` testid not visible — cold-compile/parallel race on first route nav), GREEN single-worker + isolation. Harness artifact, not a defect. See [[playwright-port-targeting]] — this run the live dev server was on :3000 (not 3100); confirm the serving port each time.
