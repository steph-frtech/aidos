---
name: s15-truth-scope
description: S15 verification — TruthScope §13.7 qualifier, pure guard + content-address tie-in, verified green
metadata:
  type: project
---

S15 TruthScope (KRD §13.7 "aucune vérité n'est universelle par défaut") — verified PASS, zero corrections.

Done-crit MET: TruthScope constrains region/tenant/target/time_window/user_segment/environment (verbatim §13.7 enums region 4 incl "*"/target 5/segment 3/env 3, status 4 §44.2); membership DECIDABLE via PURE Validate(Record)+IsGlobal+IsEmpty; proven by rapid property mirror.

**Why:** §13.7 qualifier (one of 4 truth qualifiers §13.6), NOT a truth itself — qualifies WHERE/WHEN/FOR-WHOM. Rule binds ACTIVE truths only (§44.2): active ∧ empty-scope ∧ ¬IsGlobal ⇒ RejectedError "active-truth-without-scope"; explicit global region "*" (named escape hatch, NEVER implicit) passes; non-active exempt.

**How to apply:** back/kernel/scope/scope.go pure no-DB/clock/rng; RejectedError.Code="active-truth-without-scope" is S15-LOCAL kebab code NOT blockreason.Code enum member (correctly avoids §9 invent-ban). SerializeTruthBody rides scope INSIDE content-addressed body (S02 records.Hash) → id==version==Hash, rescope⇒new version. Migration kernel_truth_scope_baseline.sql adds NULLABLE scope jsonb (expand-only, no backfill, no NOT NULL flip, no GRANT change — column inherits S02/S04 wall).

Verified-green: go test ./kernel/scope/ 7.186s GREEN (8 property tests incl Testcontainers migration_roundtrip: nullable/expand-only + scope round-trip + AgentRoleSelectOnly INSERT permission-denied = wall); gofmt/vet/build ./... clean; prior green intact (records 7.96s + authority 7.89s). Front lib/scope.ts byte-faithful twin (same enums, isGlobal⇔"*", verdict mirrors Validate) vitest 7/7 biome clean; /scopes READ-ONLY ui-completeness VACUOUS (pure verdict renderer, no truth-write, rescope via ChangeSet) e2e 5 scenarios all testids present (scope-row/verdict-badge/scope-chip/status-chip/verdict-reason/authority-badge/no-scope/tutorial/example) row-filters match scope-data labels; i18n 3441==3441 scopes ns 21==21 all page keys present nav has /scopes; docs concept+internals 3 layers docs.json:97-98 mint validate PASS pushed 0/0 vs origin/main.

OQ by-design forward-deps (NOT residual): scope not yet consumed by Policy/Operation eval / ContextRouter scope-overlap / DataTruthScope §44.3; no write-time completeness HOOK at aidos writer (this step = pure validator only); tenant + TimeWindow opaque strings (§13.7 leaves temporal type open, no tenant enum pinned — correctly left, not guessed); Linear MCP unauth (OAuth). verified-green ZERO corrections.
