---
name: s26-curation-qd
description: S26 ArchiveCurationPolicy (keep/compress/tombstone §44.4) + QD niches MAP-Elites (§62/§123) — verified-green verdict
metadata:
  type: project
---

S26 = ArchiveCurationPolicy keep/compress/tombstone (§44.4) + QD niches MAP-Elites (§62/§123). verification_status=passed, ZERO corrections.

curation.go PURE Curate(nodes,policy,now)->[]CurationDecision; now=PARAM no clock; precedence tombstone>keep>compress, conservative keep default; tombstone/compress=DECISION ROW never delete (append-only §12); every input node EXACTLY once (findDecision count==1); DefaultPolicy materializes §44.4 bands verbatim never coined; decision.Hashed reuses S02 records.Canonicalize+records.Hash through KindPhase body NOT forked. qd.go PURE Elites->one green-mirror élite per niche by MAX anchored fitness, ties smaller id; red-mirror NEVER promoted WHATEVER fitness (mirror is Judge never score never CellVitality); empty cell for red-only niche.

DONE-CRIT all met: unsafe=>tombstone+still-present (var-7), stable_phase+pareto_elite=>keep, failed>30d=>compress, content-addr id==Hash(Canon(body)) recomputed independently; green-mirror=>élite, red-higher-fitness=>NOT promoted.

go test green; migration Testcontainers ran fresh 11.79s GREEN (VerdictCheck refuses purge, AgentRoleSelectOnly INSERT+DELETE permission-denied, NicheElite append-only 2-rows current=latest, ExpandOnly prior dag.stable_phase untouched, WriterRoleCanInsert). gofmt/vet clean.

migration dag.curation_decision(id PK content-addr, verdict CHECK keep|compress|tombstone)+dag.niche_elite(PK (niche_key,recorded_at)=new élite NEW ROW never UPDATE); agent SELECT-only REVOKE all writes both tables; aidos writer SELECT+INSERT only; prior S02/S23 untouched. NO DELETE/DROP on DAG node.

front lib/archive-curation.ts byte-faithful twin; lib/archive-curation-data.ts (NOT in report files_changed but load-bearing - e2e anchors var-C élite createOrder/discount 0.9>var-A0.8, cancelOrder/refund red-only EMPTY, applyTax/eu filled). vitest 9/9, tsc rc=0, biome clean 5. Panel READ-ONLY action-capable (runs pure curate()/nicheGrid()). e2e 6 tests testids match. nav WorkbenchHeader:117. i18n 3441==3441 archiveCuration 25==25.

Badge raw-palette emerald/amber/zinc = established pattern NOT ADR0010 viol (S21 precedent).

docs 3 layers internals; docs.json:121-122; mint validate PASSED; .aidos-docs 0-ahead pushed tree-clean.

OQ by-design (NOT residual): Linear MCP unauth/variant-generation=later /evolve/fitness+niche-grammar consumed-declared/compress=decision-not-artifact/recording rides S20 ChangeSet. verified-green ZERO corrections.
