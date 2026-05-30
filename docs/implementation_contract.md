---
contract:
  version: "1.0.0"
  kind: step-contract
  description: >
    Per-step loop and granularity rule every AIDOS implementation step must obey.
    This is the machine-readable law; the Workbench projects it; the harness checks it.
  phases:
    - id: grill-with-docs
      label: "/grill-with-docs the intention first"
      description: >
        One intention, ≤5 scenarios; sharpen the ubiquitous language;
        update CONTEXT.md / ADRs. You do NOT start a step without it.
      gate: human
    - id: bdd-mirror-first
      label: "Write the BDD mirror first"
      description: >
        Gherkin / property / fixture, stored in the mirrors schema, materialized
        for the runner. It is red. That red IS the /goal.
      gate: computational
    - id: tdd
      label: "/tdd to code"
      description: >
        red → green → refactor, outside-in, in this step's own package only.
        You do NOT code without it.
      gate: computational
    - id: sensors-green
      label: "Sensors green at each diff"
      description: >
        PostToolUse hook. Self-certify on the computational gate only.
      gate: computational
    - id: completeness
      label: "Completeness check"
      description: >
        The layer has its living mirror? No monster? No orphan mirror?
        Else Stop blocks.
      gate: computational
    - id: diagnose
      label: "/diagnose before finishing"
      description: >
        Isolate any failing sensor, propose the fix. You do NOT finish a code
        step without it.
      gate: human
    - id: ui-playwright
      label: "UI: Workbench route + Playwright e2e"
      description: >
        Add the Workbench route (don't touch existing routes) + a Playwright e2e
        for the visualization. A UI is required at every step.
      gate: computational
    - id: improve-architecture
      label: "/improve-codebase-architecture"
      description: >
        You do NOT move to the next step without it.
      gate: human
    - id: artifacts
      label: "Create needed artifacts per §5"
      description: >
        Skill / Hook / MCP / Migration — only where the §5 answer is yes.
        A new artifact may only ADD a guardrail, never remove one.
      gate: computational
  granularity:
    - id: minimal
      label: "Minimal"
      description: "One verifiable capability per step."
    - id: autonomous
      label: "Autonomous"
      description: "Testable alone; mocks what doesn't exist yet — never the reverse."
    - id: visualizable
      label: "Visualizable"
      description: "A Workbench UI route + a Playwright e2e."
    - id: non-destructive
      label: "Non-destructive"
      description: "Never silently breaks what came before."
    - id: chainable
      label: "Chainable"
      description: "Leaves a stable phase the next step consumes."
---

# Implementation Contract — Step Execution Law

**Version:** `1.0.0` | **Kind:** `step-contract`

This document encodes the per-step loop (CLAUDE.md §6) and granularity rule as a
single versioned, machine-readable checklist. It is the root law every subsequent
AIDOS implementation step is checked against. The Workbench projects it; the harness
reads the embedded YAML block above.

> **Single source rule:** the YAML front block is the canonical encoding. The prose
> below is a human-readable projection of the same data. Never diverge them; bump the
> semver on any change, via a ChangeSet (DRAFT → APPLIED, append-only).

---

## Per-step loop (9 phases)

Each phase has a stable `id`, a human-readable `label`, and a `gate`:
- `computational` — the harness can evaluate this without human review.
- `human` — requires a human decision or judgement call.

| # | id | Label | Gate |
|---|---|---|---|
| 1 | `grill-with-docs` | /grill-with-docs the intention first | human |
| 2 | `bdd-mirror-first` | Write the BDD mirror first | computational |
| 3 | `tdd` | /tdd to code | computational |
| 4 | `sensors-green` | Sensors green at each diff | computational |
| 5 | `completeness` | Completeness check | computational |
| 6 | `diagnose` | /diagnose before finishing | human |
| 7 | `ui-playwright` | UI: Workbench route + Playwright e2e | computational |
| 8 | `improve-architecture` | /improve-codebase-architecture | human |
| 9 | `artifacts` | Create needed artifacts per §5 | computational |

---

## Granularity rule (5 properties)

Every step is:

| id | Property | Rule |
|---|---|---|
| `minimal` | Minimal | One verifiable capability per step. |
| `autonomous` | Autonomous | Testable alone; mocks what doesn't exist yet — never the reverse. |
| `visualizable` | Visualizable | A Workbench UI route + a Playwright e2e. |
| `non-destructive` | Non-destructive | Never silently breaks what came before. |
| `chainable` | Chainable | Leaves a stable phase the next step consumes. |

---

## OpenQuestions

- **Mirror persistence:** the `mirrors` Postgres schema record for this mirror
  (reflects=S00-exec-contract, test_kind=journey, cert_language=gherkin, liveness=live)
  is conceptual at S00. Persistence is wired by a later Archive/Mirror step (S06).
  The disk copy at `tests/features/S00-exec-contract.feature` is the materialized form.

---

## Change history

| Version | ChangeSet | Summary |
|---|---|---|
| 1.0.0 | none (root step, additive only) | Initial contract — S00 |
