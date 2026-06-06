---
name: el01-necessity-spike
description: EL01 first compound-du-besoin SPIKE — proves a flat free-text box is insufficient vs a top-down BesoinGraph; confined /spike/besoin, no truth write, harvest→draft Idea
metadata:
  type: project
---

EL01 — first EL-track (compound-du-besoin) SPIKE (roadmap row EL-E1, ROADMAP-compound-requirements.md), distinct from EL00 (emitted-target parity, commit f93b550).

**What it proves:** the SAME need (S46 demo checkout) captured two ways — top-down BesoinGraph (product→journey→view→control→action→operation→entity, journey/view = NoEmit rungs that seed anchors) with a per-level forcing gate, vs a flat free-text box (the current S64 "capturez votre idée" control). Verdict COMPUTED (never declared), no LLM, against DECLARED floor MinIdeaGain=3.

**Verdict:** GO — BesoinGraph emits 5 ordered/resolved/typed/anchored Ideas (+4 over flat prompt's lone untyped blob), DeltaResolved+5, DeltaTyped+5, DeltaAnchored+4, graph ordered/flat not, reproducible 100× (TestReproducible recomputes + compares hashes). Falsifiable: NO strict-dominance ⇒ NO-GO and track stops (roadmap spike-gate, encoded in Decide() rationale branches).

**Confinement (the wall):** module `aidos.spike/besoin` is standalone (go 1.22), grep confirmed NEVER imports back/ (only strconv/testing stdlib). Persists nothing — Harvest() returns a DraftIdea{HasMirror:false, HasVersion:false, Status:"draft", Proposes:"product"} modeling the /harvest proposal, no kernel/mirrors/fitness write. Commit 1c9b32f touched only spike/, front/web/, tests/e2e/, .aidos-docs/ (grep "kernel|mirror|fitness|.sql" on --stat matched only PROSE in commit body, not file paths).

**Front (action-capable, though spike — report announced it so verified):** TS twin lib/besoin-necessity.ts mirrors Go probe NUMERICALLY (vitest asserts numIdeas=5/flat=1/delta=4/ordered/draft — full parity, not count-only). BesoinNecessityPanel takes labels as PROPS (no headless t() inside panel — good). Route /besoin-necessity, nav wired in WorkbenchHeader (k:"besoinNecessity"). i18n: 36 keys besoinNecessity namespace, FR-only==EN-only==empty (balanced), all page t() keys present in both, no unused.

**Sensors all clean:** go test 8/8 (incl TestReproducible, TestGraphHashStable, TestHarvestIsDraftNoTruth), gofmt clean, go vet clean, tsc --noEmit clean, biome clean, vitest 8/8, Playwright e2e 1/1 on :3000 (semantic asserts: GO badge, 5 vs 1, +4, draft). NO sensor scar this step (report accurate, gofmt scar did NOT recur).

**Docs:** 2 Mintlify pages (steps/concept + steps/internals with 3 layers Implémentation·Méta·Méta-méta), registered in docs.json (2 hits), mint validate passed, HEAD==origin/main (a9d65f6) pushed.

**OpenQuestions (forward-deps, NOT residual):** OQ-EL01-1 v1 grammar scope (saga/temporal/globalinvariant out, EL02); OQ-EL01-2 richness metric is a COUNT proxy, real gate = EL07 CanDescend + EL08 ShrinkOptionSpace (spike proves mechanism not final metric); OQ-EL01-3 wall path captured at EL14/EL15 via idea-intake; OQ-EL01-4 Linear MCP unauth (only authenticate exposed).

verified-green.
