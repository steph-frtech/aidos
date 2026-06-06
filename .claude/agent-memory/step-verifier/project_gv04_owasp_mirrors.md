# GV04 — OWASP Agentic Top-10 compliance mirrors (fault-injection per risk)

Status: DONE (green ∧ verified by step-verifier). Mirror step.
Verifier re-check: Go test ./runtime/governance green, gofmt+vet clean; Vitest 19 passed; GV04 Playwright e2e 3/3 green (run from repo root); mint validate passed; docs commit fb585d8 on origin/main. Anchors confirmed real (GateAction axes, MayWrite, ArbitrateGated, Propose, agentrun.Verify/BuildLedger). TS twin is behaviour-faithful (declared governed-green/injected-red), NOT byte-equal to Go — correct per the twin pattern.

## Deliverable
- `back/runtime/governance/compliance.go` — 10 `ComplianceMirror` (AAI01..AAI10), each
  anchored to the REAL enforcer (GateAction axes egress/path/capacity/skill/budget,
  agentlayer.MayWrite, agentimpl.ArbitrateGated, agentlayer.Propose, agentrun.Verify).
  Each: `CheckGoverned()` GREEN on current state, `CheckInjected()` RED under fault-injection.
  `Mirrors()/MirrorFor()/CheckCompliance()/CheckInjected()`. Pure/total, below the line.
- `back/runtime/governance/compliance_property_test.go` (rapid, RED-first) — OnePerRisk
  (completeness), AllGreenOnCurrentState, EachTurnsRed (load-bearing: injected suite Compliant==0),
  Reproducible.
- Front twin `front/web/lib/governance.ts` (mirrors/checkCompliance/checkInjected/complianceAudit)
  + Vitest `governance.test.ts` (19 passed, 4 new GV04).
- `GovernancePanel.tsx` control `verify-compliance` EXECUTES `complianceAudit()`; themed+bilingual.
- `tests/e2e/governance.spec.ts` — 3 new GV04 tests; full suite 12 passed.
- Mintlify: 2 « Pour moi » pages live (steph-frtech/docs main, commit fb585d8):
  steps/concept/gv04-owasp-mirrors.mdx + steps/internals/gv04-owasp-mirrors.mdx; docs.json;
  mint validate + broken-links clean; verified live via mcp__mintlify-aidos.

## Key design notes
- GV01 owasp.go is a REPORT (declared matrix). GV04 is EXECUTABLE mirrors — distinct artifact.
- Determinism-first: the JUDGE is the enforcer itself (single-sourced), never an LLM.
- AAI09 injection models the BA28-equiv degradation (rebuild without chain anchor hides a deletion),
  matching the GV03 property's load-bearing distinction.
- AAI10 budget: EffectiveTokensCap=min(b.Tokens,h.MaxLLMTokensPerGoal). Governed caps=1000 (deny);
  injected caps=unbounded (escape). A ZERO cap would deny (min=0) — must use a huge value to remove.
- AAI03: action must be a recognized deterministic structure: bash rg ... (ToolSearch) + RequestedLLM.

## OpenQuestion (non-blocking)
- Linear MCP requires OAuth (only authenticate available, no issue tools). Could not move the
  GV04 issue to In Progress/Done non-interactively. Best-effort per CLAUDE.md §11.
