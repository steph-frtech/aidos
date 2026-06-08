---
name: s20-changeset
description: S20 ChangeSet envelope verification — atomic spec+mirror, DRAFT/APPLIED/REVERTED, append-only inverse revert; verified green
metadata:
  type: project
---

S20 = the ChangeSet — Archive's temporal-axis transactional ENVELOPE (KRD §44/§98/§44.1). Verified green, ZERO corrections.

**Done-criteria (all met):** ChangeSet bundles spec_delta+mirror_delta ATOMICALLY in ONE body (content-addressed, cannot drift) across DRAFT/APPLIED/REVERTED (closed set, NO FAILED); revert applies EXACT inverse (Delta.invert add⇄remove, refine self-inverse; Revert builds new DRAFT, reverts=source.ID, source stays APPLIED — append-only, never destroyed); append-only history proven by rapid property (Revert∘Revert≡identity deltawise, distinct id, log grows).

**Core PURE** back/archive/changeset/changeset.go: Open/Apply/Revert/StampReverted/Edit/Discard total deterministic, appliedAt is ARG not time.Now (purity). id=SHA256(canonicalBody) EXCLUDES Status+AppliedAt so id stable across DRAFT→APPLIED. CompletenessFn INJECTED (wall — never reads kernel/mirrors); SpecHasMirror minimal predicate (spec⇒mirror else INCOMPLETE_CHANGESET). BlockCodes: INCOMPLETE_CHANGESET/APPLIED_IS_IMMUTABLE/NOT_DRAFT/NOT_APPLIED each how_to_fix non-empty.

**Mirrors:** fixture_test Rows A-G (B apply→APPLIED+applied_at, C incomplete→INCOMPLETE, D edit→IMMUTABLE done-case, E revert appends inverse source stays APPLIED, F apply-inverse stamps REVERTED, G discard no FAILED) authority above; property_test 6 rapid invariants authority below. commit-gate hook fault_injection_test (4): drop mirror_delta→RED INCOMPLETE, restore→green, mutate APPLIED→IMMUTABLE, bad-request fail-closed exit2. go test GREEN: archive/changeset 13.092s (incl Testcontainers migration_roundtrip TestAgentRoleSelectOnly aidos_agent INSERT→permission-denied + TestFailedStatusRefusedByCheck + TestExpandOnly prior table untouched), commit-gate 0.005s, mcp/changeset 8.830s. gofmt/vet clean.

**Migration** changesets_lifecycle_baseline.sql EXPAND-ONLY: NEW changeset_lifecycle table (status CHECK closed-3-set, applied_at-iff-committed CHECK, PK id+version append-only) + READ-ONLY VIEW changeset_envelope joining S02 body↔lifecycle stamp. aidos_agent GRANT SELECT-only REVOKE writes=wall; aidos SELECT+INSERT (no UPDATE/DELETE — append-only). S02 changesets.changeset UNTOUCHED.

**MCP** back/mcp/changeset: 6 tools open/apply/revert/discard/status/list; grep clean no kernel/mirrors/fitness write.

**Front** lib/changeset.ts byte-faithful pure twin (apply/edit/revert/stampReverted/specHasMirror) vitest 10/10; lib/changeset-data.ts canonical cs-A/cs-B fixtures; ChangeSetPanel READ-ONLY ui-complete VACUOUS (real apply via MCP/commit-gate propose→ChangeSet, NEVER screen write — grep clean); /changeset page tsc clean, biome clean 5 files. i18n changeset 39==39 keys. e2e 5/5 PASS live :3000 (envelope spec+mirror together, APPLIED+applied_at, INCOMPLETE block, APPLIED_IS_IMMUTABLE done-criterion, cs-A REVERTED lineage→cs-B inverse).

**Docs** concept+internals s20-changeset.mdx 3 layers (Implémentation/Méta/Méta-méta) docs.json:109-110, mint validate PASSED, clone 0-ahead/0-behind origin/main. ADR 0019 envelope+inverse-revert contract.

**OQ (by-design forward-deps, NOT residual):** no DAG branches/merges/stable-phase nodes (next step S22+); no red-wave/PostKernelChange firing; no /goal wiring; completeness predicate injected (honors wall, real predicate later step); Linear S20 issue Done-flip blocked — linear skill unregistered + MCP unauth (record OQ, don't fail).
