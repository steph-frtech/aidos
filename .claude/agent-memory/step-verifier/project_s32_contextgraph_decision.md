---
name: s32-contextgraph-decision
description: S32 ContextGraphDecision §119.2 deterministic LLM-free reuse gate over 4 declared dims — verification facts
metadata:
  type: project
---

S32 = ContextGraphDecision (KRD §119.2) the DETERMINISTIC LLM-FREE reuse GATE over an already-built ContextGraph (does NOT build graph / compile ContextPack / promote memory). PURE `Decide(candidate,request,now)` (clock injected, no I/O/network/LLM) false-dominant over EXACTLY 4 declared dims in canonical order time→scope→authority→conditions. Verdict {may_reuse,reason,checked[],required_human_review}. REUSES S15 scope.TruthScope (scopeContains=superset/no_reuse_outside_scope, candidate "" or "*"=wildcard), S16 authority.AuthorityGraph (domain/truthkind mismatch→required_human_review NOT flat block), S01/S02 records.Canonicalize/Hash for content-addr id (kind="context_graph_decision", id EXCLUDED from body). Condition=declared equality Key==Equals over request.Facts, missing fact=false (richer predicate later tooth).

DONE-CRIT all met: expired⇒may_reuse=false time-checked (fixture Row1) + out-of-scope⇒false scope-checked (Row2) = the exact criterion. NOTE §13.4 TruthKind enum: fixtures use "behavioral" NOT "derived" (corrected Jun1 — "derived" not in enum).

TESTS GREEN re-run: go test ./archive/brain/contextgraph 9.3s 16/16 (6 fixture Rows incl ID-is-content-hash + 6 rapid Deterministic/ExpiredNever/OutOfScopeNever/TrueImpliesAllFour/NeverInvents/NeverPanics + 4 Testcontainers DecisionRowRoundTrips/InventedDimensionRefused/TrueWithoutAllFourRefused/AgentRoleIsSelectOnly); gofmt/vet clean; vitest lib/contextgraph.test.ts 5/5; biome 4 S32 front files clean.

MIGRATION context_graph_decision_baseline.sql EXPAND-ONLY: NEW schema context + table context.context_graph_decision content-addr PK append-only, 3 CHECK (checked ⊆ 4-dim / may_reuse⇒all-four-checked / NOT(reuse∧review)). WALL: context is TRUTH ABOVE waterline (unlike brain below-line) — GRANT SELECT only to aidos_agent, REVOKE I/U/D/T+CREATE, re-asserts REVOKE on kernel/mirrors/fitness. Decision=ROW never UPDATE; writes via aidos writer + S20 ChangeSet.

FRONT: lib/contextgraph.ts = byte-faithful TS twin (same 4 predicates same order same false-dominance, now passed in). contextgraph-data.ts (LEDGER+LEDGER_NOW, NOT in report files_changed but load-bearing e2e anchors — present). DecisionReusePanel action-capable (DÉCIDER runs pure twin, READ-ONLY vs truth=wall correct). page.tsx getTranslations("decisionReuse") 28 labels. e2e decision-reuse.spec.ts 4 scenarios testids match (decision-reuse-panel/ledger-row/run-decide/verdict-badge[data-verdict]/dimension-chip[data-dimension,data-state]/needs-review-flag). i18n decisionReuse fr 28 == en 28.

DOCS 3-layer internals (Couche1 Implémentation:9 / Couche2 Méta:55 / Couche3 Méta-méta:63) + concept page, docs.json:133-134, .aidos-docs clean 0-ahead/0-behind origin/main.

OQ by-design: ContextRouter/ContextPack compiler §119.3/§141-142=later (consumes this verdict)=NEXT step; MemoryFirewall promotion §119.1=S30 (done); richer Condition predicate language=later; Linear-server MCP unauth (OAuth+restart needed). verified-green ZERO corrections (re-verification of prior interrupted build; no files changed by executor or verifier).
