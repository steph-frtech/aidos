---
name: fk07-doc-mirror
description: §FK07 verification — the DOC-MIRROR Compare(s2,s9) structural set-comparison judge + DATA-MIRROR s3↔s7 declared
metadata:
  type: project
---

§FK07 (after FK06, FKE-1.3 décision (a)) the DOC-MIRROR Compare(human s2, derived s9 from FK06) + DATA-MIRROR(s3,s7) declared. back/kernel/mirror/docmirror PURE write-NOTHING.

**What it is:** Compare runs TWO planes, ONLY structural judges (§8 le juge est un calcul): STRUCTURAL=symmetric set-diff of 3 sets (Concepts/behaviour-IDs/Errors via diffSet→SideCodeMissing(human-not-code, doc-ahead)/SideHumanMissing(code-not-human, doc-behind)) BLOCKING; PROSE=behaviour descriptions present-on-BOTH-sides drift→ProseAdvisories ADVISORY NEVER blocks (LLM signals never arbitrates). Verdict red iff PairingMismatch(human.KernelID!=derived.KernelID) OR len(StructuralDivergences)>0; prose never enters verdict. Report content-addr Bytes=records.Canonicalize(json sans Bytes/Hash) Hash=records.Hash. DataMirror = IDENTICAL structural engine over entity/field sets ("entity:Order"/"field:Order.total") — s7 emitter owned by LATER entity/migration step, declaration NOT mock, by-design forward-dep OQ.

**Done-crit ALL PROVEN:** (1) fault-injection remove emit→s9 loses emit:createOrder:OrderCreated→RED code_missing (Go TestDocMirror_RemoveBehaviorFromCodeIsRed + Playwright code-missing + TS test); (2) edit prose only→GREEN+advisory (Go TestDocMirror_EditProseOnlyIsAdvisory + property TestCompare_ProseNeverBlocks + Playwright prose-edited); (3) property même-paire→même-verdict (Go TestCompare_SamePairSameVerdict: deterministic Hash/Bytes + INVARIANT under reordering both sides via shuffle, rapid). Go authoritative reproducibility mirror.

**Sensors:** gofmt CLEAN vet clean go test docmirror+mcp green PROPERTY -count=2 -rapid.checks=3000 1.585s NOT-flaky (run from PKG dir scar); broad build ./... exit0; prior-green derivedoc(FK06)/operation/control/action intact; WALL grep CLEAN (kernel/fitness hits only comments + kernel-pkg imports to BUILD docs, no INSERT/Exec/pgx). MCP aidos-docmirror 2 PURE tools doc_mirror(can derive s9 on the fly)+data_mirror read-only.

**TS twin** front/web/lib/docmirror.ts Go-authoritative mirrors-faithfully (diffSet/proseDrift/sortDivergences identical); vitest 5/5 → I ADDED 6th fast-check property (same-pair→same-verdict + order-invariant) to fix unused `fc` import AND honor twin's "carries own reproducibility property" docstring claim. tsc only PRE-EXISTING behavior-capture.test:101 'Kind' (S64-S77, confirmed every FK step). biome: unused-fast-check-import FIXED by my property; 2 remaining noNonNullAssertion warnings (test-only lines operations![0]/behaviors![0], non-blocking, exit0). i18n fr5208==en5208 docMirror+nav docMirrorNav both langs. /doc-mirror action-capable useActionState COMPARER bound to compare twin, writesTruth ABSENT (pure read-only projection CORRECT — Report below waterline not truth, no propose→ChangeSet needed). testids scenario-select/compare-submit/verdict-badge/determinism-badge/structural-empty/divergence(data-plane/section/key/side) ALL match e2e; scenario ids aligned/code-missing/prose-edited match. next build ƒ /doc-mirror present. Playwright 4/4 RAN GREEN live:3000 (7.0s) incl fault-injection + prose-advisory.

**Docs** 3-layer Implémentation:9/Méta:30/Méta-méta:40 docs.json:467-468 mint validate PASS HEAD 7dd35a2==origin/main pushed.

**OQ by-design:** Linear-unauth (only authenticate/complete surfaced); s7 real emitter = later entity/migration step (DataMirror declared not mocked); reindex-lag.

**Verdict: verified-green AFTER 1 correction** — added genuine fast-check reproducibility property to TS twin (fixes unused-import biome failure + makes twin's own-property claim honest). RECURRING: executor imports fast-check in TS test but writes only example-based tests → unused-import biome failure; the twin SHOULD carry its own property mirror (same pattern worth watching every FK twin).
