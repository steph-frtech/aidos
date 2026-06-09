---
name: s110-truth-approval
description: S110 EPIC3-auth multi-human scoped truth-write approval + content-addressed concurrency control — verified green after 1 cosmetic biome fix
metadata:
  type: project
---

§S110/E?-auth multi-human scoped truth-write approval flow + concurrency control (niveau vérité). PURE COMPOSITION write-NOTHING — composes authority.Decide (S63 gate: veto dominates / no-approval blocks / partial escalates / all admits, verified authority.go:206 + CodeVetoed:127 + CodeMissingAuthorityApproval:124) + changeset.Open(:197)/Apply(:218 nil→SpecHasMirror completeness gate) S20 envelope + CONTENT-ADDRESSED optimistic-lock on kernel head.

Propose(gate only, no head move) → Approve(two-phase: gate ∧ fresh head; override→admitted iff IsRecorded by+reason+ADR all present KRD §8 recorded-decision-not-bypass; p.Head!=liveHead→OutcomeStaleHead never last-write-wins §9) → ApplyConcurrent(moving head cursor, FIRST lands second+ STALE_HEAD, AppliedCount≤1 same-head anti-overwrite). appliedAt is an ARG (no clock/rng/I/O/LLM, pure).

done-crit PROVEN: fixture TestFixture_VetoBlocksApproval (veto→blocked+CodeVetoed+no head move) + TestFixture_OverrideIsRecordedWithProvenance (by=cto ADR-0016 → applied+StatusApplied) ; godog TestGodog_TwoConcurrentProposalsNoOverwrite (alice lands/bob STALE_HEAD pointing at new head/AppliedCount==1/StaleProposals==[bob]) + TestGodog_StaleProposalRelandsAgainstNewHead (re-run against moved head→lands, merge-semantic S25). +property mirror rapid (determinism/wall-no-land-without-admission-and-fresh-head/at-most-one-concurrent ∀2..6/veto-blocks-unless-recorded-override anti-Goodhart).

go test truthapproval+mcp 0.01s gofmt CLEAN vet clean broad-build OK prior-green authority(S63)+changeset(S20) intact 5.6s/12.3s. MCP aidos-truth-approval 3 PURE tools truth_propose/truth_approve/truth_apply_concurrent main_test 6 green wall-grep CLEAN (no INSERT/UPDATE/Exec/db/pgx). TS twin lib/truth-approval.ts FNV-1a envelopeId display-only (Go SHA-256 records.Hash authoritative) vitest 12/12 tsc-clean-for-truthapproval.

/truth-approval action-capable useActionState 3 controls (gate mode-full|veto|partial + override-toggle / concurrent-submit / reland-submit, reland landedHead computed from conc.decisions same client session) writesTruth=false noTruthWrite badges nav:148 truthApproval i18n fr31==en31 total 5171==5171 EXACT. Playwright 4/4 RAN live:3000 route-200 (veto→BLOQUÉ then override→APPLIQUÉ+ADR-0016 / applied-count==1 bob stale / reland→APPLIQUÉ). docs 3-layer Implémentation:9/Méta:40/Méta-méta:50 docs.json:287-288 mint validate PASS HEAD d924274==origin/main.

OQ by-design (NOT residual): Linear MCP unauth (S110 issue not moved programmatically — needs OAuth+restart) ; ChangeSet persistence into changesets Postgres rides S20 commit-gate (agent no GRANT — the wall) ; TS envelopeId FNV-1a display-only.

verified-green AFTER 1 COSMETIC FIX: removed unused `propose` import in lib/truth-approval.test.ts (biome FIXABLE noUnusedImports). Remaining biome warning = noNonNullAssertion d1.newHead! line 98 test-only (RECURRING non-blocking same scar S100/S104). Executor honestly flagged prompt Inputs block described S109 not S110 — actual build matches ROADMAP-app-builder.md:211 + done-crit HEADER (correct).
