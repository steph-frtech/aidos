---
name: s116-gdpr-erasure
description: S116 GDPR export & erasure — crypto-shredding + tombstone reconciles append-only truth-store with right-to-erasure; pure write-NOTHING; cross-lang Go↔TS decision-id parity verified
metadata:
  type: project
---

S116 (§S116/E13, last app-builder step) — GDPR EXPORT (Art.20) & ERASURE (Art.17) on the
append-only truth-store. PURE COMPOSITION write-NOTHING. back/runtime/erasure (Go authority)
+ TS twin lib/erasure.ts + MCP aidos-erasure (5 tools) + /gdpr-erasure panel.

**The mechanism (grilled, real tension):** append-only + content-addressed vs right-to-erasure.
Resolution = CRYPTO-SHREDDING + TOMBSTONE. PII encrypted at rest under per-subject DEK
(PiiCipher = ciphertext + keyId, plaintext only drives Export never persisted). Erase shreds
KEY (keyId→"") + overwrites ciphertext with fixed Tombstone "☠shredded☠". PhaseDigest hashes
the STRUCTURAL projection (rowId|structure|pii:PATH markers — NEVER value/ciphertext) so it is
INVARIANT under shredding → "phase hash stays valid after erasure" is MECHANICALLY true
(verified before==after in fixture + rapid + e2e). ErasureDecision content-addressed via
records.Hash (§9 recorded never silent). Two plans: PlanAccount (hard-delete acct + all its
projects' PII, beyond S53 soft-delete) / PlanApp (emitted-app end-user data-subject right, S103
"tout PII oubliable" concrete).

**Done-crit PROVEN:** Select = deterministic scoped query (matches predicate, canonical
project,app,rowId order; single path Export+Erase share so reach is provably equal —
TestProp_ExportReachEqualsEraseReach). Export renders ALL fields plaintext (fixture acct→3
fields/2 projects). Erase → PiiVisible(subj)==false CROSS-PROJECT + CROSS-PLAN (property erases
under BOTH plans then asserts no query returns PII anywhere + export empty). PhaseHash invariant
under erasure (property + fixture). Non-erased subject untouched (scope exact, acct-2/u-7/u-8 keep
PII). PiiVisible scans EVERY cell cross-plan.

**Cross-lang parity VERIFIED independently (throwaway Go test):** Go decisionID ==
TS-equivalent sha256 of canonical body == 7b5da8c8…d85808. Go canonicalDecision emits manual
JSON {plan,subject,project,app,key_ids,row_ids,when_ref} then records.Canonicalize RE-SORTS keys
lexicographically → {app,key_ids,plan,project,row_ids,subject,when_ref} matching TS
JSON.stringify lex-key object. decisionID depends only on plan/subject/scope/keyIds/rowIds/whenRef
(NOT ciphertext) so panel "enc" stub vs Go "enc(...)" fixture both yield same id.

**Sensors:** gofmt CLEAN after 1 fix (RECURRING comment-alignment scar on
erasure_fixture_test.go header — mirror-record continuation line; gofmt -w fixes; SAME scar
S104/S109/S112). go vet clean, go test runtime/erasure+mcp/erasure green, broad go build ./...
exit0 prior-green intact. Wall grep CLEAN (only hit = "naive DELETE" in comment). MCP 5 PURE
tools (select/export/erase/phase_hash/pii_visible) all return VALUE no truth write, main_test
green.

**Front:** vitest lib/erasure.test.ts 8/8 (fast-check reproducibility+irrecoverability+phase-hash
invariance). tsc FIXED 2 NEW errors I corrected: erasure.test.ts:228/247 `let post = cells`
narrowed to fast-check literal type, reassigning applyErasure's wider Cell[] failed → annotated
`let post: Cell[] = cells` (Cell already imported). After fix erasure.test tsc clean. Remaining
tsc error = behavior-capture.test.ts:101 'Kind' PRE-EXISTING S64-S77 NOT-S116 (same as
S115/S103/S100 memory). biome clean. Panel ErasurePanel uses INLINE T object (fr/en) NOT
messages/*.json gdprErasure namespace — so "gdprErasure MISSING in messages" is NOT a defect;
nav key `gdprErasure` DOES resolve (GDPR — export & suppression / erasure). i18n fr147==en147
balanced. nav WorkbenchHeader:182 {href:/gdpr-erasure}. Playwright tests/e2e/gdpr-erasure.spec.ts
5/5 GREEN live:3000 route-200 (renders + export-all-data + erase-shreds+hash-INVARIANT+decision
+ no-query-returns-PII + cross-plan app-user-erased-account-untouched).

**Docs:** 3-layer internals (Implémentation:9/Méta:50/Méta-méta:58) docs.json:299-300 mint
validate PASS, .aidos-docs HEAD 97fdb63 == origin/main clean. ADR 0050 (crypto-shredding +
tombstone).

**OQ by-design (NOT residual):** Linear-unauth (only GitHub MCP available, no linear-server in
deferred tools — §11 best-effort OQ) / per-subject DEK lifecycle (generation/rotation/storage)
forward-dep on secret-store S91, DEK id carried per cell / landing tombstoned rows = below-line
archive write rides later persistence.

verified-green AFTER 2 corrections: 1 gofmt comment-align (RECURRING) + 1 real tsc fix
(let post:Cell[] annotation, NEW S116 not cosmetic).
