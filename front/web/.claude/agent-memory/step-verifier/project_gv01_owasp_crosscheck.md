---
name: gv01-owasp-crosscheck
description: GV01 cross-check step — OWASP Agentic Top-10 coverage matrix + AGT adoption verdict as declared pure tables in back/runtime/governance; the deliverable is a REPORT, not an enforcer.
metadata:
  type: project
---

GV01 is the first GV-series step: a CROSS-CHECK/audit, not a new enforcer.

- Deliverable = a deterministic conformity REPORT, not code that gates: `back/runtime/governance/owasp.go` (closed 10-risk coverage matrix) + `adoption.go` (5 AGT pillars decision table). Both are DECLARED, CLOSED tables; Coverages/Count/Verdict/Residuals/PillarVerdicts are pure/total. No DB, no LLM auditor — determinism-first.
- Mirror: `owasp_property_test.go` (rapid) — totality (all 10 risks mapped), honesty (residual+step EXACTLY when status≠covered), wall-never-abandoned, reproducibility. Front twin `lib/governance.ts` verbatim + `governance.test.ts` (fast-check).
- Real audit finding: 8/10 covered, 2/10 partial (AAI09 ledger-not-Merkle→GV03, AAI10 no error-budget→GV06). Verdict Stop=false (residual gaps justify the GV roadmap). These residuals are the STEP'S OWN deliverable, deferred to later GV steps — NOT verifier residual_issues.
- UI: /governance action-capable panel ("Run the cross-check" executes the twin), nav meta group, themed+bilingual; e2e tests/e2e/governance.spec.ts (3, green). Heading regex matches both FR/EN titles.
- Wall: governance is pure read-only data — its kernel/mirrors/fitness mentions are PROSE in the table, no writes. Cited enforcer identifiers (MayWrite, ToolAllowed, MintToken, ReplayMatches, Redact, CheckBudget) all exist in the real surface — audit is grounded, not fabricated.
- Verified-green: gofmt/vet/test, tsc, vitest 5, playwright 3, mint validate, docs pushed (92a5d0e). OpenQuestions: Linear MCP unauth (§11 best-effort), Mintlify index propagation lag.
