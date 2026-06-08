---
name: s00-exec-contract
description: S00 root step — implementation_contract.md as versioned machine-readable step-execution law + /contract Workbench projection
metadata:
  type: project
---

S00 = the ROOT step: `docs/implementation_contract.md` encodes CLAUDE.md §6 per-step loop + granularity rule as ONE versioned (semver v1.0.0, kind=step-contract) machine-readable checklist (embedded YAML front block; prose table below is a projection, single-source rule pinned).

**Done-crit met & re-verified green:**
- 9 phases each {id,label,description,gate∈{computational,human}}; gate sequence [human,comp,comp,comp,comp,human,comp,human,comp]; ids = grill-with-docs/bdd-mirror-first/tdd/sensors-green/completeness/diagnose/ui-playwright/improve-architecture/artifacts.
- 5 granularity props ids = minimal/autonomous/visualizable/non-destructive/chainable.
- Mirrors PIN EXACT ids not just counts (no weak count-only proof — 5 wrong ids would fail).
- `tests/validate-contract.mjs` validator mirror 14/14 PASS exit 0 (Gherkin `tests/features/S00-exec-contract.feature` is the journey mirror it runs).
- `front/web/lib/contract.ts` = authoritative PURE parse+validate (determinism-first); `lib/contract.test.ts` reproducibility mirror vitest 18/18 (same input→same output, total on degenerate input).
- biome clean on all 6 S00 source files.
- `/contract` route projects parsed contract (version badge, phase rows+gate chips, granularity cards) + `ContractTeach.tsx` self-teaching tutorial(5 steps)+worked example = ui-completeness; e2e `tests/e2e/contract.spec.ts` 7 tests. S00 docs/data step = NO backend op → action-capable vacuously satisfied (no headless capability hidden).
- page.tsx reads `process.cwd()/../../docs/implementation_contract.md` (cwd=front/web → repo-root docs/) correct.
- i18n: all contract.* keys present fr+en.
- WALL held: zero kernel/mirrors/fitness writes (contract is DATA not engine truth).
- Docs: concept+internals s00-exec-contract.mdx exist, internals has 3 layers (Implémentation/Méta/Méta-méta), registered docs.json:67-68, mint validate PASS, .aidos-docs HEAD==origin/main d5c9a0b clean.

**OpenQuestions (by-design fwd-deps, NOT residual):** mirrors Postgres persistence=S06 (disk .feature is materialized form); Linear MCP unauth this session (S00 already Done prior sessions).

verified-green ZERO corrections (verification-only pass — artifacts pre-existed from prior sessions, all done-crit met).
