---
name: gv02-adoption-adr
description: GV02 ships ACCEPTED ADR 0037 (AGT adoption) pinned to code by a parity mirror; ADR is a projection of GV01 adoptionTable, wall stays garant; verified-green.
metadata:
  type: project
---

GV02 — the AGT (Microsoft agent-governance-toolkit) adoption decision graved as **ADR 0037 (Accepted)** + pinned to code by a determinism-first parity mirror.

**Shape:** decision-only step (no new enforcer). The ADR is a *projection* of the GV01 authoritative `adoptionTable` (`back/runtime/governance/adoption.go`), never a parallel claim. `adoption_adr.go` adds `ADRParity()`/`AdoptionADRSummary()`/`ADRNumber()`/`ADRAcceptanceStatus()` (pure/total). The parity mirror `adoption_adr_test.go` is the deterministic judge: `TestADRFile_AcceptedAndComplete` actually `os.ReadFile`s the published `.md` and asserts it exists ∧ `Status: Accepted` ∧ number ∧ each pillar+decision named ∧ "mur" present — so a Proposed/missing/incomplete ADR goes red (RED-first proven).

**Counts (the GV02 finding):** 4 adopt-as-augment (Merkle GV03, OWASP mirrors GV04, policy-as-YAML GV05, SRE GV06), 1 already-covered (identity BA18), 0 rejected. Rejected=0 by design — they re-implement each pillar in the wall's posture rather than import the AGT default-allow (tracked as OQ-GV02-rejected-zero, an idea→miroir→/goal refinement, NOT a residual).

**Invariant:** `WallIsGarant = (decision != reject)` on every row; the wall stays authoritative (AGT augments, never replaces). Front twin `lib/governance.ts` adds `adrParity`/`adrSummary`/`ADR_NUMBER`/`ADR_STATUS`; `/governance` panel gets a "Voir l'ADR d'adoption" control (testids show-adr/adr-adoption/adr-status/adr-adopt/adr-covered/adr-rejected/adr-row-*/adr-garant-*); e2e `tests/e2e/governance.spec.ts` GV02 describe (3 tests, action-capable).

**Verified-green:** Go test (uncached) + vet + gofmt clean; vitest 8 passed; tsc+biome clean; mint validate passed; docs pushed to steph-frtech/docs main commit be4bbfb (HEAD==origin/main). Wall held (no kernel/mirrors/fitness writes — pure projection). OQ-GV02-linear (linear MCP unauthenticated) is a non-blocking OpenQuestion per §11.

See [[gv01-owasp-crosscheck]] for the GV01 substrate this projects.
