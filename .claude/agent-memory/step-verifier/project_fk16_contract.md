---
name: fk16-contract
description: §FK16 verification — CONTRACT half of E0-E7 migration (FKE-16 expand-contract), the LAST FK-track step; bascule mirrors/panels/docs to E0-E7, N deprecated via lifecycle never deleted; verified-green ZERO corrections
metadata:
  type: project
---

§FK16 (after FK05 the EXPAND half; LAST FK-track step "strictement en dernier" touches frozen-proven mirrors corpus) the CONTRACT half of the E0-E7 evidence migration (FKE-16, expand-contract). FK05 forward-dep OQ ("schema-switch FK16-post-S117") now CLOSED by FK16. back/kernel/mirror/contracte PURE write-NOTHING.

**Core**: CertToE/KindToE CLOSED DECLARED tables (cert: gherkin/xstate→E3, fast-check/rapid/k6→E5, zod/type-check→E1, pact/fixture→E3, snapshot/unit→E2, prose→E0; kind: acceptance/e2e/fixture/contract→E3, property→E5, schema→E1, unit/snapshot→E2, meter→E6). MirrorE = MAX(CertToE,KindToE) EXCEPT non-executable cert (prose, !IsExecutable)→E0 regardless of kind (KRD §805). PURE/TOTAL (unknown→E0 floor never panic)/DETERMINISTIC. NLifecycle{active,deprecated} Deprecate MONOTONE+idempotent (always returns NDeprecated, never reverses/deletes). Relabel(corpus)→[]MirrorTag preserves order, each tag {MirrorID, N preserved verbatim, NLifecycle=Deprecated, E derived, EName}. NoLoss predicate COMPUTED (same count/ids/order + N never empty + lifecycle deprecated). EHistogram zero-filled E0..E7 map. ELevels canonical.

**4 done-crit PROVEN**: (1) zéro perte/chaque miroir N porte son E — property TestProp_Relabel_NoLoss (∀ corpus NoLoss holds + N preserved at each i) + Testcontainers DB PARITY (real Postgres, applies actual migration, backfilled evidence_level == Go MirrorE for EVERY row, n_lifecycle=deprecated, test_kind/cert_language columns survive, seen==count); (2) panels rendent E — /proof-levels E0-E7 ladder + action-capable basculeAction, e2e 4/4 live:3000 3.4s (ladder e-level-0..7 / throw switch→NoLoss + tag-e-m-invariant=E5/m-journey=E3/m-prose=E0 + tag-row deprecated N1 + hist-5 + custom JSON corpus meter/k6→E6 + legacy N0-N5 toggle anti-overwrite); (3) aidos check vert (S03 stub exit0, real replay=S45 KRDCompiler forward-dep OQ) + go build ./... exit0; (4) docs Mintlify two pages + docs.json:487-488 + mint validate PASS HEAD 1168d1b==origin/main pushed.

**Verified-green**: gofmt CLEAN (no scar), vet exit0, go test contracte -count=2 -rapid.checks=2000 PASS 5.6s, DB test TestDB_Backfill_Parity RAN against real postgres:16-alpine PASS 3.4s (Docker available). broad go build ./... exit0. WALL grep CLEAN (no pgx/INSERT/UPDATE/Exec in contracte.go; migration GRANT SELECT-only + REVOKE INSERT/UPDATE/DELETE/TRUNCATE; ADD COLUMN IF NOT EXISTS idempotent, no DROP/DELETE, append-only). prior-green prooftype+records intact.

**Migration** mirror_evidence_level_contract.sql expand-contract gated DataTruthScope: ADD evidence_level (E0..E7 CHECK, default E0 non-blocking) + n_lifecycle (active|deprecated CHECK), backfill = SQL CASE replicating MirrorE byte-for-byte (prose→0 else GREATEST(certRank,kindRank)) + flip n_lifecycle deprecated. Idempotent. Baseline migration columns (reflects_layer_id/reflects_version/authority/liveness/content_hash/version) verified present for DB-test INSERT.

**MCP** aidos-prooftype-contract 3 PURE write-nothing tools (mirror_e/relabel/histogram) main_test green. **TS twin** lib/contracte Go-authoritative, vitest 6/6 (incl fast-check reproducibility). Panel /proof-levels actions.ts basculeAction PURE writesTruth-ABSENT (read-only derivation correct — schema switch is the gated migration). corpus.ts default {m-journey gherkin→E3, m-invariant property→E5, m-prose prose→E0} matches e2e. i18n fr164==en164 proofLevels 15==15.

**Docs** concept(5423B)+internals(7358B 3-layer Implémentation:9/Méta:58/Méta-méta:68) docs.json:487-488 mint validate PASS HEAD 1168d1b==origin/main pushed.

OQ by-design (NOT residual): Linear MCP unauth (only authenticate/complete exposed — FK16 issue not flipped); aidos check real red-set replay = S45 KRDCompiler forward-dep; real mirrors Postgres schema above-the-line, migration applied by privileged aidos role via ChangeSet (proven on Testcontainers disposable PG, bootstrap §6); pre-existing front behavior-capture.test.ts TS error 'Kind' (S64-S77, untouched by FK16, out of scope).

verified-green ZERO corrections. NOTE executor's report fully accurate — DB parity test genuinely runs (Docker present), all testids match, docs pushed, wall clean.
