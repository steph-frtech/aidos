---
name: s16-authority-graph
description: S16 AuthorityGraph §13.8 truth-qualifier — pure Decide approver/veto/escalation, veto dominates, content-addressed; verified green zero corrections
metadata:
  type: project
---

S16 AuthorityGraph §13.8 (truth QUALIFIER §13.6, NOT a truth) "remplacer l'humain par autorité explicite". PURE Decide(graph,truth,granted)→AdmissionDecision 4-branch precedence ADR0016 first-match: (1) veto dominates→blocked/VETOED (2) no-approver→blocked/MISSING_AUTHORITY_APPROVAL+how_to_fix[assign_authority,obtain_legal_approval]=THE done case (3) all approvers→admitted (4) partial→escalated→graph.escalation. TOTAL+deterministic, no DB/clock/rng/IO. Role OPEN set (only non-blank), TruthKind delegates truthtyping.IsKnownKind (§13.4 seven, single owner — no fork). BlockCode S16-local NOT runtime/blockreason enum (§9). SerializeGraphBody rides graph INSIDE content-addr body id==version==Hash(S02). 

**Verified GREEN zero corrections:** go test ./kernel/authority -count=1 5.077s (fixture 5 tests: GraphValidates+Row1 no-approval→MISSING_AUTHORITY_APPROVAL+Row2 full→admitted+Row3 +security veto→VETOED dominates+Row4 product_owner-only→escalated architecture_board; rapid 8 props Total/Deterministic/NoAdmissionWithoutAuthority/VetoDominates/RejectsOutOfEnum/ApproverVetoOverlap/EmptyApprovers/ContentAddressTieIn; Testcontainers pg16 2: RoundTrip + AgentRoleSelectOnly INSERT permission-denied=wall). gofmt/vet clean.

Migration kernel.authority_graph content-addr append-only id PK GRANT SELECT-only aidos_agent REVOKE INSERT/UPDATE/DELETE/TRUNCATE=in-DB wall, expand-only (S02 truth/layer/link untouched). Materialized fixture tests/kernel/checkout-regulatory_authority.fixture.md present (Postgres persist=S06 bootstrap exception).

Front lib/authority.ts byte-faithful twin (same 4-branch decide, same FR explanations, same howToFix) + lib/authority-data.ts CHECKOUT_REGULATORY verbatim + 4 ADMISSION_ROWS (labels match e2e filters "sans aucune approbation"/"par legal et product_owner"/"veto sécurité"/"seulement par product_owner"). vitest 10/10 270ms tsc rc=0 biome clean 7 files. /authorities READ-ONLY (qualifier written via propose→ChangeSet only) ui-completeness VACUOUS, nav wired WorkbenchHeader:83, zero truth-write grep-clean. e2e 6 specs valid testids (group approvers/veto/escalation passed DYNAMICALLY via RoleList testid prop — literal grep misses them, NOT a gap; role-chip data-role; admission-row data-decision+data-code). i18n 3441==3441 authorities 27==27.

Docs concept+internals 3 layers (Implémentation/Méta/Méta-méta) docs.json:101-102 registered, 0 ahead origin/main (pushed). OQ by-design: /goal admission-wiring=later projection / mirrors-persist=S06 / Linear-unauth. Verified-green ZERO corrections.

RE-VERIFY 2026-06-07: re-ran fresh — go test ./kernel/authority -count=1 4.877s PASS; migration GRANT SELECT-only + REVOKE INSERT/UPDATE/DELETE/TRUNCATE (lines 41-42) intact; i18n authorities 27==27 parity true; docs.json:101-102 + both mdx present; route read-only (grep finds only doc-comments "truth-writes via propose→ChangeSet", zero fetch/insert/POST); internals carries all 3 layers. Identical to prior cycle, no regression, no corrections. PASS.
