---
name: s26-curation-qd
description: S26 ArchiveCurationPolicy (keep/compress/tombstone) + QD MAP-Elites niches — pure cores, append-only DAG side tables, read-only projection
metadata:
  type: project
---

S26 = the Archive's curation policy + quality-diversity selection, both PURE.

- `curation.Curate(nodes,policy,now)→[]CurationDecision` — declared bands (KRD §44.4), precedence tombstone>keep>compress, keep conservative default; `now` is a parameter (replayable); every input node id appears exactly once (no-node-dropped/append-only); `Hashed()` reuses S01/S02 content hash (KindPhase body), never forked.
- `qd.Elites(variants)→map[niche]Variant` — MAP-Elites, one green-mirror élite per niche by max anchored fitness (ties by smaller id); red mirror NEVER promoted whatever fitness (the deterministic Judge is the mirror, anti-Goodhart); niche descriptor declared not learned; never invents niche/fitness.
- Migration `dag_curation_qd_baseline.sql`: `dag.curation_decision` (id=content-hash PK, verdict CHECK) + `dag.niche_elite` (PK (niche_key, recorded_at) ⇒ new élite = new row, append-only). Tombstone/compress = a DECISION ROW, never DELETE/DROP. Wall: agent SELECT-only, UPDATE/DELETE withheld from both roles, `aidos` writer INSERT via S20.
- Mirrors: Go fixtures + rapid properties (semantic asserts, content-address re-derived via records.Hash) + Testcontainers roundtrip (CHECK, agent INSERT/DELETE refused, append-only, prior dag.* intact) + front fast-check twin (9 tests).
- Front twin lib/archive-curation.ts mirrors Go semantics exactly; data fixture drives e2e (createOrder/discount→var-C élite; cancelOrder/refund red-only→EMPTY cell). 6 Playwright pass on port 3000. 25 i18n keys present fr+en (namespace archiveCuration; nav label under nav.*).

**Why:** read-only projection step — curation/QD are selection DECISIONS surfaced read-only; truth-writes ride S20 ChangeSet ⇒ ui-completeness vacuous on write-path (consistent with the verified-green line).

**How to apply:** OpenQuestions (node-metadata flag source from prior steps; fitness consumed not coined; compress=decision not compacted artifact; variant generation = S42 /evolve) are by-design forward-deps, NOT residual issues. Linear AID-14 = S26. Verified-green.
