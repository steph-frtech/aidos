---
name: gv03-ledger-merkle
description: GV03 tamper-evident Merkle audit ledger over agentrun events — closes the AAI09 gap GV01 found (BA28 detected ALTER but not DELETE/REORDER); pure below-line, RED-first mirror, /governance panel control.
metadata:
  type: project
---

GV03 lands the tamper-evident (Merkle) audit ledger adopted by GV02's ADR 0037, closing the OWASP AAI09 gap GV01 measured.

`back/runtime/agentrun/ledger.go` — DecisionBOM/DeriveBOM (projection of AgentRun, drift-free), LedgerEntry chains prior root into each row (entry_hash=Hash(index‖bom), root=Hash(prior_root‖entry_hash)), Append (copy-on-grow append-only), Root, Verify (deterministic judge w/ TamperKind), BuildLedger. Pure/total, reuses records.Canonicalize+Hash (ADR 0007). BELOW the line: runtime audit telemetry, no version/mirror field (like the AgentRun it records).

**Why the chain matters:** BA28 content-addresses EACH run, so an ALTERED row re-derives a different id — but no cross-row chain ⇒ a DELETED or REORDERED run was invisible. The Merkle fold makes root a content-address of the WHOLE ordered ledger.

**Delete-detection nuance (legit by-design):** the property mirror asserts "root change OR red verify" — a TAIL deletion is caught by the tip-root delta vs a trusted anchor; a NON-TAIL deletion breaks a downstream row's stored index/prior_root (red Verify). At least one always fires. This is canonical tamper-evidence, not a gap.

**RED-first proven by fault-injection:** degrading chainRoot to drop prior_root + entryHash to drop index (the BA28-equivalent per-row-only scheme) turns TestLedger_Delete/Reorder RED; restoring makes them green. The cross-row chain is load-bearing.

Front twin `lib/governance.ts` GV03 block: own compact synchronous browser-safe SHA-256 + canonicalize (no Node crypto). Twin digest need NOT byte-match Go — what's pinned is the INVARIANT (tamper ⇒ red), hash-primitive-independent (per-plane reproducibility, like FN05/FN06). Vitest+fast-check mirror (full file 15 passed). /governance panel control data-testid=verify-ledger EXECUTES ledgerAudit() (pure client-side, no network/truth-write — wall respected). e2e tests/e2e/governance.spec.ts (9 passed: 3 GV01+3 GV02+3 GV03).

Verified-green: gofmt/vet clean, go build ./... clean, ledger tests green, governance pkg green, mint validate+broken-links clean, docs commit 6496250 on origin/main.

OpenQuestions (non-blocking): linear-server MCP unauthenticated (issue 'GV03 · …' not movable); governance MCP exposing ledger_verify/ledger_build deferred to GV06 (audit-panel step), GV04 lands OWASP conformance mirrors, GV05 policy-as-YAML, GV06 SRE + audit panel + /self-test gate.
